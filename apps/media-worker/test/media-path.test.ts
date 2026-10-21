import { describe, expect, it } from 'vitest';
import { readMediaPath } from '../src/media-path';
import { SHOP } from './fakes';

// MED-01, TEN-06: a media path names one shop's object, and nothing outside that shop's prefix.
describe('reading a media path (MED-01)', () => {
  it("names a shop's public and private objects", () => {
    expect(readMediaPath(`/tenants/${SHOP}/m1/abc.webp`)).toEqual({
      tenantId: SHOP,
      key: `tenants/${SHOP}/m1/abc.webp`,
      private: false,
    });
    expect(readMediaPath(`/tenants/${SHOP}/private/proof.webp`)).toMatchObject({ private: true });
    // A public file that merely is called "private" is public.
    expect(readMediaPath(`/tenants/${SHOP}/private`)).toMatchObject({ private: false });
  });

  it('refuses anything that could reach outside the shop prefix', () => {
    for (const path of [
      '/',
      '/key-check/x.txt',
      `/tenants/${SHOP}`,
      `/tenants/${SHOP}/`,
      '/tenants/not-a-shop/m1/a.webp',
      `/tenants/${SHOP.toUpperCase()}/m1/a.webp`,
      `/tenants/${SHOP}/m1//a.webp`,
      `/tenants/${SHOP}/../other/a.webp`,
      `/tenants/${SHOP}/.hidden`,
      `/tenants/${SHOP}/m1/a%2Fb.webp`,
      `/media/tenants/${SHOP}/m1/a.webp`,
    ]) {
      expect(readMediaPath(path), path).toBeNull();
    }
  });
});
