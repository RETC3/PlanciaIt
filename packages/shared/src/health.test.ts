import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('accepts a valid health response', () => {
    const value = {
      status: 'ok',
      checks: { api: 'ok', database: 'ok' },
      timestamp: new Date().toISOString(),
    };
    expect(healthResponseSchema.parse(value)).toEqual(value);
  });

  it('rejects an unknown component status', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      checks: { api: 'ok', database: 'maybe' },
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
