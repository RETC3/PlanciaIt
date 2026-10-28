import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
  type OnModuleInit,
} from '@nestjs/common';
import {
  decryptSecret,
  DEFAULT_KDF_MEM_LIMIT,
  DEFAULT_KDF_OPS_LIMIT,
  encryptSecret,
  fakeKdfSalt,
  generateBackupCode,
  generateToken,
  hashAuthKey,
  hashSecret,
  normalizeBackupCode,
  verifyAuthKey,
} from '@planciait/crypto';
import { and, eq, isNull, or, lt, schema, sql, type Database } from '@planciait/db';
import type {
  CurrentUser,
  LoginRequest,
  MfaConfirmRequest,
  MfaEnrollmentResponse,
  MfaVerifyRequest,
  PendingSessionResponse,
  PreloginResponse,
  SetupRequest,
} from '@planciait/shared';
import { AuditService } from '../audit/audit.service.js';
import { DATABASE } from '../database/database.module.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { SERVER_KEYS, type ServerKeys } from './server-keys.js';
import {
  SessionService,
  type ClientInfo,
  type NewSession,
  type ResolvedSession,
} from './session.service.js';
import { createTotpSecret, totpUri, verifyTotp } from './totp.js';

const BACKUP_CODE_COUNT = 10;
/** Any constant: lets the first-run check serialize concurrent setup requests. */
const SETUP_LOCK_ID = 7_201_001;

/** Same message for every failure, so responses do not reveal which part was wrong. */
const INVALID_CREDENTIALS = 'Invalid credentials';

export interface AuthResult<T> {
  body: T;
  session: NewSession;
}

type UserRow = typeof schema.users.$inferSelect;

function toCurrentUser(user: UserRow): CurrentUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}

function totpContext(userId: string): string {
  return `totp:${userId}`;
}

