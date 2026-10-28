import { fromBase64, getSodium, toBase64 } from './sodium.js';

/** Argon2id parameters stored per user, so they can be raised later without breaking logins. */
export interface KdfParams {
  /** base64url, crypto_pwhash_SALTBYTES (16) random bytes. */
  salt: string;
  opsLimit: number;
  /** Bytes. */
  memLimit: number;
}

/** Above the OWASP minimum (19 MiB, t=2) while staying usable in a browser tab. */
export const DEFAULT_KDF_OPS_LIMIT = 3;
export const DEFAULT_KDF_MEM_LIMIT = 64 * 1024 * 1024;

const KEY_BYTES = 32;

export interface MasterKeys {
  /** Sent to the server at login (base64url); the server stores only its Argon2id hash. */
  authKey: string;
  /** Never leaves the browser. Will unlock the user's private key once the vault exists. */
  encryptionKey: Uint8Array;
}

/** New random salt with the default limits, generated in the browser at registration. */
export async function createKdfParams(): Promise<KdfParams> {
  const s = await getSodium();
  return {
    salt: await toBase64(s.randombytes_buf(s.crypto_pwhash_SALTBYTES)),
    opsLimit: DEFAULT_KDF_OPS_LIMIT,
    memLimit: DEFAULT_KDF_MEM_LIMIT,
  };
}

/**
 * Derives two independent keys from the master password with a single
 * Argon2id run: the 64-byte output is split into the authentication key and
 * the encryption key, so knowing one reveals nothing about the other.
 */
export async function deriveMasterKeys(password: string, params: KdfParams): Promise<MasterKeys> {
  const s = await getSodium();
  const salt = await fromBase64(params.salt);
  if (salt.length !== s.crypto_pwhash_SALTBYTES) {
    throw new Error('Invalid KDF salt length');
  }
  const output = s.crypto_pwhash(
    KEY_BYTES * 2,
    password,
    salt,
    params.opsLimit,
    params.memLimit,
    s.crypto_pwhash_ALG_ARGON2ID13,
  );
  const authKey = await toBase64(output.slice(0, KEY_BYTES));
  const encryptionKey = output.slice(KEY_BYTES);
  s.memzero(output);
  return { authKey, encryptionKey };
}
