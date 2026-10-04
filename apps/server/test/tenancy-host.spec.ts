import { describe, expect, it } from 'vitest';
import { classifyHost, isValidSlug, normalizeHost } from '../src/tenancy/services/host';

describe('normalizeHost (TEN-7a)', () => {
  it('lowercases and drops the port', () => {
    expect(normalizeHost('Fashion-House.LOCALHOST:3001')).toBe('fashion-house.localhost');
  });

  it('drops a trailing dot', () => {
    expect(normalizeHost('shop.example.com.')).toBe('shop.example.com');
  });

  it('refuses missing, empty and malformed values', () => {
    expect(normalizeHost(undefined)).toBeNull();
    expect(normalizeHost('')).toBeNull();
    expect(normalizeHost('   ')).toBeNull();
    expect(normalizeHost('bad_host.localhost')).toBeNull();
    expect(normalizeHost('[::1]:3000')).toBeNull();
    expect(normalizeHost('-leading.localhost')).toBeNull();
    expect(normalizeHost('a..b.localhost')).toBeNull();
  });
});

describe('isValidSlug (AUTH-11)', () => {
  it('accepts 3 to 30 characters of a–z, 0–9 and hyphen', () => {
    expect(isValidSlug('abc')).toBe(true);
    expect(isValidSlug('fashion-house-2')).toBe(true);
    expect(isValidSlug('a'.repeat(30))).toBe(true);
  });

  it('refuses short, long, uppercase and edge-hyphen slugs', () => {
    expect(isValidSlug('ab')).toBe(false);
    expect(isValidSlug('a'.repeat(31))).toBe(false);
    expect(isValidSlug('Shop')).toBe(false);
    expect(isValidSlug('-shop')).toBe(false);
    expect(isValidSlug('shop-')).toBe(false);
    expect(isValidSlug('sh_op')).toBe(false);
  });
});

describe('classifyHost (TEN-7a, TEN-24)', () => {
  const platform = 'localhost';

  it('maps a single label under the platform domain to a shop slug', () => {
    expect(classifyHost('fashion-house.localhost:3001', platform)).toEqual({
      kind: 'shop',
      slug: 'fashion-house',
    });
  });

  it('treats the bare platform domain as no shop', () => {
    expect(classifyHost('localhost:3000', platform)).toEqual({ kind: 'platform' });
  });

  it('refuses nested labels under the platform domain', () => {
    expect(classifyHost('a.b.localhost', platform)).toEqual({ kind: 'invalid' });
  });

  it('refuses a label that is not a valid slug', () => {
    expect(classifyHost('ab.localhost', platform)).toEqual({ kind: 'invalid' });
    expect(classifyHost('Bad_Shop.localhost', platform)).toEqual({ kind: 'invalid' });
  });

  it('treats any other host as a custom domain candidate', () => {
    expect(classifyHost('www.fashionhouse.com', platform)).toEqual({
      kind: 'custom',
      hostname: 'www.fashionhouse.com',
    });
  });

  it('does not treat a host that merely ends with the platform text as a shop', () => {
    expect(classifyHost('evillocalhost', platform)).toEqual({
      kind: 'custom',
      hostname: 'evillocalhost',
    });
  });

  it('refuses a missing or malformed host without any lookup', () => {
    expect(classifyHost(undefined, platform)).toEqual({ kind: 'invalid' });
    expect(classifyHost('bad host', platform)).toEqual({ kind: 'invalid' });
  });

  it('uses the configured platform domain, case-insensitively', () => {
    expect(classifyHost('shop.Example.COM', 'example.com')).toEqual({
      kind: 'shop',
      slug: 'shop',
    });
  });
});