@Injectable()
export class AuthService implements OnModuleInit {
  /** Verified against for unknown users, so response time does not reveal them. */
  private dummyAuthKeyHash = '';

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(SERVER_KEYS) private readonly keys: ServerKeys,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottleService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyAuthKeyHash = await hashAuthKey(await generateToken());
  }

  async isSetupRequired(): Promise<boolean> {
    const [row] = await this.database.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .limit(1);
    return row === undefined;
  }

  /** First run only: creates the administrator, who must then enroll MFA. */
  async setup(
    request: SetupRequest,
    client: ClientInfo,
  ): Promise<AuthResult<PendingSessionResponse>> {
    const authKeyHash = await hashAuthKey(request.authKey);
    const session = await this.database.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${SETUP_LOCK_ID})`);
      const [existing] = await tx.select({ id: schema.users.id }).from(schema.users).limit(1);
      if (existing) {
        throw new ConflictException('Setup already completed');
      }
      const [user] = await tx
        .insert(schema.users)
        .values({
          username: request.username,
          displayName: request.displayName,
          role: 'admin',
          authKeyHash,
          kdfSalt: request.kdf.salt,
          kdfOpsLimit: request.kdf.opsLimit,
          kdfMemLimit: request.kdf.memLimit,
        })
        .returning();
      if (!user) throw new Error('User insert returned no row');

      const audit = { actorUserId: user.id, ipAddress: client.ipAddress };
      await this.audit.record({ ...audit, action: 'auth.setup_completed' }, tx);
      await this.audit.record(
        {
          ...audit,
          action: 'user.created',
          targetType: 'user',
          targetId: user.id,
          details: { username: user.username, role: user.role },
        },
        tx,
      );
      return this.sessions.create(user.id, 'mfa_enrollment', client, tx);
    });
    return { body: { stage: 'mfa_enrollment' }, session };
  }

  /** KDF parameters for the browser; unknown users get stable fake ones. */
  async prelogin(username: string, client: ClientInfo): Promise<PreloginResponse> {
    await this.throttle.assertIpAllowed(client.ipAddress);
    const user = await this.findUser(username);
    if (user) {
      return { salt: user.kdfSalt, opsLimit: user.kdfOpsLimit, memLimit: user.kdfMemLimit };
    }
    return {
      salt: await fakeKdfSalt(this.keys.fakeSalt, username),
      opsLimit: DEFAULT_KDF_OPS_LIMIT,
      memLimit: DEFAULT_KDF_MEM_LIMIT,
    };
  }

  /** First factor. Success yields a short-lived session that still requires MFA. */
  async login(
    request: LoginRequest,
    client: ClientInfo,
  ): Promise<AuthResult<PendingSessionResponse>> {
    await this.throttle.assertIpAllowed(client.ipAddress);
    const user = await this.findUser(request.username);

    if (!user || !user.isActive) {
      await verifyAuthKey(this.dummyAuthKeyHash, request.authKey);
      return this.loginFailed(client, null, { username: request.username, reason: 'unknown_user' });
    }
    if (this.throttle.isLocked(user.lockedUntil)) {
      return this.loginFailed(client, user.id, { reason: 'locked' });
    }
    if (!(await verifyAuthKey(user.authKeyHash, request.authKey))) {
      return this.userFailed(user.id, client, 'auth.login_failed', { reason: 'wrong_password' });
    }

    const stage = user.totpEnabledAt ? 'mfa_verification' : 'mfa_enrollment';
    const session = await this.sessions.create(user.id, stage, client);
    return { body: { stage }, session };
  }

  /** Starts (or restarts) TOTP enrollment for a user without MFA. */
  async startEnrollment(session: ResolvedSession): Promise<MfaEnrollmentResponse> {
    const secret = await createTotpSecret();
    const encrypted = await encryptSecret(
      secret,
      this.keys.totpEncryption,
      totpContext(session.user.id),
    );
    await this.database.db
      .update(schema.users)
      .set({ totpSecretEncrypted: encrypted, totpLastStep: null })
      .where(and(eq(schema.users.id, session.user.id), isNull(schema.users.totpEnabledAt)));
    return { secret, otpauthUri: totpUri(secret, session.user.username) };
  }

  /** Confirms enrollment with a first valid code; returns the one-time backup codes. */
  async confirmEnrollment(
    session: ResolvedSession,
    request: MfaConfirmRequest,
    client: ClientInfo,
  ): Promise<AuthResult<{ backupCodes: string[]; user: CurrentUser }>> {
    await this.throttle.assertIpAllowed(client.ipAddress);
    const user = await this.requireUser(session.user.id);
    if (this.throttle.isLocked(user.lockedUntil)) {
      return this.loginFailed(client, user.id, { reason: 'locked' });
    }
    const step = user.totpSecretEncrypted
      ? verifyTotp(await this.totpSecret(user), request.code, null)
      : null;
    if (step === null) {
      return this.userFailed(user.id, client, 'auth.mfa_failed', { stage: 'enrollment' });
    }

    const backupCodes = await Promise.all(
      Array.from({ length: BACKUP_CODE_COUNT }, () => generateBackupCode()),
    );
    const codeHashes = await Promise.all(
      backupCodes.map((code) => hashSecret(normalizeBackupCode(code))),
    );

    const newSession = await this.database.db.transaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({
          totpEnabledAt: new Date(),
          totpLastStep: step,
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        })
        .where(eq(schema.users.id, user.id));
      await tx.delete(schema.mfaBackupCodes).where(eq(schema.mfaBackupCodes.userId, user.id));
      await tx
        .insert(schema.mfaBackupCodes)
        .values(codeHashes.map((codeHash) => ({ userId: user.id, codeHash })));
      const audit = { actorUserId: user.id, ipAddress: client.ipAddress };
      await this.audit.record({ ...audit, action: 'auth.mfa_enrolled' }, tx);
      await this.audit.record(
        { ...audit, action: 'auth.login_succeeded', details: { method: 'totp' } },
        tx,
      );
      return this.sessions.rotate(session.id, user.id, 'authenticated', client, tx);
    });

    return { body: { backupCodes, user: toCurrentUser(user) }, session: newSession };
  }

  /** Second factor at login: a TOTP code or a single-use backup code. */
  async verifyMfa(
    session: ResolvedSession,
    request: MfaVerifyRequest,
    client: ClientInfo,
  ): Promise<AuthResult<{ user: CurrentUser }>> {
    await this.throttle.assertIpAllowed(client.ipAddress);
    const user = await this.requireUser(session.user.id);
    if (this.throttle.isLocked(user.lockedUntil)) {
      return this.loginFailed(client, user.id, { reason: 'locked' });
    }

    const method = 'code' in request ? 'totp' : 'backup_code';
    const accepted =
      'code' in request
        ? await this.consumeTotp(user, request.code)
        : await this.consumeBackupCode(user.id, request.backupCode);
    if (!accepted) {
      return this.userFailed(user.id, client, 'auth.mfa_failed', { method });
    }

    const newSession = await this.database.db.transaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
        .where(eq(schema.users.id, user.id));
      const audit = { actorUserId: user.id, ipAddress: client.ipAddress };
      if (method === 'backup_code') {
        await this.audit.record({ ...audit, action: 'auth.backup_code_used' }, tx);
      }
      await this.audit.record(
        { ...audit, action: 'auth.login_succeeded', details: { method } },
        tx,
      );
      return this.sessions.rotate(session.id, user.id, 'authenticated', client, tx);
    });

    return { body: { user: toCurrentUser(user) }, session: newSession };
  }

  async logout(session: ResolvedSession, client: ClientInfo): Promise<void> {
    await this.sessions.revoke(session.id);
    await this.audit.record({
      action: 'auth.logout',
      actorUserId: session.user.id,
      ipAddress: client.ipAddress,
    });
  }

  private async findUser(username: string): Promise<UserRow | undefined> {
    const [user] = await this.database.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .limit(1);
    return user;
  }

  private async requireUser(userId: string): Promise<UserRow> {
    const [user] = await this.database.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    return user;
  }

  private async totpSecret(user: UserRow): Promise<string> {
    if (!user.totpSecretEncrypted) {
      throw new Error('User has no TOTP secret');
    }
    return decryptSecret(user.totpSecretEncrypted, this.keys.totpEncryption, totpContext(user.id));
  }

  /** Valid code whose time step is newer than the last one used, recorded atomically. */
  private async consumeTotp(user: UserRow, code: string): Promise<boolean> {
    const step = verifyTotp(await this.totpSecret(user), code, user.totpLastStep);
    if (step === null) return false;
    const [updated] = await this.database.db
      .update(schema.users)
      .set({ totpLastStep: step })
      .where(
        and(
          eq(schema.users.id, user.id),
          or(isNull(schema.users.totpLastStep), lt(schema.users.totpLastStep, step)),
        ),
      )
      .returning({ id: schema.users.id });
    return updated !== undefined;
  }

  private async consumeBackupCode(userId: string, code: string): Promise<boolean> {
    const codeHash = await hashSecret(normalizeBackupCode(code));
    const [used] = await this.database.db
      .update(schema.mfaBackupCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(schema.mfaBackupCodes.userId, userId),
          eq(schema.mfaBackupCodes.codeHash, codeHash),
          isNull(schema.mfaBackupCodes.usedAt),
        ),
      )
      .returning({ id: schema.mfaBackupCodes.id });
    return used !== undefined;
  }

  /** Records a failure that is not charged to an account, then rejects. */
  private async loginFailed(
    client: ClientInfo,
    actorUserId: string | null,
    details: Record<string, string>,
  ): Promise<never> {
    await this.throttle.recordIpFailure(client.ipAddress);
    await this.audit.record({
      action: 'auth.login_failed',
      actorUserId,
      ipAddress: client.ipAddress,
      details,
    });
    throw new UnauthorizedException(INVALID_CREDENTIALS);
  }

  /** Records a failure charged to an account (may lock it), then rejects. */
  private async userFailed(
    userId: string,
    client: ClientInfo,
    action: 'auth.login_failed' | 'auth.mfa_failed',
    details: Record<string, string>,
  ): Promise<never> {
    await this.throttle.recordIpFailure(client.ipAddress);
    const locked = await this.throttle.recordUserFailure(userId);
    await this.audit.record({ action, actorUserId: userId, ipAddress: client.ipAddress, details });
    if (locked) {
      await this.audit.record({
        action: 'auth.account_locked',
        actorUserId: userId,
        ipAddress: client.ipAddress,
      });
    }
    throw new UnauthorizedException(INVALID_CREDENTIALS);
  }
}
