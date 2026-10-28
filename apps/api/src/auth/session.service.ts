import { Inject, Injectable } from '@nestjs/common';
import { generateToken, hashSecret } from '@planciait/crypto';
import { eq, schema, type Database, type DbExecutor } from '@planciait/db';
import type { CurrentUser, SessionStage } from '@planciait/shared';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';

export const SESSION_COOKIE = 'planciait_session';

/** Sessions waiting for MFA are short-lived. */
const PENDING_SESSION_MINUTES = 10;
/** Avoids a write on every request just to refresh lastSeenAt. */
const TOUCH_INTERVAL_MS = 60_000;

export interface ResolvedSession {
  id: string;
  stage: SessionStage;
  expiresAt: Date;
  user: CurrentUser;
}

export interface NewSession {
  /** Goes into the cookie only; the database keeps its digest. */
  token: string;
  expiresAt: Date;
}

export interface ClientInfo {
  ipAddress: string;
  userAgent: string | null;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(
    userId: string,
    stage: SessionStage,
    client: ClientInfo,
    tx: DbExecutor = this.database.db,
  ): Promise<NewSession> {
    const token = await generateToken();
    const lifetimeMs =
      stage === 'authenticated'
        ? this.config.sessionMaxHours * 3_600_000
        : PENDING_SESSION_MINUTES * 60_000;
    const expiresAt = new Date(Date.now() + lifetimeMs);
    await tx.insert(schema.sessions).values({
      userId,
      tokenHash: await hashSecret(token),
      stage,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
      expiresAt,
    });
    return { token, expiresAt };
  }

  /**
   * Replaces a session with a new one (new token) at another stage, so a
   * token seen before MFA can never become an authenticated one.
   */
  async rotate(
    sessionId: string,
    userId: string,
    stage: SessionStage,
    client: ClientInfo,
    tx: DbExecutor = this.database.db,
  ): Promise<NewSession> {
    await tx.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
    return this.create(userId, stage, client, tx);
  }

  /** Returns the live session for a cookie token, or null (expired sessions are removed). */
  async resolve(token: string): Promise<ResolvedSession | null> {
    const tokenHash = await hashSecret(token);
    const [row] = await this.database.db
      .select({
        id: schema.sessions.id,
        stage: schema.sessions.stage,
        lastSeenAt: schema.sessions.lastSeenAt,
        expiresAt: schema.sessions.expiresAt,
        userId: schema.users.id,
        username: schema.users.username,
        displayName: schema.users.displayName,
        role: schema.users.role,
        isActive: schema.users.isActive,
      })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .where(eq(schema.sessions.tokenHash, tokenHash))
      .limit(1);
    if (!row) return null;

    const now = Date.now();
    const idleLimitMs = this.config.sessionIdleMinutes * 60_000;
    const expired =
      row.expiresAt.getTime() <= now ||
      (row.stage === 'authenticated' && row.lastSeenAt.getTime() + idleLimitMs <= now);
    if (expired || !row.isActive) {
      await this.revoke(row.id);
      return null;
    }

    if (now - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.database.db
        .update(schema.sessions)
        .set({ lastSeenAt: new Date(now) })
        .where(eq(schema.sessions.id, row.id));
    }

    return {
      id: row.id,
      stage: row.stage,
      expiresAt: row.expiresAt,
      user: {
        id: row.userId,
        username: row.username,
        displayName: row.displayName,
        role: row.role,
      },
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.database.db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
  }

  async revokeByToken(token: string): Promise<void> {
    const tokenHash = await hashSecret(token);
    await this.database.db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash));
  }
}
