import { describe, expect, it } from 'vitest';
import { HostClassifier } from '../src/tenancy/services/host-classifier';
import { SlugFormat } from '../src/tenancy/services/slug-format';

const format = new SlugFormat();
const hosts = new HostClassifier('localhost', format);

describe('normalizeHost (TEN-7a)', () => {
  it('lowercases and drops the port', () => {
    expect(hosts.normalize('Fashion-House.LOCALHOST:3001')).toBe('fashion-house.localhost');
  });

  it('drops a trailing dot', () => {
    expect(hosts.normalize('shop.example.com.')).toBe('shop.example.com');
  });

  it('refuses missing, empty and malformed values', () => {
    expect(hosts.normalize(undefined)).toBeNull();
    expect(hosts.normalize('')).toBeNull();
    expect(hosts.normalize('   ')).toBeNull();
    expect(hosts.normalize('bad_host.localhost')).toBeNull();
    expect(hosts.normalize('[::1]:3000')).toBeNull();
    expect(hosts.normalize('-leading.localhost')).toBeNull();
    expect(hosts.normalize('a..b.localhost')).toBeNull();
  });
});

describe('isValidSlug (AUTH-11)', () => {
  it('accepts 3 to 30 characters of a–z, 0–9 and hyphen', () => {
    expect(format.isValid('abc')).toBe(true);
    expect(format.isValid('fashion-house-2')).toBe(true);
    expect(format.isValid('a'.repeat(30))).toBe(true);
  });

  it('refuses short, long, uppercase and edge-hyphen slugs', () => {
    expect(format.isValid('ab')).toBe(false);
    expect(format.isValid('a'.repeat(31))).toBe(false);
    expect(format.isValid('Shop')).toBe(false);
    expect(format.isValid('-shop')).toBe(false);
    expect(format.isValid('shop-')).toBe(false);
    expect(format.isValid('sh_op')).toBe(false);
  });
});

describe('classifyHost (TEN-7a, TEN-24)', () => {
  const platform = 'localhost';

  it('maps a single label under the platform domain to a shop slug', () => {
    expect(new HostClassifier(platform, format).classify('fashion-house.localhost:3001')).toEqual({
      kind: 'shop',
      slug: 'fashion-house',
    });
  });

  it('treats the bare platform domain as no shop', () => {
    expect(new HostClassifier(platform, format).classify('localhost:3000')).toEqual({
      kind: 'platform',
    });
  });

  it('refuses nested labels under the platform domain', () => {
    expect(new HostClassifier(platform, format).classify('a.b.localhost')).toEqual({
      kind: 'invalid',
    });
  });

  it('refuses a label that is not a valid slug', () => {
    expect(new HostClassifier(platform, format).classify('ab.localhost')).toEqual({
      kind: 'invalid',
    });
    expect(new HostClassifier(platform, format).classify('Bad_Shop.localhost')).toEqual({
      kind: 'invalid',
    });
  });

  it('treats any other host as a custom domain candidate', () => {
    expect(new HostClassifier(platform, format).classify('www.fashionhouse.com')).toEqual({
      kind: 'custom',
      hostname: 'www.fashionhouse.com',
    });
  });

  it('does not treat a host that merely ends with the platform text as a shop', () => {
    expect(new HostClassifier(platform, format).classify('evillocalhost')).toEqual({
      kind: 'custom',
      hostname: 'evillocalhost',
    });
  });

  it('refuses a missing or malformed host without any lookup', () => {
    expect(new HostClassifier(platform, format).classify(undefined)).toEqual({ kind: 'invalid' });
    expect(new HostClassifier(platform, format).classify('bad host')).toEqual({ kind: 'invalid' });
  });

  it('uses the configured platform domain, case-insensitively', () => {
    expect(new HostClassifier('example.com', format).classify('shop.Example.COM')).toEqual({
      kind: 'shop',
      slug: 'shop',
    });
  });
});
