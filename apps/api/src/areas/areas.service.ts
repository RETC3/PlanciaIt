import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, schema, sql, type Database, type DbExecutor } from '@planciait/db';
import type {
  AreaMember,
  AreaPermission,
  AreaSummary,
  CreateAreaRequest,
  CurrentUser,
  UpdateAreaRequest,
} from '@planciait/shared';
import { AuditService, type AuditEntry } from '../audit/audit.service.js';
import type { ClientInfo, ResolvedSession } from '../auth/session.service.js';
import { AreaAccessService } from '../common/access/area-access.service.js';
import { isUniqueViolation } from '../common/database-errors.js';
import { DATABASE } from '../database/database.module.js';
import { userStatus } from '../users/user-summary.js';

type AreaRow = typeof schema.areas.$inferSelect;
type UserRow = typeof schema.users.$inferSelect;

function toAreaSummary(area: AreaRow, permission: AreaPermission): AreaSummary {
  return {
    id: area.id,
    name: area.name,
    description: area.description,
    permission,
    createdAt: area.createdAt.toISOString(),
  };
}

function toAreaMember(user: UserRow, permission: AreaPermission): AreaMember {
  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    status: userStatus(user),
    permission,
  };
}

const byName = asc(sql`lower(${schema.areas.name})`);

/** Areas and their members. Only administrators change them; see AreasController. */
@Injectable()
export class AreasService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly access: AreaAccessService,
    private readonly audit: AuditService,
  ) {}

  /** Every area for administrators; only the assigned ones for technicians. */
  async list(user: CurrentUser): Promise<AreaSummary[]> {
    if (user.role === 'admin') {
      const rows = await this.database.db.select().from(schema.areas).orderBy(byName);
      return rows.map((row) => toAreaSummary(row, 'write'));
    }
    const rows = await this.database.db
      .select({ area: schema.areas, permission: schema.areaMembers.permission })
      .from(schema.areas)
      .innerJoin(
        schema.areaMembers,
        and(eq(schema.areaMembers.areaId, schema.areas.id), eq(schema.areaMembers.userId, user.id)),
      )
      .orderBy(byName);
    return rows.map((row) => toAreaSummary(row.area, row.permission));
  }

  async get(user: CurrentUser, id: string): Promise<AreaSummary> {
    const permission = await this.access.require(user, id, 'read');
    return toAreaSummary(await this.requireArea(id), permission);
  }

  async create(
    actor: ResolvedSession,
    request: CreateAreaRequest,
    client: ClientInfo,
  ): Promise<AreaSummary> {
    try {
      const area = await this.database.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(schema.areas)
          .values({ name: request.name, description: request.description ?? null })
          .returning();
        if (!row) throw new Error('Area insert returned no row');
        await this.record(tx, actor, client, row.id, 'area.created', { name: row.name });
        return row;
      });
      return toAreaSummary(area, 'write');
    } catch (error) {
      throw this.nameConflict(error);
    }
  }

  async update(
    actor: ResolvedSession,
    id: string,
    request: UpdateAreaRequest,
    client: ClientInfo,
  ): Promise<AreaSummary> {
    const area = await this.requireArea(id);
    try {
      const updated = await this.database.db.transaction(async (tx) => {
        const [row] = await tx
          .update(schema.areas)
          .set({ name: request.name, description: request.description })
          .where(eq(schema.areas.id, area.id))
          .returning();
        if (!row) throw new NotFoundException('Area not found');
        if (row.name !== area.name) {
          await this.record(tx, actor, client, row.id, 'area.updated', {
            field: 'name',
            from: area.name,
            to: row.name,
          });
        }
        if (row.description !== area.description) {
          await this.record(tx, actor, client, row.id, 'area.updated', { field: 'description' });
        }
        return row;
      });
      return toAreaSummary(updated, 'write');
    } catch (error) {
      throw this.nameConflict(error);
    }
  }

  /** Removes the area and its memberships. */
  async remove(actor: ResolvedSession, id: string, client: ClientInfo): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const [members] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.areaMembers)
        .where(eq(schema.areaMembers.areaId, id));
      const [row] = await tx.delete(schema.areas).where(eq(schema.areas.id, id)).returning();
      if (!row) throw new NotFoundException('Area not found');
      await this.record(tx, actor, client, row.id, 'area.deleted', {
        name: row.name,
        memberCount: members?.count ?? 0,
      });
    });
  }

  async listMembers(areaId: string): Promise<AreaMember[]> {
    await this.requireArea(areaId);
    const rows = await this.database.db
      .select({ user: schema.users, permission: schema.areaMembers.permission })
      .from(schema.areaMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.areaMembers.userId))
      .where(eq(schema.areaMembers.areaId, areaId))
      .orderBy(asc(schema.users.username));
    return rows.map((row) => toAreaMember(row.user, row.permission));
  }

  /** Adds a technician to the area, or changes their permission. */
  async setMember(
    actor: ResolvedSession,
    areaId: string,
    userId: string,
    permission: AreaPermission,
    client: ClientInfo,
  ): Promise<AreaMember> {
    await this.requireArea(areaId);
    const [user] = await this.database.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'technician') {
      // Administrators already have full access to every area.
      throw new BadRequestException('Only technicians can be added to an area');
    }

    const membership = and(
      eq(schema.areaMembers.areaId, areaId),
      eq(schema.areaMembers.userId, userId),
    );
    try {
      await this.database.db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ permission: schema.areaMembers.permission })
          .from(schema.areaMembers)
          .where(membership)
          .for('update');
        if (!existing) {
          await tx.insert(schema.areaMembers).values({ areaId, userId, permission });
          await this.record(tx, actor, client, areaId, 'area.member_added', {
            userId,
            permission,
          });
        } else if (existing.permission !== permission) {
          await tx.update(schema.areaMembers).set({ permission }).where(membership);
          await this.record(tx, actor, client, areaId, 'area.member_permission_changed', {
            userId,
            from: existing.permission,
            to: permission,
          });
        }
      });
    } catch (error) {
      // Two concurrent additions of the same member: the loser gets a 409 and may retry.
      if (isUniqueViolation(error)) throw new ConflictException('Membership changed concurrently');
      throw error;
    }
    return toAreaMember(user, permission);
  }

  async removeMember(
    actor: ResolvedSession,
    areaId: string,
    userId: string,
    client: ClientInfo,
  ): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .delete(schema.areaMembers)
        .where(and(eq(schema.areaMembers.areaId, areaId), eq(schema.areaMembers.userId, userId)))
        .returning();
      if (!row) throw new NotFoundException('Member not found');
      await this.record(tx, actor, client, areaId, 'area.member_removed', {
        userId,
        permission: row.permission,
      });
    });
  }

  private async requireArea(id: string): Promise<AreaRow> {
    const [area] = await this.database.db
      .select()
      .from(schema.areas)
      .where(eq(schema.areas.id, id))
      .limit(1);
    if (!area) throw new NotFoundException('Area not found');
    return area;
  }

  private nameConflict(error: unknown): unknown {
    return isUniqueViolation(error) ? new ConflictException('Area name already exists') : error;
  }

  private async record(
    tx: DbExecutor,
    actor: ResolvedSession,
    client: ClientInfo,
    areaId: string,
    action: AuditEntry['action'],
    details?: AuditEntry['details'],
  ): Promise<void> {
    await this.audit.record(
      {
        action,
        actorUserId: actor.user.id,
        ipAddress: client.ipAddress,
        targetType: 'area',
        targetId: areaId,
        details,
      },
      tx,
    );
  }
}
