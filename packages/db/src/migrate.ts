import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client.js';
import { databaseUrlFromEnv } from './env.js';

// Resolves to packages/db/drizzle from both src/ (tests) and dist/ (runtime).
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));

export async function runMigrations(connectionString: string): Promise<void> {
  const { db, pool } = createDatabase(connectionString);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

// CLI entrypoint: `node dist/migrate.js` (used by `pnpm db:migrate` and Docker).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations(databaseUrlFromEnv())
    .then(() => process.stdout.write('Migrations applied.\n'))
    .catch((error: unknown) => {
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
      console.error('Migration failed:', cause instanceof Error ? cause.message : cause);
      process.exitCode = 1;
    });
}
