import { describe, expect, it } from 'vitest';
import {
  createUserRequestSchema,
  invitationTokenSchema,
  updateUserRequestSchema,
} from './users.js';

describe('createUserRequestSchema', () => {
  it('normalizes the username and requires a known role', () => {
    expect(
      createUserRequestSchema.parse({
        username: ' Luigi.Verdi ',
        displayName: 'Luigi Verdi',
        role: 'technician',
      }),
    ).toEqual({ username: 'luigi.verdi', displayName: 'Luigi Verdi', role: 'technician' });
    expect(
      createUserRequestSchema.safeParse({ username: 'luigi', displayName: 'L', role: 'owner' })
        .success,
    ).toBe(false);
  });
});

describe('updateUserRequestSchema', () => {
  it('requires at least one field', () => {
    expect(updateUserRequestSchema.safeParse({}).success).toBe(false);
    expect(updateUserRequestSchema.safeParse({ isActive: false }).success).toBe(true);
  });
});

describe('invitationTokenSchema', () => {
  it('accepts only 32-byte base64url tokens', () => {
    expect(invitationTokenSchema.safeParse('A'.repeat(43)).success).toBe(true);
    expect(invitationTokenSchema.safeParse('A'.repeat(44)).success).toBe(false);
  });
});
