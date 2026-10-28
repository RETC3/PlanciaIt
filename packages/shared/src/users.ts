import { z } from 'zod';
import {
  authKeySchema,
  displayNameSchema,
  kdfParamsSchema,
  usernameSchema,
  userRoleSchema,
} from './auth.js';

export const idSchema = z.uuid();

/**
 * Derived from the account state:
 * - invited / invitation_expired: no master password chosen yet;
 * - mfa_pending: password set, authenticator not configured yet;
 * - active: ready to sign in; disabled: deactivated by an administrator.
 */
export const userStatusSchema = z.enum([
  'invited',
  'invitation_expired',
  'mfa_pending',
  'active',
  'disabled',
]);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const userSummarySchema = z.object({
  id: idSchema,
  username: z.string(),
  displayName: z.string(),
  role: userRoleSchema,
  status: userStatusSchema,
  lastLoginAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

// GET /users
export const userListResponseSchema = z.object({ users: z.array(userSummarySchema) });
export type UserListResponse = z.infer<typeof userListResponseSchema>;

// GET /users/:id, PATCH /users/:id, POST /users/:id/mfa-reset
export const userResponseSchema = z.object({ user: userSummarySchema });
export type UserResponse = z.infer<typeof userResponseSchema>;

// POST /users
export const createUserRequestSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  role: userRoleSchema,
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

// PATCH /users/:id
export const updateUserRequestSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    role: userRoleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

/** Hours an invitation link stays valid. */
export const INVITATION_VALIDITY_HOURS = 72;

// POST /users and POST /users/:id/invitation
export const invitationResponseSchema = z.object({
  user: userSummarySchema,
  /** One-time token, shown only in this response; the server keeps its digest. */
  invitationToken: z.string(),
  invitationExpiresAt: z.iso.datetime(),
});
export type InvitationResponse = z.infer<typeof invitationResponseSchema>;

/** 32 random bytes, base64url. */
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

// POST /auth/invitations/inspect (public)
export const inspectInvitationRequestSchema = z.object({ token: invitationTokenSchema });
export type InspectInvitationRequest = z.infer<typeof inspectInvitationRequestSchema>;
export const inspectInvitationResponseSchema = z.object({
  username: z.string(),
  displayName: z.string(),
});
export type InspectInvitationResponse = z.infer<typeof inspectInvitationResponseSchema>;

// POST /auth/invitations/accept (public)
export const acceptInvitationRequestSchema = z.object({
  token: invitationTokenSchema,
  kdf: kdfParamsSchema,
  authKey: authKeySchema,
});
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;
