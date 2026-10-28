import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const userRole = pgEnum('user_role', ['admin', 'technician']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stored lowercase; uniqueness is case-insensitive by construction. */
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    role: userRole('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),

    /**
     * Argon2id hash of the auth key derived in the browser. Never a password.
     * The four credential columns are null while an invitation is pending:
     * only the invited user's browser can derive them.
     */
    authKeyHash: text('auth_key_hash'),
    kdfSalt: text('kdf_salt'),
    kdfOpsLimit: integer('kdf_ops_limit'),
    kdfMemLimit: integer('kdf_mem_limit'),

    /** BLAKE2b digest of the one-time invitation token; null once accepted. */
    invitationTokenHash: text('invitation_token_hash'),
    invitationExpiresAt: timestamp('invitation_expires_at', { withTimezone: true }),

    /** TOTP secret encrypted with a server subkey; set during enrollment. */
    totpSecretEncrypted: text('totp_secret_encrypted'),
    /** Null until enrollment is confirmed with a valid code. */
    totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
    /** Last accepted TOTP time step, to reject replayed codes. */
    totpLastStep: bigint('totp_last_step', { mode: 'number' }),

    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('users_username_key').on(table.username),
    check('users_username_lowercase', sql`${table.username} = lower(${table.username})`),
    uniqueIndex('users_invitation_token_hash_key').on(table.invitationTokenHash),
    check(
      'users_credentials_complete',
      sql`num_nulls(${table.authKeyHash}, ${table.kdfSalt}, ${table.kdfOpsLimit}, ${table.kdfMemLimit}) in (0, 4)`,
    ),
  ],
);

export const sessionStage = pgEnum('session_stage', [
  'mfa_enrollment',
  'mfa_verification',
  'authenticated',
]);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** BLAKE2b digest of the cookie token; the token itself is never stored. */
    tokenHash: text('token_hash').notNull(),
    stage: sessionStage('stage').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** Absolute expiry; idle expiry is computed from lastSeenAt. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_key').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
  ],
);

export const mfaBackupCodes = pgTable(
  'mfa_backup_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('mfa_backup_codes_user_id_idx').on(table.userId)],
);

/** Failed authentication attempts, used for per-IP rate limiting. */
export const authFailures = pgTable(
  'auth_failures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ipAddress: text('ip_address').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('auth_failures_ip_occurred_idx').on(table.ipAddress, table.occurredAt)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Null for anonymous events such as a failed login for an unknown user.
     * No foreign key: rows are immutable and must outlive the user they mention.
     */
    actorUserId: uuid('actor_user_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    ipAddress: text('ip_address'),
    /** Non-sensitive context only: never secrets, tokens or vault content. */
    details: jsonb('details')
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
  },
  (table) => [
    index('audit_log_occurred_at_idx').on(table.occurredAt),
    index('audit_log_actor_idx').on(table.actorUserId),
  ],
);
