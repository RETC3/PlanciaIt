import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle, as passed to `db.transaction(async (tx) => …)`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Anything that can run queries: the pool-backed client or an open transaction. */
export type DbExecutor = Db | Tx;

export interface Database {
  db: Db;
  pool: pg.Pool;
}

export interface DatabaseOptions {
  /** Called when an idle pooled connection fails (e.g. the server restarts). */
  onPoolError?: (error: Error) => void;
}

export function createDatabase(connectionString: string, options: DatabaseOptions = {}): Database {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  // Without a listener an idle-client error would crash the process.
  pool.on('error', (error) => options.onPoolError?.(error));

  return { db: drizzle(pool, { schema }), pool };
}

/** Runs a trivial query; rejects if the database is unreachable. */
export async function pingDatabase(db: Db): Promise<void> {
  await db.execute(sql`select 1`);
}
