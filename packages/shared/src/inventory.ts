import { z } from 'zod';
import { areaPermissionSchema } from './areas.js';
import { idSchema } from './users.js';

/** Optional free text; blank is stored as null. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();
}

// ---------------------------------------------------------------------------
// Asset types and custom fields

export const assetFieldKindSchema = z.enum(['text', 'number', 'date', 'boolean', 'select']);
export type AssetFieldKind = z.infer<typeof assetFieldKindSchema>;

/** Stable identifier of a custom field inside its type; values are stored under it. */
export const assetFieldKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);

const fieldBase = {
  key: assetFieldKeySchema,
  label: z.string().trim().min(1).max(100),
  required: z.boolean().default(false),
};

export const assetFieldDefinitionSchema = z.discriminatedUnion('kind', [
  z.object({ ...fieldBase, kind: z.literal('text') }),
  z.object({ ...fieldBase, kind: z.literal('number') }),
  z.object({ ...fieldBase, kind: z.literal('date') }),
  z.object({ ...fieldBase, kind: z.literal('boolean') }),
  z.object({
    ...fieldBase,
    kind: z.literal('select'),
    options: z
      .array(z.string().trim().min(1).max(100))
      .min(1)
      .max(50)
      .refine((options) => new Set(options).size === options.length, {
        message: 'Options must be unique',
      }),
  }),
]);
export type AssetFieldDefinition = z.infer<typeof assetFieldDefinitionSchema>;

export const assetFieldDefinitionsSchema = z
  .array(assetFieldDefinitionSchema)
  .max(30)
  .superRefine((fields, context) => {
    const seen = new Set<string>();
    fields.forEach((field, index) => {
      if (seen.has(field.key)) {
        context.addIssue({ code: 'custom', path: [index, 'key'], message: 'Duplicate key' });
      }
      seen.add(field.key);
    });
  });

export const assetTypeNameSchema = z.string().trim().min(1).max(100);

export const assetTypeSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  fields: z.array(assetFieldDefinitionSchema),
  /** Assets of this type across every area: a type in use cannot be deleted. */
  assetCount: z.int(),
});
export type AssetType = z.infer<typeof assetTypeSchema>;

// GET /asset-types
export const assetTypeListResponseSchema = z.object({ assetTypes: z.array(assetTypeSchema) });
export type AssetTypeListResponse = z.infer<typeof assetTypeListResponseSchema>;

// GET /asset-types/:id, POST /asset-types, PATCH /asset-types/:id
export const assetTypeResponseSchema = z.object({ assetType: assetTypeSchema });
export type AssetTypeResponse = z.infer<typeof assetTypeResponseSchema>;

// POST /asset-types
export const createAssetTypeRequestSchema = z.object({
  name: assetTypeNameSchema,
  description: optionalText(1000).optional(),
  fields: assetFieldDefinitionsSchema.default([]),
});
export type CreateAssetTypeRequest = z.infer<typeof createAssetTypeRequestSchema>;

// PATCH /asset-types/:id
export const updateAssetTypeRequestSchema = z
  .object({
    name: assetTypeNameSchema.optional(),
    description: optionalText(1000).optional(),
    fields: assetFieldDefinitionsSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });
export type UpdateAssetTypeRequest = z.infer<typeof updateAssetTypeRequestSchema>;

// ---------------------------------------------------------------------------
// Custom field values

export type CustomFieldValue = string | number | boolean;
export type CustomFieldValues = Record<string, CustomFieldValue>;

/** As submitted: null or a blank string clears a value. */
export const customFieldInputSchema = z.record(
  assetFieldKeySchema,
  z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]),
);
export type CustomFieldInput = z.infer<typeof customFieldInputSchema>;

export interface CustomFieldIssue {
  key: string;
  message: string;
}

export type CustomFieldValidation =
  { success: true; values: CustomFieldValues } | { success: false; issues: CustomFieldIssue[] };

function checkValue(field: AssetFieldDefinition, value: string | number | boolean): string | null {
  switch (field.kind) {
    case 'text':
      return typeof value === 'string' ? null : 'Expected text';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'Expected a number';
    case 'date':
      return typeof value === 'string' && z.iso.date().safeParse(value).success
        ? null
        : 'Expected a date (YYYY-MM-DD)';
    case 'boolean':
      return typeof value === 'boolean' ? null : 'Expected true or false';
    case 'select':
      return typeof value === 'string' && field.options.includes(value)
        ? null
        : 'Not one of the options';
  }
}

/**
 * Checks submitted values against a type's field definitions. Unknown keys are
 * rejected, blank values are dropped, required fields must be present. The
 * result holds only defined keys, ready to store.
 */
