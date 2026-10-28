import { describe, expect, it } from 'vitest';
import {
  authKeySchema,
  kdfParamsSchema,
  KDF_LIMITS,
  mfaVerifyRequestSchema,
  usernameSchema,
} from './auth.js';

describe('usernameSchema', () => {
  it('normalizes to lowercase without surrounding spaces', () => {
    expect(usernameSchema.parse('  Mario.Rossi ')).toBe('mario.rossi');
  });

  it('rejects unsupported characters', () => {
    expect(usernameSchema.safeParse('mario rossi').success).toBe(false);
    expect(usernameSchema.safeParse('ma').success).toBe(false);
  });
});

describe('kdfParamsSchema', () => {
  const valid = {
    salt: 'AAAAAAAAAAAAAAAAAAAAAA',
    opsLimit: 3,
    memLimit: 64 * 1024 * 1024,
  };

  it('accepts the default browser parameters', () => {
    expect(kdfParamsSchema.parse(valid)).toEqual(valid);
  });

  it('rejects parameters weaker than the minimum', () => {
    expect(kdfParamsSchema.safeParse({ ...valid, opsLimit: 1 }).success).toBe(false);
    expect(
      kdfParamsSchema.safeParse({ ...valid, memLimit: KDF_LIMITS.memLimitMin - 1 }).success,
    ).toBe(false);
  });

  it('rejects a salt of the wrong length', () => {
    expect(kdfParamsSchema.safeParse({ ...valid, salt: 'AAAA' }).success).toBe(false);
  });
});

describe('authKeySchema', () => {
  it('requires 32 bytes of base64url', () => {
    expect(authKeySchema.safeParse('A'.repeat(43)).success).toBe(true);
    expect(authKeySchema.safeParse('A'.repeat(42)).success).toBe(false);
    expect(authKeySchema.safeParse('+'.repeat(43)).success).toBe(false);
  });
});

describe('mfaVerifyRequestSchema', () => {
  it('accepts either a TOTP code or a backup code', () => {
    expect(mfaVerifyRequestSchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(mfaVerifyRequestSchema.safeParse({ backupCode: 'ABCDE-FGHJK' }).success).toBe(true);
    expect(mfaVerifyRequestSchema.safeParse({ code: '12345' }).success).toBe(false);
  });
});
