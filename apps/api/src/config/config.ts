import { z } from 'zod';

/** Matches deploy/docker-compose.dev.yml; used only outside production. */
const DEV_DATABASE_URL = 'postgres://planciait:planciait@localhost:5432/planciait';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    DATABASE_URL: z.string().min(1).optional(),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.DATABASE_URL !== undefined, {
    message: 'DATABASE_URL is required in production',
    path: ['DATABASE_URL'],
  });

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl: string;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // Only variable names and messages are reported, never values.
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const parsed = result.data;
  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.API_HOST,
    port: parsed.API_PORT,
    databaseUrl: parsed.DATABASE_URL ?? DEV_DATABASE_URL,
  };
}
