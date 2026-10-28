import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, lt, schema, sql, type Database } from '@planciait/db';
import { DATABASE } from '../database/database.module.js';

export const IP_WINDOW_MINUTES = 15;
export const IP_MAX_FAILURES = 20;
export const USER_MAX_FAILURES = 5;
export const USER_LOCK_MINUTES = 15;
/** Failure rows older than this are pruned. */
const RETENTION_HOURS = 24;

/**
 * Brute-force protection, stored in PostgreSQL so it survives restarts:
 * a per-IP failure budget and a temporary per-account lock.
 */
@Injectable()
export class LoginThrottleService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  /** Throws 429 when the address has used up its failure budget. */
  async assertIpAllowed(ipAddress: string): Promise<void> {
    const since = new Date(Date.now() - IP_WINDOW_MINUTES * 60_000);
    const [row] = await this.database.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.authFailures)
      .where(
        and(
          eq(schema.authFailures.ipAddress, ipAddress),
          gt(schema.authFailures.occurredAt, since),
        ),
      );
    if ((row?.count ?? 0) >= IP_MAX_FAILURES) {
      throw new HttpException('Too many attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async recordIpFailure(ipAddress: string): Promise<void> {
    await this.database.db.insert(schema.authFailures).values({ ipAddress });
    const cutoff = new Date(Date.now() - RETENTION_HOURS * 3_600_000);
    await this.database.db
      .delete(schema.authFailures)
      .where(lt(schema.authFailures.occurredAt, cutoff));
  }

  isLocked(lockedUntil: Date | null): boolean {
    return lockedUntil !== null && lockedUntil.getTime() > Date.now();
  }

  /** Counts a failed password or MFA attempt; returns true if the account just got locked. */
  async recordUserFailure(userId: string): Promise<boolean> {
    const reachesLimit = sql`${schema.users.failedLoginCount} + 1 >= ${USER_MAX_FAILURES}`;
    const [row] = await this.database.db
      .update(schema.users)
      .set({
        failedLoginCount: sql`case when ${reachesLimit} then 0 else ${schema.users.failedLoginCount} + 1 end`,
        lockedUntil: sql`case when ${reachesLimit} then now() + make_interval(mins => ${USER_LOCK_MINUTES}) else ${schema.users.lockedUntil} end`,
      })
      .where(eq(schema.users.id, userId))
      .returning({ lockedUntil: schema.users.lockedUntil });
    return row !== undefined && this.isLocked(row.lockedUntil);
  }

  async resetUser(userId: string): Promise<void> {
    await this.database.db
      .update(schema.users)
      .set({ failedLoginCount: 0, lockedUntil: null })
      .where(eq(schema.users.id, userId));
  }
}
