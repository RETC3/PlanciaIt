import { z } from 'zod';
import { assetStatusSchema } from './inventory.js';
import { idSchema } from './users.js';

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_LIMIT_MAX = 50;

// GET /search?q&limit. The limit applies to each kind of result.
export const searchQuerySchema = z.object({
  q: z.string().trim().min(SEARCH_MIN_LENGTH).max(200),
  limit: z.coerce.number().int().min(1).max(SEARCH_LIMIT_MAX).default(10),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SearchQueryInput = z.input<typeof searchQuerySchema>;

/** Asset properties the search looks into besides the name. */
export const assetSearchFieldSchema = z.enum([
  'hostname',
  'ipAddress',
  'serialNumber',
  'manufacturer',
  'model',
  'location',
  'notes',
  'customField',
]);
export type AssetSearchField = z.infer<typeof assetSearchFieldSchema>;

export const assetSearchResultSchema = z.object({
  id: idSchema,
  name: z.string(),
  status: assetStatusSchema,
  area: z.object({ id: idSchema, name: z.string() }),
  type: z.object({ id: idSchema, name: z.string() }),
  /** Where the text was found when not in the name; `label` names a custom field. */
  match: z
    .object({
      field: assetSearchFieldSchema,
      label: z.string().nullable(),
      /** The matching value, shortened around the match if long. */
      value: z.string(),
    })
    .nullable(),
});
export type AssetSearchResult = z.infer<typeof assetSearchResultSchema>;

export const areaSearchResultSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
});
export type AreaSearchResult = z.infer<typeof areaSearchResultSchema>;

function group<T extends z.ZodType>(result: T) {
  /** `total` counts every match; `results` holds the best ones, up to the limit. */
  return z.object({ results: z.array(result), total: z.int() });
}

export const searchResponseSchema = z.object({
  assets: group(assetSearchResultSchema),
  areas: group(areaSearchResultSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
