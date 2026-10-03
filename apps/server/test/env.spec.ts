import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';

const SECRET = 'x'.repeat(32);

describe('loadEnv platform settings', () => {
  it('defaults PLATFORM_DOMAIN to localhost and lowercases it', () => {
    expect(loadEnv({ DATABASE_URL: 'postgres://db' }).PLATFORM_DOMAIN).toBe('localhost');
    expect(
      loadEnv({ DATABASE_URL: 'postgres://db', PLATFORM_DOMAIN: 'Shops.Example.COM' })
        .PLATFORM_DOMAIN,
    ).toBe('shops.example.com');
  });

  it('allows no edge secret in development', () => {
    expect(loadEnv({ DATABASE_URL: 'postgres://db' }).TRUSTED_EDGE_SECRET).toBeUndefined();
  });

  it('refuses production without an edge secret, naming the variable', () => {
    expect(() => loadEnv({ DATABASE_URL: 'postgres://db', NODE_ENV: 'production' })).toThrow(
      /TRUSTED_EDGE_SECRET/,
    );
  });

  it('refuses a short edge secret', () => {
    expect(() =>
      loadEnv({ DATABASE_URL: 'postgres://db', TRUSTED_EDGE_SECRET: 'too-short' }),
    ).toThrow(/TRUSTED_EDGE_SECRET/);
  });

  it('accepts production with a valid edge secret', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgres://db',
      NODE_ENV: 'production',
      TRUSTED_EDGE_SECRET: SECRET,
    });
    expect(env.TRUSTED_EDGE_SECRET).toBe(SECRET);
  });
});
