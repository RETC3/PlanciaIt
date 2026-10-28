/** Local development database started by deploy/docker-compose.dev.yml. */
export const DEV_DATABASE_URL = 'postgres://planciait:planciait@localhost:5432/planciait';

export function databaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return env.DATABASE_URL ?? DEV_DATABASE_URL;
}
