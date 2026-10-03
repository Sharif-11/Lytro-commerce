import { describe, expect, it } from 'vitest';
import { TenantCache } from '../src/tenancy/tenant-cache';

const SHOP = { id: 'shop-1', slug: 'fashion-house', state: 'active' };

function clock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('TenantCache (R5)', () => {
  it('returns a value within 60 seconds', () => {
    const time = clock();
    const cache = new TenantCache(60_000, time.now);
    cache.set('fashion-house.localhost', SHOP);
    time.advance(59_999);
    expect(cache.get('fashion-house.localhost')).toEqual(SHOP);
  });

  it('expires exactly at 60 seconds', () => {
    const time = clock();
    const cache = new TenantCache(60_000, time.now);
    cache.set('fashion-house.localhost', SHOP);
    time.advance(60_000);
    expect(cache.get('fashion-house.localhost')).toBeUndefined();
  });

  it('drops every host of a shop when it is invalidated', () => {
    const cache = new TenantCache();
    cache.set('fashion-house.localhost', SHOP);
    cache.set('shop.fashionhouse.com', SHOP);
    cache.set('other.localhost', { id: 'shop-2', slug: 'other', state: 'active' });
    cache.invalidateTenant('shop-1');
    expect(cache.get('fashion-house.localhost')).toBeUndefined();
    expect(cache.get('shop.fashionhouse.com')).toBeUndefined();
    expect(cache.get('other.localhost')).toBeDefined();
  });

  it('evicts the oldest entry when full, so memory stays bounded', () => {
    const cache = new TenantCache(60_000, () => 0, 2);
    cache.set('a.localhost', SHOP);
    cache.set('b.localhost', SHOP);
    cache.set('c.localhost', SHOP);
    expect(cache.get('a.localhost')).toBeUndefined();
    expect(cache.get('b.localhost')).toBeDefined();
    expect(cache.get('c.localhost')).toBeDefined();
  });
});
