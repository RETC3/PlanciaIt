import { describe, expect, it } from 'vitest';
import {
  assetFieldDefinitionsSchema,
  assetListQuerySchema,
  createAssetRequestSchema,
  currentCustomFields,
  validateCustomFields,
  type AssetFieldDefinition,
} from './inventory.js';

const fields: AssetFieldDefinition[] = [
  { key: 'os', label: 'Sistema operativo', kind: 'text', required: true },
  { key: 'cores', label: 'Core', kind: 'number', required: false },
  { key: 'warranty_end', label: 'Fine garanzia', kind: 'date', required: false },
  { key: 'virtual', label: 'Virtuale', kind: 'boolean', required: false },
  { key: 'tier', label: 'Livello', kind: 'select', required: false, options: ['Oro', 'Argento'] },
];

describe('assetFieldDefinitionsSchema', () => {
  it('rejects duplicate keys, bad keys and empty select options', () => {
    const text = { label: 'X', kind: 'text', required: false };
    expect(
      assetFieldDefinitionsSchema.safeParse([
        { key: 'a', ...text },
        { key: 'a', ...text },
      ]).success,
    ).toBe(false);
    expect(assetFieldDefinitionsSchema.safeParse([{ key: 'Bad Key', ...text }]).success).toBe(
      false,
    );
    expect(
      assetFieldDefinitionsSchema.safeParse([{ key: 's', label: 'S', kind: 'select', options: [] }])
        .success,
    ).toBe(false);
  });

  it('defaults required to false', () => {
    expect(assetFieldDefinitionsSchema.parse([{ key: 'a', label: 'A', kind: 'text' }])).toEqual([
      { key: 'a', label: 'A', kind: 'text', required: false },
    ]);
  });
});

describe('validateCustomFields', () => {
  it('keeps valid values and drops blank ones', () => {
    expect(
      validateCustomFields(fields, {
        os: ' Windows Server 2025 ',
        cores: 16,
        warranty_end: '2028-03-31',
        virtual: false,
        tier: 'Oro',
      }),
    ).toEqual({
      success: true,
      values: {
        os: 'Windows Server 2025',
        cores: 16,
        warranty_end: '2028-03-31',
        virtual: false,
        tier: 'Oro',
      },
    });
    expect(validateCustomFields(fields, { os: 'Linux', cores: null, tier: '' })).toEqual({
      success: true,
      values: { os: 'Linux' },
    });
  });

  it('reports missing, mistyped and unknown fields', () => {
    const result = validateCustomFields(fields, {
      cores: '16',
      warranty_end: '31/03/2028',
      tier: 'Bronzo',
      extra: 'x',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.map((issue) => issue.key).sort()).toEqual(
      ['cores', 'extra', 'os', 'tier', 'warranty_end'].sort(),
    );
  });
});

describe('currentCustomFields', () => {
  it('hides stored values that no longer match the definitions', () => {
    expect(currentCustomFields(fields, { os: 'Linux', cores: 'many', removed: 'x' })).toEqual({
      os: 'Linux',
    });
  });
});

describe('createAssetRequestSchema', () => {
  const base = {
    areaId: '00000000-0000-4000-8000-000000000001',
    typeId: '00000000-0000-4000-8000-000000000002',
    name: ' srv-01 ',
  };

  it('applies defaults and normalizes blank text to null', () => {
    expect(createAssetRequestSchema.parse({ ...base, location: ' ', ipAddress: '' })).toEqual({
      ...base,
      name: 'srv-01',
      status: 'in_use',
      location: null,
      ipAddress: null,
      customFields: {},
    });
  });

  it('accepts IPv4 and IPv6 addresses only', () => {
    expect(createAssetRequestSchema.safeParse({ ...base, ipAddress: '10.0.0.1' }).success).toBe(
      true,
    );
    expect(createAssetRequestSchema.safeParse({ ...base, ipAddress: 'fe80::1' }).success).toBe(
      true,
    );
    expect(createAssetRequestSchema.safeParse({ ...base, ipAddress: '10.0.0.300' }).success).toBe(
      false,
    );
  });
});

describe('assetListQuerySchema', () => {
  it('coerces paging parameters from the query string', () => {
    expect(assetListQuerySchema.parse({ limit: '20', offset: '40' })).toEqual({
      limit: 20,
      offset: 40,
    });
    expect(assetListQuerySchema.safeParse({ limit: '1000' }).success).toBe(false);
  });
});
