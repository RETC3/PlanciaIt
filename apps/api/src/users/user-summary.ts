import type { schema } from '@planciait/db';
import type { UserStatus, UserSummary } from '@planciait/shared';

type UserRow = typeof schema.users.$inferSelect;

export function userStatus(user: UserRow, now = Date.now()): UserStatus {
  if (!user.isActive) return 'disabled';
  if (user.authKeyHash === null) {
    const expired = user.invitationExpiresAt === null || user.invitationExpiresAt.getTime() <= now;
    return expired ? 'invitation_expired' : 'invited';
  }
  if (user.totpEnabledAt === null) return 'mfa_pending';
  return 'active';
}

/** The administrator's view of a user: no credential material, ever. */
export function toUserSummary(user: UserRow, now = Date.now()): UserSummary {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: userStatus(user, now),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
