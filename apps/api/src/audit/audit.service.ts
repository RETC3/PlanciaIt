import { Inject, Injectable } from '@nestjs/common';
import { schema, type Database, type DbExecutor } from '@planciait/db';
import { DATABASE } from '../database/database.module.js';

export type AuditAction =
  | 'auth.setup_completed'
  | 'auth.login_succeeded'
  | 'auth.login_failed'
  | 'auth.mfa_failed'
  | 'auth.mfa_enrolled'
  | 'auth.backup_code_used'
  | 'auth.account_locked'
  | 'auth.logout'
  | 'user.created'
  | 'user.updated'
  | 'user.role_changed'
  | 'user.deactivated'
  | 'user.reactivated'
  | 'user.invitation_issued'
  | 'user.invitation_accepted'
  | 'user.mfa_reset'
  | 'area.created'
  | 'area.updated'
  | 'area.deleted'
  | 'area.member_added'
  | 'area.member_permission_changed'
  | 'area.member_removed'
  | 'asset_type.created'
  | 'asset_type.updated'
  | 'asset_type.deleted'
  | 'asset.created'
  | 'asset.updated'
  | 'asset.moved'
  | 'asset.deleted'
  | 'asset.imported'
  | 'relation.created'
  | 'relation.deleted';

export interface AuditEntry {
  action: AuditAction;
  actorUserId?: string | null;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  /** Non-sensitive context only: never secrets, tokens, codes or vault content. */
  details?: Record<string, string | number | boolean | null>;
}

/** Append-only: the table rejects UPDATE and DELETE at the database level. */
@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  /** Pass `tx` to write the entry in the same transaction as the audited change. */
  async record(entry: AuditEntry, tx: DbExecutor = this.database.db): Promise<void> {
    await this.recordMany([entry], tx);
  }

  /** Several entries in one statement, e.g. one per asset of an import. */
  async recordMany(entries: AuditEntry[], tx: DbExecutor = this.database.db): Promise<void> {
    if (entries.length === 0) return;
    await tx.insert(schema.auditLog).values(
      entries.map((entry) => ({
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        ipAddress: entry.ipAddress ?? null,
        details: entry.details ?? {},
      })),
    );
  }
}
