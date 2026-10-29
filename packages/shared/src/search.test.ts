import { describe, expect, it } from 'vitest';
import { searchQuerySchema } from './search.js';

describe('searchQuerySchema', () => {
  it('trims the text and applies the default limit', () => {
    expect(searchQuerySchema.parse({ q: '  dc01 ' })).toEqual({ q: 'dc01', limit: 10 });
    expect(searchQuerySchema.parse({ q: '10.0', limit: '25' })).toEqual({ q: '10.0', limit: 25 });
  });

  it('rejects too short text and limits out of range', () => {
    expect(searchQuerySchema.safeParse({ q: ' a ' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'x'.repeat(201) }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'dc', limit: '51' }).success).toBe(false);
  });
});
