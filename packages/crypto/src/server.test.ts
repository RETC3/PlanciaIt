import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  deriveSubkey,
  digestsEqual,
  encryptSecret,
  fakeKdfSalt,
  generateBackupCode,
  generateServerKey,
  generateToken,
  hashAuthKey,
  hashSecret,
  normalizeBackupCode,
  verifyAuthKey,
} from './server.js';
import { fromBase64, toBase64 } from './sodium.js';

async function newKey(): Promise<Uint8Array> {
  return fromBase64(await generateServerKey());
}

describe('auth key hashing', () => {
  it('verifies the right key and rejects a wrong one', async () => {
    const hash = await hashAuthKey('auth-key');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyAuthKey(hash, 'auth-key')).toBe(true);
    expect(await verifyAuthKey(hash, 'other-key')).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashAuthKey('auth-key')).not.toBe(await hashAuthKey('auth-key'));
  });

  it('returns false for a malformed stored hash', async () => {
    expect(await verifyAuthKey('not-a-hash', 'auth-key')).toBe(false);
  });
});

describe('tokens and digests', () => {
  it('generates unique 32-byte tokens', async () => {
    const a = await generateToken();
    expect(await fromBase64(a)).toHaveLength(32);
    expect(a).not.toBe(await generateToken());
  });

  it('hashes deterministically and compares digests', async () => {
    const digest = await hashSecret('token');
    expect(await hashSecret('token')).toBe(digest);
    expect(await digestsEqual(digest, await hashSecret('token'))).toBe(true);
    expect(await digestsEqual(digest, await hashSecret('other'))).toBe(false);
  });
});

describe('backup codes', () => {
  it('have the expected format and are unique', async () => {
    const codes = await Promise.all(Array.from({ length: 50 }, () => generateBackupCode()));
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('normalize loosely typed input', () => {
    expect(normalizeBackupCode(' k7qpm 2xh9d ')).toBe('K7QPM2XH9D');
    expect(normalizeBackupCode('K7QPM-2XH9D')).toBe('K7QPM2XH9D');
  });
});

describe('subkeys and fake salts', () => {
  it('derives different subkeys per purpose', async () => {
    const key = await newKey();
    const a = await deriveSubkey(key, 'a');
    expect(a).toEqual(await deriveSubkey(key, 'a'));
    expect(a).not.toEqual(await deriveSubkey(key, 'b'));
  });

  it('rejects server keys of the wrong length', async () => {
    await expect(deriveSubkey(new Uint8Array(16), 'a')).rejects.toThrow();
  });

  it('produces a stable 16-byte salt per username', async () => {
    const subkey = await deriveSubkey(await newKey(), 'fake-salt');
    const salt = await fakeKdfSalt(subkey, 'mario');
    expect(await fromBase64(salt)).toHaveLength(16);
    expect(await fakeKdfSalt(subkey, 'mario')).toBe(salt);
    expect(await fakeKdfSalt(subkey, 'luigi')).not.toBe(salt);
  });
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips', async () => {
    const key = await newKey();
    const encrypted = await encryptSecret('JBSWY3DPEHPK3PXP', key, 'user-1');
    expect(await decryptSecret(encrypted, key, 'user-1')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('uses a different nonce on every encryption', async () => {
    const key = await newKey();
    const a = await fromBase64(await encryptSecret('same', key, 'ctx'));
    const b = await fromBase64(await encryptSecret('same', key, 'ctx'));
    expect(a.slice(0, 24)).not.toEqual(b.slice(0, 24));
  });

  it('fails with a wrong key', async () => {
    const encrypted = await encryptSecret('secret', await newKey(), 'ctx');
    await expect(decryptSecret(encrypted, await newKey(), 'ctx')).rejects.toThrow();
  });

  it('fails with a wrong context', async () => {
    const key = await newKey();
    const encrypted = await encryptSecret('secret', key, 'user-1');
    await expect(decryptSecret(encrypted, key, 'user-2')).rejects.toThrow();
  });

  it('fails on tampered or truncated ciphertext', async () => {
    const key = await newKey();
    const bytes = await fromBase64(await encryptSecret('secret', key, 'ctx'));
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
    await expect(decryptSecret(await toBase64(bytes), key, 'ctx')).rejects.toThrow();
    await expect(decryptSecret('AAAA', key, 'ctx')).rejects.toThrow(/short/);
  });
});
