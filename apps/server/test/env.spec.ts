import { describe, expect, it } from 'vitest';
import { EnvironmentParser } from '../src/config/env';

const SECRET = 'x'.repeat(32);
const BASE = { DATABASE_URL: 'postgres://db', OTP_SECRET: SECRET };

describe('loadEnv platform settings', () => {
  it('defaults PLATFORM_DOMAIN to localhost and lowercases it', () => {
    expect(new EnvironmentParser().parse(BASE).PLATFORM_DOMAIN).toBe('localhost');
    expect(
      new EnvironmentParser().parse({ ...BASE, PLATFORM_DOMAIN: 'Shops.Example.COM' })
        .PLATFORM_DOMAIN,
    ).toBe('shops.example.com');
  });

  it('allows no edge secret in development', () => {
    expect(new EnvironmentParser().parse(BASE).TRUSTED_EDGE_SECRET).toBeUndefined();
  });

  it('refuses production without an edge secret, naming the variable', () => {
    expect(() => new EnvironmentParser().parse({ ...BASE, NODE_ENV: 'production' })).toThrow(
      /TRUSTED_EDGE_SECRET/,
    );
  });

  it('refuses a short edge secret', () => {
    expect(() =>
      new EnvironmentParser().parse({ ...BASE, TRUSTED_EDGE_SECRET: 'too-short' }),
    ).toThrow(/TRUSTED_EDGE_SECRET/);
  });

  it('accepts production with a valid edge secret', () => {
    const env = new EnvironmentParser().parse({
      ...BASE,
      NODE_ENV: 'production',
      TRUSTED_EDGE_SECRET: SECRET,
    });
    expect(env.TRUSTED_EDGE_SECRET).toBe(SECRET);
  });

  it('refuses to start without the one-time code secret (AUTH-05)', () => {
    expect(() => new EnvironmentParser().parse({ DATABASE_URL: 'postgres://db' })).toThrow(
      /OTP_SECRET/,
    );
  });

  it('refuses a short one-time code secret', () => {
    expect(() => new EnvironmentParser().parse({ ...BASE, OTP_SECRET: 'short' })).toThrow(
      /OTP_SECRET/,
    );
  });
});

describe('database pool settings', () => {
  it('defaults to five connections, a 5 second wait and a 10 second statement limit', () => {
    const env = new EnvironmentParser().parse(BASE);
    expect(env.DATABASE_POOL_MAX).toBe(5);
    expect(env.DATABASE_CONNECT_TIMEOUT_MS).toBe(5000);
    expect(env.DATABASE_STATEMENT_TIMEOUT_MS).toBe(10000);
  });

  it('reads the pool size from the environment', () => {
    const env = new EnvironmentParser().parse({ ...BASE, DATABASE_POOL_MAX: '12' });
    expect(env.DATABASE_POOL_MAX).toBe(12);
  });

  it('refuses a pool size outside 1 to 100, naming the variable', () => {
    expect(() => new EnvironmentParser().parse({ ...BASE, DATABASE_POOL_MAX: '0' })).toThrow(
      /DATABASE_POOL_MAX/,
    );
    expect(() => new EnvironmentParser().parse({ ...BASE, DATABASE_POOL_MAX: '101' })).toThrow(
      /DATABASE_POOL_MAX/,
    );
  });
});
