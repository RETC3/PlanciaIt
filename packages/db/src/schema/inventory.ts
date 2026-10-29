import { sql } from 'drizzle-orm';
import { index, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { areas } from './areas.js';
import { timestamps } from './columns.js';

/** A custom field value as stored; the API validates it against the type's definition. */
export type CustomFieldValue = string | number | boolean;

/**
 * What kind of thing an asset is (server, switch…) and which custom fields it
 * has. Types are global; the field definitions are validated by the API with
 * the shared zod schemas, so the column is typed loosely here.
 */
export const assetTypes = pgTable(
  'asset_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    fields: jsonb('fields').$type<unknown[]>().notNull().default([]),
    ...timestamps,
  },
  (table) => [uniqueIndex('asset_types_name_key').on(sql`lower(${table.name})`)],
);

export const assetStatus = pgEnum('asset_status', ['in_use', 'in_stock', 'maintenance', 'retired']);

/** An inventory item. It belongs to one area and inherits its permissions. */
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // RESTRICT: an area or a type still holding assets cannot be deleted.
    areaId: uuid('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'restrict' }),
    typeId: uuid('type_id')
      .notNull()
      .references(() => assetTypes.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    status: assetStatus('status').notNull().default('in_use'),
    hostname: text('hostname'),
    ipAddress: text('ip_address'),
    serialNumber: text('serial_number'),
    manufacturer: text('manufacturer'),
    model: text('model'),
    location: text('location'),
    notes: text('notes'),
    /** Values keyed by the custom field key of the asset's type. */
    customFields: jsonb('custom_fields')
      .$type<Record<string, CustomFieldValue>>()
      .notNull()
      .default({}),
    ...timestamps,
  },
  (table) => [
    index('assets_area_id_idx').on(table.areaId),
    index('assets_type_id_idx').on(table.typeId),
    index('assets_name_idx').on(sql`lower(${table.name})`),
  ],
);
