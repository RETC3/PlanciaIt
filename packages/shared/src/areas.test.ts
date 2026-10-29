import { describe, expect, it } from 'vitest';
import {
  createAreaRequestSchema,
  setAreaMemberRequestSchema,
  updateAreaRequestSchema,
} from './areas.js';

describe('createAreaRequestSchema', () => {
  it('trims the name and stores a blank description as null', () => {
    expect(createAreaRequestSchema.parse({ name: ' Rete ', description: '  ' })).toEqual({
      name: 'Rete',
      description: null,
    });
    expect(createAreaRequestSchema.parse({ name: 'Server' })).toEqual({ name: 'Server' });
  });

  it('rejects a blank or overlong name', () => {
    expect(createAreaRequestSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(createAreaRequestSchema.safeParse({ name: 'x'.repeat(101) }).success).toBe(false);
  });
});

describe('updateAreaRequestSchema', () => {
  it('requires at least one field and allows clearing the description', () => {
    expect(updateAreaRequestSchema.safeParse({}).success).toBe(false);
    expect(updateAreaRequestSchema.parse({ description: null })).toEqual({ description: null });
  });
});

describe('setAreaMemberRequestSchema', () => {
  it('accepts only read or write', () => {
    expect(setAreaMemberRequestSchema.safeParse({ permission: 'write' }).success).toBe(true);
    expect(setAreaMemberRequestSchema.safeParse({ permission: 'admin' }).success).toBe(false);
  });
});
