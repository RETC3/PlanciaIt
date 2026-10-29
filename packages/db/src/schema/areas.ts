import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.js';
import { timestamps } from './columns.js';

/**
 * An area groups the elements a team works on (assets, credentials,
 * procedures…); every element belongs to exactly one area and inherits its
 * permissions. Administrators see every area; technicians only their own.
 */
export const areas = pgTable(
  'areas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    ...timestamps,
  },
  (table) => [uniqueIndex('areas_name_key').on(sql`lower(${table.name})`)],
);

export const areaPermission = pgEnum('area_permission', ['read', 'write']);

/** Which technicians can access an area, and how. */
export const areaMembers = pgTable(
  'area_members',
  {
    areaId: uuid('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permission: areaPermission('permission').notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.areaId, table.userId] }),
    index('area_members_user_id_idx').on(table.userId),
  ],
);
