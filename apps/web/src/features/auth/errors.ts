import { ApiError } from '@/lib/api';

export type AuthErrorKey =
  | 'invalidCredentials'
  | 'invalidCode'
  | 'tooManyAttempts'
  | 'setupDone'
  | 'sessionExpired'
  | 'generic';

/** Maps an API failure to an `auth.errors.*` key; what a 401 means depends on the form. */
export function authErrorKey(
  error: unknown,
  unauthorized: 'invalidCredentials' | 'invalidCode' | 'sessionExpired',
): AuthErrorKey {
  if (error instanceof ApiError) {
    if (error.status === 401) return unauthorized;
    if (error.status === 429) return 'tooManyAttempts';
    if (error.status === 409) return 'setupDone';
  }
  return 'generic';
}
