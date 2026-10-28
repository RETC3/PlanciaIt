import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const PRODUCTION_KEY = 'A'.repeat(43);

describe('loadConfig', () => {
  it('applies development defaults', () => {
    const config = loadConfig({});
    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3000);
    expect(config.databaseUrl).toContain('localhost');
    expect(config.secretKey).toHaveLength(43);
    expect(config.sessionIdleMinutes).toBe(30);
    expect(config.sessionMaxHours).toBe(12);
  });

  it('requires DATABASE_URL in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', SECRET_KEY: PRODUCTION_KEY })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('requires SECRET_KEY in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' })).toThrow(
      /SECRET_KEY/,
    );
  });

  it('rejects a malformed SECRET_KEY', () => {
    expect(() => loadConfig({ SECRET_KEY: 'too-short' })).toThrow(/SECRET_KEY/);
  });

  it('does not include variable values in error messages', () => {
    expect(() => loadConfig({ API_PORT: 'secret-value' })).toThrow(/API_PORT/);
    expect(() => loadConfig({ API_PORT: 'secret-value' })).not.toThrow(/secret-value/);
    expect(() => loadConfig({ SECRET_KEY: 'secret-value' })).not.toThrow(/secret-value/);
  });
});