export function validateCustomFields(
  fields: readonly AssetFieldDefinition[],
  input: CustomFieldInput,
): CustomFieldValidation {
  const issues: CustomFieldIssue[] = [];
  const values: CustomFieldValues = {};
  const byKey = new Map(fields.map((field) => [field.key, field]));

  for (const key of Object.keys(input)) {
    if (!byKey.has(key)) issues.push({ key, message: 'Unknown field' });
  }
  for (const field of fields) {
    const raw = input[field.key];
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (value === undefined || value === null || value === '') {
      if (field.required) issues.push({ key: field.key, message: 'Required' });
      continue;
    }
    const problem = checkValue(field, value);
    if (problem) {
      issues.push({ key: field.key, message: problem });
    } else {
      values[field.key] = value;
    }
  }
  return issues.length > 0 ? { success: false, issues } : { success: true, values };
}

/** Stored values that still match the current definitions (types can change after the fact). */
export function currentCustomFields(
  fields: readonly AssetFieldDefinition[],
  stored: Readonly<Record<string, unknown>>,
): CustomFieldValues {
  const values: CustomFieldValues = {};
  for (const field of fields) {
    const value = stored[field.key];
    if (
      (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') &&
      checkValue(field, value) === null
    ) {
      values[field.key] = value;
    }
  }
  return values;
}

// ---------------------------------------------------------------------------
// Assets

export const assetStatusSchema = z.enum(['in_use', 'in_stock', 'maintenance', 'retired']);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

export const assetNameSchema = z.string().trim().min(1).max(200);

export const ipAddressSchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .pipe(z.union([z.ipv4(), z.ipv6()]).nullable())
  .nullable();

/** Common asset properties besides name and status; all optional, blank clears them. */
const optionalAssetFields = {
  hostname: optionalText(255).optional(),
  ipAddress: ipAddressSchema.optional(),
  serialNumber: optionalText(100).optional(),
  manufacturer: optionalText(100).optional(),
  model: optionalText(100).optional(),
  location: optionalText(200).optional(),
  notes: optionalText(5000).optional(),
};

const reference = z.object({ id: idSchema, name: z.string() });

export const assetSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  status: assetStatusSchema,
  area: reference,
  type: reference,
  hostname: z.string().nullable(),
  ipAddress: z.string().nullable(),
  location: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export type AssetSummary = z.infer<typeof assetSummarySchema>;

export const assetDetailSchema = assetSummarySchema.extend({
  serialNumber: z.string().nullable(),
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  notes: z.string().nullable(),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  /** The current user's permission on the asset's area. */
  permission: areaPermissionSchema,
  createdAt: z.iso.datetime(),
});
export type AssetDetail = z.infer<typeof assetDetailSchema>;

export const ASSET_PAGE_SIZE_MAX = 200;

// GET /assets?areaId&typeId&status&q&limit&offset
export const assetListQuerySchema = z.object({
  areaId: idSchema.optional(),
  typeId: idSchema.optional(),
  status: assetStatusSchema.optional(),
  /** Matches name, hostname, IP address or serial number. */
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(ASSET_PAGE_SIZE_MAX).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AssetListQuery = z.infer<typeof assetListQuerySchema>;
/** As sent by clients: paging parameters may be omitted. */
export type AssetListQueryInput = z.input<typeof assetListQuerySchema>;

export const assetListResponseSchema = z.object({
  assets: z.array(assetSummarySchema),
  /** Matching assets across all pages. */
  total: z.int(),
});
export type AssetListResponse = z.infer<typeof assetListResponseSchema>;

// GET /assets/:id, POST /assets, PATCH /assets/:id
export const assetResponseSchema = z.object({ asset: assetDetailSchema });
export type AssetResponse = z.infer<typeof assetResponseSchema>;

// POST /assets
export const createAssetRequestSchema = z.object({
  areaId: idSchema,
  typeId: idSchema,
  name: assetNameSchema,
  status: assetStatusSchema.default('in_use'),
  ...optionalAssetFields,
  customFields: customFieldInputSchema.default({}),
});
export type CreateAssetRequest = z.infer<typeof createAssetRequestSchema>;

// PATCH /assets/:id. Changing areaId moves the asset; customFields replaces all values.
export const updateAssetRequestSchema = z
  .object({
    areaId: idSchema.optional(),
    typeId: idSchema.optional(),
    name: assetNameSchema.optional(),
    status: assetStatusSchema.optional(),
    ...optionalAssetFields,
    customFields: customFieldInputSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });
export type UpdateAssetRequest = z.infer<typeof updateAssetRequestSchema>;

// ---------------------------------------------------------------------------
// CSV import (the browser parses the file and sends mapped rows)

export const ASSET_IMPORT_MAX_ROWS = 1000;

/** One asset of an import: area and type are shared by the whole batch. */
export const importAssetRowSchema = createAssetRequestSchema.omit({ areaId: true, typeId: true });
export type ImportAssetRow = z.infer<typeof importAssetRowSchema>;

// POST /assets/import
export const importAssetsRequestSchema = z.object({
  areaId: idSchema,
  typeId: idSchema,
  assets: z.array(importAssetRowSchema).min(1).max(ASSET_IMPORT_MAX_ROWS),
});
export type ImportAssetsRequest = z.infer<typeof importAssetsRequestSchema>;

export const importAssetsResponseSchema = z.object({ imported: z.int() });
export type ImportAssetsResponse = z.infer<typeof importAssetsResponseSchema>;
