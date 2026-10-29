import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth.js';

export const elementType = pgEnum('element_type', ['asset']);

export const relationKind = pgEnum('relation_kind', [
  'depends_on',
  'runs_on',
  'located_in',
  'backed_up_to',
  'connected_to',
  'related_to',
]);

/**
 * A link between two elements of any type, read from source to target
 * ("source runs on target"). The ends are polymorphic, so there are no
 * foreign keys: a trigger on each element table deletes the relations of a
 * deleted element (see migration 0005). Symmetric kinds are stored with the
 * ends in a canonical order, so the unique index also catches the reverse.
 * Relations are created and deleted, never edited.
 */
export const relations = pgTable(
  'relations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: relationKind('kind').notNull(),
    sourceType: elementType('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    targetType: elementType('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    note: text('note'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('relations_ends_key').on(
      table.kind,
      table.sourceType,
      table.sourceId,
      table.targetType,
      table.targetId,
    ),
    index('relations_source_idx').on(table.sourceType, table.sourceId),
    index('relations_target_idx').on(table.targetType, table.targetId),
    check(
      'relations_not_self',
      sql`${table.sourceType} <> ${table.targetType} OR ${table.sourceId} <> ${table.targetId}`,
    ),
  ],
);
