import { describe, expect, it } from 'vitest';
import { safeNext, shopperCookieOptions, whatsAppLink } from '../src/lib/account/shopper-cookie';

describe('where signing in leads', () => {
  it('stays on this shop, whatever the link says', () => {
    expect(safeNext('/checkout')).toBe('/checkout');
    expect(safeNext('/account/addresses')).toBe('/account/addresses');
    for (const away of [
      'https://elsewhere.example',
      '//elsewhere.example',
      '/\\elsewhere.example',
    ]) {
      expect(safeNext(away)).toBe('/account');
    }
    expect(safeNext(undefined)).toBe('/account');
    expect(safeNext(['/a', '/b'])).toBe('/account');
    expect(safeNext('', '/')).toBe('/');
  });
});

describe('the sign-in cookie (CUS-03)', () => {
  it('is out of reach of scripts, and secure everywhere but a machine of its own', () => {
    const shop = shopperCookieOptions('megh.lytro.app', '2026-12-03T00:00:00.000Z');
    expect(shop).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true, path: '/' });
    expect(shop.expires.toISOString()).toBe('2026-12-03T00:00:00.000Z');
    expect(shopperCookieOptions('shop.example.com', shop.expires.toISOString()).secure).toBe(true);
    expect(shopperCookieOptions('megh.localhost', shop.expires.toISOString()).secure).toBe(false);
    expect(shopperCookieOptions('localhost', shop.expires.toISOString()).secure).toBe(false);
    expect(shopperCookieOptions('notlocalhost', shop.expires.toISOString()).secure).toBe(true);
  });
});

describe("a shop's WhatsApp (CUS-14)", () => {
  it('takes the country code, however the number was written', () => {
    expect(whatsAppLink('01711-223344')).toBe('https://wa.me/8801711223344');
    expect(whatsAppLink('+880 1711 223344')).toBe('https://wa.me/8801711223344');
  });
});
