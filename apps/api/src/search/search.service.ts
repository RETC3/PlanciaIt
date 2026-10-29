import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, or, schema, sql, type Database } from '@planciait/db';
import type {
  AreaSearchResult,
  AssetSearchField,
  AssetSearchResult,
  CurrentUser,
  SearchQuery,
  SearchResponse,
} from '@planciait/shared';
import { fieldsOf } from '../asset-types/asset-types.service.js';
import { AreaAccessService } from '../common/access/area-access.service.js';
import { containsPattern, prefixPattern } from '../common/like.js';
import { DATABASE } from '../database/database.module.js';

type AssetRow = typeof schema.assets.$inferSelect;
type AssetTypeRow = typeof schema.assetTypes.$inferSelect;

/** Asset text columns searched besides the name, in the order a match is reported. */
const assetTextFields = [
  'hostname',
  'ipAddress',
  'serialNumber',
  'manufacturer',
  'model',
  'location',
  'notes',
] as const satisfies readonly AssetSearchField[];

const SNIPPET_LENGTH = 120;
const SNIPPET_CONTEXT = 40;

/** The value itself if short, otherwise the part around the match. */
export function snippet(value: string, text: string): string {
  if (value.length <= SNIPPET_LENGTH) return value;
  const at = Math.max(0, value.toLowerCase().indexOf(text.toLowerCase()));
  const start = Math.max(0, at - SNIPPET_CONTEXT);
  const end = Math.min(value.length, start + SNIPPET_LENGTH);
  return `${start > 0 ? '…' : ''}${value.slice(start, end).trim()}${end < value.length ? '…' : ''}`;
}

/** Which property of an asset contains the text, if not its name. */
function assetMatch(asset: AssetRow, type: AssetTypeRow, text: string): AssetSearchResult['match'] {
  const needle = text.toLowerCase();
  if (asset.name.toLowerCase().includes(needle)) return null;
  for (const field of assetTextFields) {
    const value = asset[field];
    if (value?.toLowerCase().includes(needle)) {
      return { field, label: null, value: snippet(value, text) };
    }
  }
  const labels = new Map(fieldsOf(type).map((field) => [field.key, field.label]));
  for (const [key, raw] of Object.entries(asset.customFields)) {
    const value = String(raw);
    if (value.toLowerCase().includes(needle)) {
      return { field: 'customField', label: labels.get(key) ?? key, value: snippet(value, text) };
    }
  }
  return null;
}

/** Exact name first, then names starting with the text, then any other match. */
function nameRank(column: typeof schema.assets.name | typeof schema.areas.name, text: string) {
  return sql`case
    when lower(${column}) = lower(${text}) then 0
    when ${column} ilike ${prefixPattern(text)} then 1
    when ${column} ilike ${containsPattern(text)} then 2
    else 3
  end`;
}

/**
 * One search box over everything the user can see. Each kind of element is
 * searched in its own query, limited to the areas the user can read, the same
 * rule as its own list. New modules add a group here.
 */
@Injectable()
export class SearchService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly access: AreaAccessService,
  ) {}

  async search(user: CurrentUser, query: SearchQuery): Promise<SearchResponse> {
    const [assets, areas] = await Promise.all([
      this.searchAssets(user, query),
      this.searchAreas(user, query),
    ]);
    return { assets, areas };
  }

  /** Name, common properties and the text of custom field values. */
  private async searchAssets(
    user: CurrentUser,
    { q, limit }: SearchQuery,
  ): Promise<SearchResponse['assets']> {
    const pattern = containsPattern(q);
    const where = and(
      or(
        ilike(schema.assets.name, pattern),
        ...assetTextFields.map((field) => ilike(schema.assets[field], pattern)),
        sql`exists (select 1 from jsonb_each_text(${schema.assets.customFields}) as field
          where field.value ilike ${pattern})`,
      ),
      this.access.readableAreas(user, schema.assets.areaId),
    );

    const [rows, totals] = await Promise.all([
      this.database.db
        .select({ asset: schema.assets, areaName: schema.areas.name, type: schema.assetTypes })
        .from(schema.assets)
        .innerJoin(schema.areas, eq(schema.areas.id, schema.assets.areaId))
        .innerJoin(schema.assetTypes, eq(schema.assetTypes.id, schema.assets.typeId))
        .where(where)
        .orderBy(
          nameRank(schema.assets.name, q),
          asc(sql`lower(${schema.assets.name})`),
          asc(schema.assets.id),
        )
        .limit(limit),
      this.database.db.select({ total: count() }).from(schema.assets).where(where),
    ]);

    return {
      results: rows.map(({ asset, areaName, type }) => ({
        id: asset.id,
        name: asset.name,
        status: asset.status,
        area: { id: asset.areaId, name: areaName },
        type: { id: type.id, name: type.name },
        match: assetMatch(asset, type, q),
      })),
      total: totals[0]?.total ?? 0,
    };
  }

  private async searchAreas(
    user: CurrentUser,
    { q, limit }: SearchQuery,
  ): Promise<SearchResponse['areas']> {
    const pattern = containsPattern(q);
    const where = and(
      or(ilike(schema.areas.name, pattern), ilike(schema.areas.description, pattern)),
      this.access.readableAreas(user, schema.areas.id),
    );

    const [rows, totals] = await Promise.all([
      this.database.db
        .select()
        .from(schema.areas)
        .where(where)
        .orderBy(nameRank(schema.areas.name, q), asc(sql`lower(${schema.areas.name})`))
        .limit(limit),
      this.database.db.select({ total: count() }).from(schema.areas).where(where),
    ]);

    return {
      results: rows.map((area): AreaSearchResult => ({
        id: area.id,
        name: area.name,
        description: area.description,
      })),
      total: totals[0]?.total ?? 0,
    };
  }
}
