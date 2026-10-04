import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';

const SECRET = 'x'.repeat(32);
const BASE = { DATABASE_URL: 'postgres://db', OTP_SECRET: SECRET };

describe('loadEnv platform settings', () => {
  it('defaults PLATFORM_DOMAIN to localhost and lowercases it', () => {
    expect(loadEnv(BASE).PLATFORM_DOMAIN).toBe('localhost');
    expect(loadEnv({ ...BASE, PLATFORM_DOMAIN: 'Shops.Example.COM' }).PLATFORM_DOMAIN).toBe(
      'shops.example.com',
    );
  });

  it('allows no edge secret in development', () => {
    expect(loadEnv(BASE).TRUSTED_EDGE_SECRET).toBeUndefined();
  });

  it('refuses production without an edge secret, naming the variable', () => {
    expect(() => loadEnv({ ...BASE, NODE_ENV: 'production' })).toThrow(/TRUSTED_EDGE_SECRET/);
  });

  it('refuses a short edge secret', () => {
    expect(() => loadEnv({ ...BASE, TRUSTED_EDGE_SECRET: 'too-short' })).toThrow(
      /TRUSTED_EDGE_SECRET/,
    );
  });

  it('accepts production with a valid edge secret', () => {
    const env = loadEnv({ ...BASE, NODE_ENV: 'production', TRUSTED_EDGE_SECRET: SECRET });
    expect(env.TRUSTED_EDGE_SECRET).toBe(SECRET);
  });

  it('refuses to start without the one-time code secret (AUTH-05)', () => {
    expect(() => loadEnv({ DATABASE_URL: 'postgres://db' })).toThrow(/OTP_SECRET/);
  });

  it('refuses a short one-time code secret', () => {
    expect(() => loadEnv({ ...BASE, OTP_SECRET: 'short' })).toThrow(/OTP_SECRET/);
  });
});
