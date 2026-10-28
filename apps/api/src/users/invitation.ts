import { generateToken, hashSecret } from '@planciait/crypto';
import { INVITATION_VALIDITY_HOURS } from '@planciait/shared';

export interface NewInvitation {
  /** Returned once to the administrator; never stored. */
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export async function createInvitation(now = Date.now()): Promise<NewInvitation> {
  const token = await generateToken();
  return {
    token,
    tokenHash: await hashSecret(token),
    expiresAt: new Date(now + INVITATION_VALIDITY_HOURS * 3_600_000),
  };
}

/**
 * Column values that put a user back into the "invited" state: no master
 * password, no MFA, no lockout. Used when (re)issuing an invitation.
 */
export function invitationResetValues(invitation: NewInvitation) {
  return {
    authKeyHash: null,
    kdfSalt: null,
    kdfOpsLimit: null,
    kdfMemLimit: null,
    totpSecretEncrypted: null,
    totpEnabledAt: null,
    totpLastStep: null,
    failedLoginCount: 0,
    lockedUntil: null,
    invitationTokenHash: invitation.tokenHash,
    invitationExpiresAt: invitation.expiresAt,
  };
}
