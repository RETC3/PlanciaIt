import { fromBase64, getSodium, toBase64 } from './sodium.js';

// Server-side helpers. They never see a password: only the derived auth key,
// random tokens and server-generated secrets.

/** Argon2id hash (libsodium string format, parameters included) of a client auth key. */
export async function hashAuthKey(authKey: string): Promise<string> {
  const s = await getSodium();
  return s.crypto_pwhash_str(
    authKey,
    s.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    s.crypto_pwhash_MEMLIMIT_INTERACTIVE,
  );
}

export async function verifyAuthKey(hash: string, authKey: string): Promise<boolean> {
  const s = await getSodium();
  try {
    return s.crypto_pwhash_str_verify(hash, authKey);
  } catch {
    // Malformed stored hash: treat as a failed verification.
    return false;
  }
}

/** Random opaque token (base64url), e.g. a session id. */
export async function generateToken(bytes = 32): Promise<string> {
  const s = await getSodium();
  return toBase64(s.randombytes_buf(bytes));
}

/**
 * BLAKE2b digest of a high-entropy secret (session token, backup code) for
 * storage and lookup. Not suitable for passwords: use hashAuthKey.
 */
export async function hashSecret(secret: string): Promise<string> {
  const s = await getSodium();
  return toBase64(s.crypto_generichash(32, secret, null));
}

/** Constant-time comparison of two base64url digests. */
export async function digestsEqual(a: string, b: string): Promise<boolean> {
  const s = await getSodium();
  const left = await fromBase64(a);
  const right = await fromBase64(b);
  return left.length === right.length && s.memcmp(left, right);
}

const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** MFA backup code such as `K7QPM-2XH9D` (about 49 bits of entropy). */
export async function generateBackupCode(): Promise<string> {
  const s = await getSodium();
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += BACKUP_CODE_ALPHABET[s.randombytes_uniform(BACKUP_CODE_ALPHABET.length)];
    if (i === 4) code += '-';
  }
  return code;
}

/** Uppercases and strips separators so users can type codes loosely. */
export function normalizeBackupCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** 32 random bytes (base64url), e.g. for the SECRET_KEY environment variable. */
export async function generateServerKey(): Promise<string> {
  const s = await getSodium();
  return toBase64(s.crypto_aead_xchacha20poly1305_ietf_keygen());
}

/**
 * Derives an independent key for one purpose from the server key (keyed
 * BLAKE2b), so a single SECRET_KEY never serves two primitives.
 */
export async function deriveSubkey(serverKey: Uint8Array, purpose: string): Promise<Uint8Array> {
  const s = await getSodium();
  if (serverKey.length !== 32) {
    throw new Error('Server key must be 32 bytes');
  }
  return s.crypto_generichash(32, `planciait:${purpose}`, serverKey);
}

/**
 * Deterministic fake KDF salt for usernames that do not exist, so the
 * pre-login answer does not reveal which accounts exist.
 */
export async function fakeKdfSalt(subkey: Uint8Array, username: string): Promise<string> {
  const s = await getSodium();
  return toBase64(s.crypto_generichash(s.crypto_pwhash_SALTBYTES, username, subkey));
}

/**
 * XChaCha20-Poly1305 with a fresh random nonce, output `nonce || ciphertext`
 * as base64url. `context` is bound as associated data (e.g. the owning row id),
 * so a ciphertext copied to another row fails to decrypt.
 */
export async function encryptSecret(
  plaintext: string,
  key: Uint8Array,
  context: string,
): Promise<string> {
  const s = await getSodium();
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    context,
    null,
    nonce,
    key,
  );
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);
  return toBase64(combined);
}

/** Throws if the key, the context or the ciphertext is wrong. */
export async function decryptSecret(
  encrypted: string,
  key: Uint8Array,
  context: string,
): Promise<string> {
  const s = await getSodium();
  const combined = await fromBase64(encrypted);
  const nonceBytes = s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  if (combined.length <= nonceBytes) {
    throw new Error('Ciphertext too short');
  }
  const plaintext = s.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    combined.slice(nonceBytes),
    context,
    combined.slice(0, nonceBytes),
    key,
  );
  return s.to_string(plaintext);
}
