import { z } from 'zod';

/**
 * Accepted Argon2id limits for the browser-side key derivation. The minimum
 * prevents a client from registering with weak parameters (OWASP: 19 MiB, t=2).
 */
export const KDF_LIMITS = {
  opsLimitMin: 2,
  opsLimitMax: 10,
  memLimitMin: 19 * 1024 * 1024,
  memLimitMax: 1024 * 1024 * 1024,
} as const;

function base64UrlOfBytes(bytes: number) {
  return z
    .string()
    .length(Math.ceil((bytes * 4) / 3))
    .regex(/^[A-Za-z0-9_-]+$/);
}

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(64)
  .regex(/^[a-z0-9._-]+$/);

export const displayNameSchema = z.string().trim().min(1).max(100);

export const kdfParamsSchema = z.object({
  salt: base64UrlOfBytes(16),
  opsLimit: z.int().min(KDF_LIMITS.opsLimitMin).max(KDF_LIMITS.opsLimitMax),
  memLimit: z.int().min(KDF_LIMITS.memLimitMin).max(KDF_LIMITS.memLimitMax),
});

/** 32-byte key derived from the master password in the browser. */
export const authKeySchema = base64UrlOfBytes(32);

export const userRoleSchema = z.enum(['admin', 'technician']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const sessionStageSchema = z.enum(['mfa_enrollment', 'mfa_verification', 'authenticated']);
export type SessionStage = z.infer<typeof sessionStageSchema>;

export const currentUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  role: userRoleSchema,
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

// GET /auth/setup
export const setupStatusResponseSchema = z.object({ setupRequired: z.boolean() });
export type SetupStatusResponse = z.infer<typeof setupStatusResponseSchema>;

// POST /auth/setup
export const setupRequestSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  kdf: kdfParamsSchema,
  authKey: authKeySchema,
});
export type SetupRequest = z.infer<typeof setupRequestSchema>;

// POST /auth/prelogin
export const preloginRequestSchema = z.object({ username: usernameSchema });
export type PreloginRequest = z.infer<typeof preloginRequestSchema>;
export const preloginResponseSchema = kdfParamsSchema;
export type PreloginResponse = z.infer<typeof preloginResponseSchema>;

// POST /auth/login
export const loginRequestSchema = z.object({ username: usernameSchema, authKey: authKeySchema });
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Setup and login never grant a full session: MFA always comes next. */
export const pendingSessionResponseSchema = z.object({
  stage: z.enum(['mfa_enrollment', 'mfa_verification']),
});
export type PendingSessionResponse = z.infer<typeof pendingSessionResponseSchema>;

// GET /auth/session
export const sessionResponseSchema = z.object({
  stage: sessionStageSchema,
  user: currentUserSchema,
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/);

// POST /auth/mfa/enrollment
export const mfaEnrollmentResponseSchema = z.object({
  /** Base32, for manual entry in the authenticator app. */
  secret: z.string(),
  otpauthUri: z.string(),
});
export type MfaEnrollmentResponse = z.infer<typeof mfaEnrollmentResponseSchema>;

// POST /auth/mfa/enrollment/confirm
export const mfaConfirmRequestSchema = z.object({ code: totpCodeSchema });
export type MfaConfirmRequest = z.infer<typeof mfaConfirmRequestSchema>;
export const mfaConfirmResponseSchema = z.object({
  /** Shown once; the server keeps only their digests. */
  backupCodes: z.array(z.string()),
  user: currentUserSchema,
});
export type MfaConfirmResponse = z.infer<typeof mfaConfirmResponseSchema>;

// POST /auth/mfa/verify
export const mfaVerifyRequestSchema = z.union([
  z.object({ code: totpCodeSchema }),
  z.object({ backupCode: z.string().trim().min(10).max(20) }),
]);
export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequestSchema>;
export const mfaVerifyResponseSchema = z.object({ user: currentUserSchema });
export type MfaVerifyResponse = z.infer<typeof mfaVerifyResponseSchema>;
