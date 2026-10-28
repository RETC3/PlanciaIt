import { defineConfig } from 'drizzle-kit';
import { databaseUrlFromEnv } from './src/env.js';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: databaseUrlFromEnv() },
  strict: true,
  verbose: true,
});
