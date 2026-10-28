import {
  inspectInvitationResponseSchema,
  mfaConfirmResponseSchema,
  mfaEnrollmentResponseSchema,
  mfaVerifyResponseSchema,
  pendingSessionResponseSchema,
  preloginResponseSchema,
  sessionResponseSchema,
  setupStatusResponseSchema,
  type InspectInvitationResponse,
  type MfaConfirmResponse,
  type MfaEnrollmentResponse,
  type MfaVerifyRequest,
  type MfaVerifyResponse,
  type PendingSessionResponse,
  type SessionResponse,
} from '@planciait/shared';
import { ApiError, apiRequest, apiRequestNoContent } from '@/lib/api';

export const sessionQueryKey = ['auth', 'session'] as const;
export const setupStatusQueryKey = ['auth', 'setup'] as const;
export const mfaEnrollmentQueryKey = ['auth', 'mfa-enrollment'] as const;

/** Loaded on demand: libsodium is large and only needed on the sign-in pages. */
async function loadCrypto() {
  return import('@planciait/crypto');
}

/** The current session, or null when there is none. */
export async function fetchSession(): Promise<SessionResponse | null> {
  try {
    return await apiRequest('/auth/session', sessionResponseSchema);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function fetchSetupRequired(): Promise<boolean> {
  const status = await apiRequest('/auth/setup', setupStatusResponseSchema);
  return status.setupRequired;
}

export interface SetupInput {
  username: string;
  displayName: string;
  password: string;
}

/**
 * Creates the administrator. The password never leaves the browser: only the
 * auth key derived from it with Argon2id is sent.
 */
export async function setup(input: SetupInput): Promise<PendingSessionResponse> {
  const { createKdfParams, deriveMasterKeys } = await loadCrypto();
  const kdf = await createKdfParams();
  // The encryption key is not needed until the vault exists (Phase 1).
  const { authKey } = await deriveMasterKeys(input.password, kdf);
  return apiRequest('/auth/setup', pendingSessionResponseSchema, {
    method: 'POST',
    body: { username: input.username, displayName: input.displayName, kdf, authKey },
  });
}

export async function inspectInvitation(token: string): Promise<InspectInvitationResponse> {
  return apiRequest('/auth/invitations/inspect', inspectInvitationResponseSchema, {
    method: 'POST',
    body: { token },
  });
}

/** Sets the invited user's master password; as at setup, only the derived auth key is sent. */
export async function acceptInvitation(
  token: string,
  password: string,
): Promise<PendingSessionResponse> {
  const { createKdfParams, deriveMasterKeys } = await loadCrypto();
  const kdf = await createKdfParams();
  const { authKey } = await deriveMasterKeys(password, kdf);
  return apiRequest('/auth/invitations/accept', pendingSessionResponseSchema, {
    method: 'POST',
    body: { token, kdf, authKey },
  });
}

export async function login(username: string, password: string): Promise<PendingSessionResponse> {
  const { deriveMasterKeys } = await loadCrypto();
  const kdf = await apiRequest('/auth/prelogin', preloginResponseSchema, {
    method: 'POST',
    body: { username },
  });
  const { authKey } = await deriveMasterKeys(password, kdf);
  return apiRequest('/auth/login', pendingSessionResponseSchema, {
    method: 'POST',
    body: { username, authKey },
  });
}

export async function startMfaEnrollment(): Promise<MfaEnrollmentResponse> {
  return apiRequest('/auth/mfa/enrollment', mfaEnrollmentResponseSchema, { method: 'POST' });
}

export async function confirmMfaEnrollment(code: string): Promise<MfaConfirmResponse> {
  return apiRequest('/auth/mfa/enrollment/confirm', mfaConfirmResponseSchema, {
    method: 'POST',
    body: { code },
  });
}

export async function verifyMfa(request: MfaVerifyRequest): Promise<MfaVerifyResponse> {
  return apiRequest('/auth/mfa/verify', mfaVerifyResponseSchema, {
    method: 'POST',
    body: request,
  });
}

export async function logout(): Promise<void> {
  await apiRequestNoContent('/auth/logout', { method: 'POST' });
}
