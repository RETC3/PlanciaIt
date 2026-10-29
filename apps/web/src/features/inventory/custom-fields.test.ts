import type { AssetFieldDefinition } from '@planciait/shared';
import { describe, expect, it } from 'vitest';
import { draftFromValues, fieldKeyFromLabel, inputFromDraft } from './custom-fields';

const fields: AssetFieldDefinition[] = [
  { key: 'os', label: 'OS', kind: 'text', required: false },
  { key: 'cores', label: 'Core', kind: 'number', required: false },
  { key: 'virtual', label: 'Virtuale', kind: 'boolean', required: false },
  { key: 'end', label: 'Fine', kind: 'date', required: false },
];

describe('custom field drafts', () => {
  it('round-trips stored values through the form', () => {
    const values = { os: 'Linux', cores: 8, virtual: true, end: '2027-01-31' };
    const draft = draftFromValues(fields, values);
    expect(draft).toEqual({ os: 'Linux', cores: '8', virtual: true, end: '2027-01-31' });
    expect(inputFromDraft(fields, draft)).toEqual(values);
  });

  it('clears blank inputs and accepts a decimal comma', () => {
    expect(inputFromDraft(fields, { os: ' ', cores: '2,5', virtual: false, end: '' })).toEqual({
      os: null,
      cores: 2.5,
      virtual: false,
      end: null,
    });
  });

  it('passes an unparsable number through for validation to report', () => {
    expect(inputFromDraft(fields, { cores: 'otto' }).cores).toBe('otto');
  });
});

describe('fieldKeyFromLabel', () => {
  it('builds a valid key from an Italian label', () => {
    expect(fieldKeyFromLabel('Data di acquisto')).toBe('data_di_acquisto');
    expect(fieldKeyFromLabel('Capacità (TB)')).toBe('capacita_tb');
    expect(fieldKeyFromLabel('3 anni')).toBe('f_3_anni');
    expect(fieldKeyFromLabel('???')).toBe('f');
  });
});
