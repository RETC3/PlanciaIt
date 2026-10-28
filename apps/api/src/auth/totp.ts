import { randomBytes } from '@planciait/crypto';
import { Secret, TOTP } from 'otpauth';

const ISSUER = 'PlanciaIT';
/** RFC 6238 defaults, supported by every authenticator app. */
const PERIOD_SECONDS = 30;
const DIGITS = 6;
/** Accept the previous and next code to absorb small clock drift. */
const WINDOW = 1;

function totpFor(secretBase32: string, username: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: username,
    algorithm: 'SHA1',
    digits: DIGITS,
    period: PERIOD_SECONDS,
    secret: Secret.fromBase32(secretBase32),
  });
}

/** New 160-bit secret (base32), random bytes from libsodium. */
export async function createTotpSecret(): Promise<string> {
  const bytes = await randomBytes(20);
  // slice(): a standalone ArrayBuffer, not a view into a larger one.
  return new Secret({ buffer: bytes.slice().buffer }).base32;
}

export function totpUri(secretBase32: string, username: string): string {
  return totpFor(secretBase32, username).toString();
}

/**
 * Returns the time step of a valid code, or null. A step not greater than
 * `lastStep` is rejected so the same code cannot be used twice.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  lastStep: number | null,
  timestamp = Date.now(),
): number | null {
  const totp = totpFor(secretBase32, '');
  const delta = totp.validate({ token: code, timestamp, window: WINDOW });
  if (delta === null) return null;
  const step = totp.counter({ timestamp }) + delta;
  if (lastStep !== null && step <= lastStep) return null;
  return step;
}
