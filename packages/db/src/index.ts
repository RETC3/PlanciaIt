export * from './client.js';
export * from './env.js';
export * as schema from './schema/index.js';
// Query operators, re-exported so consumers share this package's drizzle-orm instance.
export {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
export { runMigrations } from './migrate.js';
