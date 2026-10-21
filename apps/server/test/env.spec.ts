import { describe, expect, it } from 'vitest';
import { EnvironmentParser } from '../src/config/env';

const SECRET = 'x'.repeat(32);
const DATA_KEY = Buffer.alloc(32, 7).toString('base64');
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
      DATA_ENCRYPTION_KEY: DATA_KEY,
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

describe('edge settings (D14)', () => {
  it('defaults the client address to the last entry of X-Forwarded-For, one trusted hop', () => {
    const env = new EnvironmentParser().parse(BASE);
    expect(env).toMatchObject({
      CLIENT_IP_HEADER: 'x-forwarded-for',
      CLIENT_IP_FORMAT: 'list',
      TRUSTED_PROXY_HOPS: 1,
    });
  });

  it('accepts a rotation secret only together with the current secret', () => {
    expect(() =>
      new EnvironmentParser().parse({ ...BASE, TRUSTED_EDGE_SECRET_NEXT: SECRET }),
    ).toThrow(/TRUSTED_EDGE_SECRET_NEXT/);
    const env = new EnvironmentParser().parse({
      ...BASE,
      TRUSTED_EDGE_SECRET: SECRET,
      TRUSTED_EDGE_SECRET_NEXT: `${SECRET}-next`,
    });
    expect(env.TRUSTED_EDGE_SECRET_NEXT).toBe(`${SECRET}-next`);
  });

  it('refuses an unknown client address format', () => {
    expect(() => new EnvironmentParser().parse({ ...BASE, CLIENT_IP_FORMAT: 'csv' })).toThrow(
      /CLIENT_IP_FORMAT/,
    );
  });

  it("needs the media Worker's account and store with its Cloudflare token (MED-10)", () => {
    expect(() => new EnvironmentParser().parse({ ...BASE, CLOUDFLARE_API_TOKEN: 'token' })).toThrow(
      /CLOUDFLARE_ACCOUNT_ID[\s\S]*MEDIA_EDGE_KV_NAMESPACE_ID|MEDIA_EDGE_KV_NAMESPACE_ID[\s\S]*CLOUDFLARE_ACCOUNT_ID/,
    );
    const env = new EnvironmentParser().parse({
      ...BASE,
      CLOUDFLARE_API_TOKEN: 'token',
      CLOUDFLARE_ACCOUNT_ID: 'account',
      MEDIA_EDGE_KV_NAMESPACE_ID: 'namespace',
    });
    expect(env.MEDIA_USAGE_DATASET).toBe('lytro_media_usage');
  });

  it('refuses production without the key credentials are sealed with, and a key of the wrong size (SEC-10)', () => {
    expect(() =>
      new EnvironmentParser().parse({
        ...BASE,
        NODE_ENV: 'production',
        TRUSTED_EDGE_SECRET: SECRET,
      }),
    ).toThrow(/DATA_ENCRYPTION_KEY/);
    expect(() =>
      new EnvironmentParser().parse({
        ...BASE,
        DATA_ENCRYPTION_KEY: Buffer.alloc(16, 7).toString('base64'),
      }),
    ).toThrow(/DATA_ENCRYPTION_KEY/);
    expect(
      new EnvironmentParser().parse({ ...BASE, DATA_ENCRYPTION_PREVIOUS_KEY: DATA_KEY })
        .DATA_ENCRYPTION_PREVIOUS_KEY,
    ).toBe(DATA_KEY);
  });

  it('refuses a usage dataset name that is not a plain name, since it is written into a query', () => {
    expect(() =>
      new EnvironmentParser().parse({ ...BASE, MEDIA_USAGE_DATASET: 'usage; DROP' }),
    ).toThrow(/MEDIA_USAGE_DATASET/);
  });
});
