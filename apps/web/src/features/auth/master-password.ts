import { MASTER_PASSWORD_MIN_LENGTH } from '@planciait/shared';

export type MasterPasswordError = 'tooShort' | 'mismatch';

/** Client-side only: the server never sees the master password and cannot check it. */
export function masterPasswordError(
  password: string,
  confirmation: string,
): MasterPasswordError | null {
  if (password.length < MASTER_PASSWORD_MIN_LENGTH) return 'tooShort';
  if (password !== confirmation) return 'mismatch';
  return null;
}
