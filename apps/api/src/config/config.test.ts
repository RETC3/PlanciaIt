import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('applies development defaults', () => {
    const config = loadConfig({});
    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(3000);
    expect(config.databaseUrl).toContain('localhost');
  });

  it('requires DATABASE_URL in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
  });

  it('does not include variable values in error messages', () => {
    expect(() => loadConfig({ API_PORT: 'secret-value' })).toThrow(/API_PORT/);
    expect(() => loadConfig({ API_PORT: 'secret-value' })).not.toThrow(/secret-value/);
  });
});
