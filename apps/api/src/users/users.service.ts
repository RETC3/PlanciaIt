import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { asc, eq, schema, type Database, type DbExecutor } from '@planciait/db';
import type {
  CreateUserRequest,
  InvitationResponse,
  UpdateUserRequest,
  UserSummary,
} from '@planciait/shared';
import { AuditService, type AuditEntry } from '../audit/audit.service.js';
import { SessionService, type ClientInfo, type ResolvedSession } from '../auth/session.service.js';
import { isUniqueViolation } from '../common/database-errors.js';
import { DATABASE } from '../database/database.module.js';
import { createInvitation, invitationResetValues } from './invitation.js';
import { toUserSummary } from './user-summary.js';

type UserRow = typeof schema.users.$inferSelect;

/** Administrator operations on user accounts. Users are deactivated, never deleted. */
@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<UserSummary[]> {
    const rows = await this.database.db
      .select()
      .from(schema.users)
      .orderBy(asc(schema.users.username));
    const now = Date.now();
    return rows.map((row) => toUserSummary(row, now));
  }

  async get(id: string): Promise<UserSummary> {
    return toUserSummary(await this.requireUser(id));
  }

  /** Creates the account in the "invited" state and returns the one-time invitation. */
  async create(
    actor: ResolvedSession,
    request: CreateUserRequest,
    client: ClientInfo,
  ): Promise<InvitationResponse> {
    const invitation = await createInvitation();
    try {
      const user = await this.database.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(schema.users)
          .values({
            username: request.username,
            displayName: request.displayName,
            role: request.role,
            invitationTokenHash: invitation.tokenHash,
            invitationExpiresAt: invitation.expiresAt,
          })
          .returning();
        if (!row) throw new Error('User insert returned no row');
        await this.record(tx, actor, client, row, 'user.created', {
          username: row.username,
          role: row.role,
        });
        await this.record(tx, actor, client, row, 'user.invitation_issued');
        return row;
      });
      return {
        user: toUserSummary(user),
        invitationToken: invitation.token,
        invitationExpiresAt: invitation.expiresAt.toISOString(),
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Username already exists');
      }
      throw error;
    }
  }

  async update(
    actor: ResolvedSession,
    id: string,
    request: UpdateUserRequest,
    client: ClientInfo,
  ): Promise<UserSummary> {
    const user = await this.requireUser(id);
    const isSelf = user.id === actor.user.id;
    // An administrator cannot lock themselves out; since nobody can demote or
    // deactivate themselves, at least one active administrator always remains.
    if (isSelf && request.role !== undefined && request.role !== user.role) {
      throw new BadRequestException('You cannot change your own role');
    }
    if (isSelf && request.isActive === false) {
      throw new BadRequestException('You cannot deactivate yourself');
    }

    const updated = await this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(schema.users)
        .set({
          displayName: request.displayName,
          role: request.role,
          isActive: request.isActive,
          // Reactivation also clears a pending brute-force lock.
          ...(request.isActive === true && !user.isActive
            ? { failedLoginCount: 0, lockedUntil: null }
            : {}),
        })
        .where(eq(schema.users.id, user.id))
        .returning();
      if (!row) throw new NotFoundException();

      if (row.displayName !== user.displayName) {
        await this.record(tx, actor, client, row, 'user.updated', {
          field: 'displayName',
        });
      }
      if (row.role !== user.role) {
        // Administrators see every area, so memberships would only linger and
        // come back to life on a later demotion: drop them on promotion.
        const removed =
          row.role === 'admin'
            ? await tx
                .delete(schema.areaMembers)
                .where(eq(schema.areaMembers.userId, row.id))
                .returning({ areaId: schema.areaMembers.areaId })
            : [];
        await this.record(tx, actor, client, row, 'user.role_changed', {
          from: user.role,
          to: row.role,
          areaMembershipsRemoved: removed.length,
        });
        // Sessions read the role on every request, so the change applies at once.
      }
      if (row.isActive !== user.isActive) {
        await this.record(
          tx,
          actor,
          client,
          row,
          row.isActive ? 'user.reactivated' : 'user.deactivated',
        );
        if (!row.isActive) {
          await this.sessions.revokeAllForUser(row.id, tx);
        }
      }
      return row;
    });
    return toUserSummary(updated);
  }

  /**
   * Issues a new invitation. The user's master password and MFA are discarded,
   * so this is also how a user who forgot the master password gets back in.
   */
  async reissueInvitation(
    actor: ResolvedSession,
    id: string,
    client: ClientInfo,
  ): Promise<InvitationResponse> {
    const user = await this.requireUser(id);
    this.rejectSelf(actor, user, 'You cannot reset your own access');
    const invitation = await createInvitation();
    const updated = await this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(schema.users)
        .set(invitationResetValues(invitation))
        .where(eq(schema.users.id, user.id))
        .returning();
      if (!row) throw new NotFoundException();
      await tx.delete(schema.mfaBackupCodes).where(eq(schema.mfaBackupCodes.userId, row.id));
      await this.sessions.revokeAllForUser(row.id, tx);
      await this.record(tx, actor, client, row, 'user.invitation_issued', {
        credentialsReset: user.authKeyHash !== null,
      });
      return row;
    });
    return {
      user: toUserSummary(updated),
      invitationToken: invitation.token,
      invitationExpiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /** Removes the authenticator and backup codes; the user enrolls again at next login. */
  async resetMfa(actor: ResolvedSession, id: string, client: ClientInfo): Promise<UserSummary> {
    const user = await this.requireUser(id);
    this.rejectSelf(actor, user, 'You cannot reset your own MFA');
    if (user.totpEnabledAt === null) {
      throw new BadRequestException('MFA is not configured for this user');
    }
    const updated = await this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .update(schema.users)
        .set({ totpSecretEncrypted: null, totpEnabledAt: null, totpLastStep: null })
        .where(eq(schema.users.id, user.id))
        .returning();
      if (!row) throw new NotFoundException();
      await tx.delete(schema.mfaBackupCodes).where(eq(schema.mfaBackupCodes.userId, row.id));
      await this.sessions.revokeAllForUser(row.id, tx);
      await this.record(tx, actor, client, row, 'user.mfa_reset');
      return row;
    });
    return toUserSummary(updated);
  }

  private async requireUser(id: string): Promise<UserRow> {
    const [user] = await this.database.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private rejectSelf(actor: ResolvedSession, user: UserRow, message: string): void {
    if (actor.user.id === user.id) {
      throw new BadRequestException(message);
    }
  }

  private async record(
    tx: DbExecutor,
    actor: ResolvedSession,
    client: ClientInfo,
    target: UserRow,
    action: AuditEntry['action'],
    details?: AuditEntry['details'],
  ): Promise<void> {
    await this.audit.record(
      {
        action,
        actorUserId: actor.user.id,
        ipAddress: client.ipAddress,
        targetType: 'user',
        targetId: target.id,
        details,
      },
      tx,
    );
  }
}
