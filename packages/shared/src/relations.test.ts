import { describe, expect, it } from 'vitest';
import { createRelationRequestSchema, isSymmetricRelation } from './relations.js';

const a = { type: 'asset', id: '00000000-0000-4000-8000-000000000001' } as const;
const b = { type: 'asset', id: '00000000-0000-4000-8000-000000000002' } as const;

describe('createRelationRequestSchema', () => {
  it('accepts two elements and stores a blank note as null', () => {
    expect(
      createRelationRequestSchema.parse({ kind: 'runs_on', source: a, target: b, note: '  ' }),
    ).toEqual({ kind: 'runs_on', source: a, target: b, note: null });
  });

  it('rejects a relation from an element to itself', () => {
    const result = createRelationRequestSchema.safeParse({
      kind: 'depends_on',
      source: a,
      target: a,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['target']);
  });

  it('rejects unknown kinds and element types', () => {
    expect(
      createRelationRequestSchema.safeParse({ kind: 'owns', source: a, target: b }).success,
    ).toBe(false);
    expect(
      createRelationRequestSchema.safeParse({
        kind: 'depends_on',
        source: { ...a, type: 'user' },
        target: b,
      }).success,
    ).toBe(false);
  });
});

describe('isSymmetricRelation', () => {
  it('tells symmetric kinds from directed ones', () => {
    expect(isSymmetricRelation('connected_to')).toBe(true);
    expect(isSymmetricRelation('depends_on')).toBe(false);
  });
});
