import { DEV_DATABASE_URL } from '@planciait/db';
import { z } from 'zod';

/** Development only: production refuses to start without its own SECRET_KEY. */
const DEV_SECRET_KEY = 'ZGV2LW9ubHktc2VjcmV0LWtleS1kby1ub3QtdXNlISE';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    DATABASE_URL: z.string().min(1).optional(),
    /** 32 random bytes, base64url (43 characters). */
    SECRET_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/, 'must be 32 bytes encoded as base64url')
      .optional(),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
    SESSION_MAX_HOURS: z.coerce.number().int().min(1).max(168).default(12),
    /** Express "trust proxy" value, so client IPs are read correctly behind Caddy. */
    TRUST_PROXY: z.string().min(1).default('loopback'),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.DATABASE_URL !== undefined, {
    message: 'DATABASE_URL is required in production',
    path: ['DATABASE_URL'],
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.SECRET_KEY !== undefined, {
    message: 'SECRET_KEY is required in production',
    path: ['SECRET_KEY'],
  });

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl: string;
  secretKey: string;
  sessionIdleMinutes: number;
  sessionMaxHours: number;
  trustProxy: string;
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
    secretKey: parsed.SECRET_KEY ?? DEV_SECRET_KEY,
    sessionIdleMinutes: parsed.SESSION_IDLE_MINUTES,
    sessionMaxHours: parsed.SESSION_MAX_HOURS,
    trustProxy: parsed.TRUST_PROXY,
  };
}
