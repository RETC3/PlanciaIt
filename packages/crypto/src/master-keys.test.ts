import { describe, expect, it } from 'vitest';
import {
  createKdfParams,
  DEFAULT_KDF_MEM_LIMIT,
  DEFAULT_KDF_OPS_LIMIT,
  deriveMasterKeys,
  type KdfParams,
} from './master-keys.js';
import { toBase64 } from './sodium.js';

// Cheaper limits keep the suite fast; production uses the defaults.
async function testParams(): Promise<KdfParams> {
  return { ...(await createKdfParams()), opsLimit: 2, memLimit: 8 * 1024 * 1024 };
}

describe('createKdfParams', () => {
  it('uses a fresh random salt and the default limits', async () => {
    const a = await createKdfParams();
    const b = await createKdfParams();
    expect(a.salt).not.toBe(b.salt);
    expect(a.opsLimit).toBe(DEFAULT_KDF_OPS_LIMIT);
    expect(a.memLimit).toBe(DEFAULT_KDF_MEM_LIMIT);
  });
});

describe('deriveMasterKeys', () => {
  it('is deterministic for the same password and parameters', async () => {
    const params = await testParams();
    const first = await deriveMasterKeys('correct horse battery staple', params);
    const second = await deriveMasterKeys('correct horse battery staple', params);
    expect(first.authKey).toBe(second.authKey);
    expect(first.encryptionKey).toEqual(second.encryptionKey);
  });

  it('derives distinct authentication and encryption keys', async () => {
    const keys = await deriveMasterKeys('correct horse battery staple', await testParams());
    expect(keys.encryptionKey).toHaveLength(32);
    expect(await toBase64(keys.encryptionKey)).not.toBe(keys.authKey);
  });

  it('changes with the password or the salt', async () => {
    const params = await testParams();
    const base = await deriveMasterKeys('password-one', params);
    const otherPassword = await deriveMasterKeys('password-two', params);
    const otherSalt = await deriveMasterKeys('password-one', await testParams());
    expect(otherPassword.authKey).not.toBe(base.authKey);
    expect(otherSalt.authKey).not.toBe(base.authKey);
  });

  it('rejects a salt of the wrong length', async () => {
    const params = { ...(await testParams()), salt: 'c2hvcnQ' };
    await expect(deriveMasterKeys('password', params)).rejects.toThrow(/salt/);
  });
});
