import { Script } from 'node:vm';
import { contrastRatio } from '@lytronix/validators';
import { BrandCorners, BrandFont, BrandSpacing } from '@lytronix/validators/enums';
import { describe, expect, it } from 'vitest';
import type { PublicBrand, PublicShop } from '../src/lib/api/storefront-api';
import {
  iconVersion,
  isStoreIconFile,
  storefrontManifest,
  themeColor,
} from '../src/lib/app/app-manifest';
import { PAGES_KEPT, serviceWorkerSource } from '../src/lib/app/service-worker';
import { storefrontTheme } from '../src/lib/brand/brand-theme';

// The dashboard prototype's Part 24 maroon shop, as the storefront sketch draws it (STOREFRONT-DESIGN v1.2).
const maroon: PublicBrand = {
  version: 'b1',
  colors: {
    main: '#7a1f2b',
    accent: '#f2a516',
    background: '#fbf7f0',
    onMain: '#ffffff',
    onAccent: '#10201f',
    text: '#10201f',
    mainText: '#7a1f2b',
  },
  fonts: {
    heading: { id: BrandFont.NotoSerifBengaliFraunces },
    body: { id: BrandFont.HindSiliguriPlusJakartaSans },
  },
  corners: BrandCorners.Round,
  spacing: BrandSpacing.Airy,
  darkLogo: null,
  icon: null,
};
const shop = (brand: PublicBrand | null, name = 'Megh Fashion House'): PublicShop => ({
  name,
  slug: 'megh',
  metaPixelId: null,
  logo: null,
  contact: { phone: null, email: null, address: null },
  deliveryZones: [],
  brand,
});

describe("a shop's own identity on its storefront (BRN-02, Slice 12c)", () => {
  it('takes the page background, the main colour family, both faces and the presets', () => {
    const theme = storefrontTheme(maroon);
    expect(theme.variables).toMatchObject({
      '--bg': '#fbf7f0',
      '--accent': '#7a1f2b',
      '--on-accent': '#ffffff',
      '--font-ui': "'Plus Jakarta Sans', 'Hind Siliguri', sans-serif",
      '--font-display': "'Fraunces', 'Noto Serif Bengali', serif",
    });
    expect(theme.corners).toBe('round');
    expect(theme.spacing).toBe('airy');
    // The main colour as words reads on the page, its soft tint and a white card.
    const words = theme.variables['--accent-text'] ?? '';
    for (const under of ['#fbf7f0', theme.variables['--accent-soft'] ?? '', '#ffffff']) {
      expect(contrastRatio(words, under)).toBeGreaterThanOrEqual(4.5);
    }
    // Nothing else changes: the status colours and the neutrals are Lytro's (BRN-04).
    expect(Object.keys(theme.variables).sort()).toEqual(
      [
        '--accent',
        '--accent-hover',
        '--accent-soft',
        '--accent-text',
        '--bg',
        '--font-display',
        '--font-ui',
        '--on-accent',
      ].sort(),
    );
  });

  it('asks Google only for the faces the storefront does not serve itself', () => {
    expect(storefrontTheme(maroon).fontsUrl).toBe(
      'https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=Hind+Siliguri:wght@400;700' +
        '&family=Noto+Serif+Bengali:wght@400;700&display=swap',
    );
    const lytros = {
      ...maroon,
      fonts: {
        heading: { id: BrandFont.NotoSansBengaliInter },
        body: { id: BrandFont.NotoSansBengaliInter },
      },
    };
    expect(storefrontTheme(lytros).fontsUrl).toBeNull();
    const display = {
      ...maroon,
      fonts: { ...maroon.fonts, heading: { id: BrandFont.GaladaPlayfairDisplay } },
    };
    expect(storefrontTheme(display).fontsUrl).toContain('family=Galada&');
  });
});

describe("the storefront's own app (SFT-14, Slice 12c)", () => {
  it("installs under the shop's plain name and icon, scoped to the whole storefront", () => {
    const manifest = storefrontManifest(shop(null));
    expect(manifest).toMatchObject({
      id: '/',
      name: 'Megh Fashion House',
      short_name: 'Megh',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#0e6b66',
      background_color: '#f6f9f8',
    });
    expect(manifest.icons.map((icon) => [icon.sizes, icon.purpose])).toEqual([
      ['192x192', 'any'],
      ['512x512', 'any'],
      ['512x512', 'maskable'],
    ]);
    for (const icon of manifest.icons)
      expect(icon.src).toMatch(/^\/icons\/store-[a-z0-9-]+\.png\?v=[0-9a-f]{12}$/);
  });

  it("takes the shop's colours while its identity shows, and new icon links when what they show changes", () => {
    const branded = storefrontManifest(shop(maroon));
    expect(branded).toMatchObject({ theme_color: '#7a1f2b', background_color: '#fbf7f0' });
    expect(themeColor(shop(null))).toBe('#0e6b66');
    const plain = iconVersion(shop(null));
    expect(iconVersion(shop(maroon))).not.toBe(plain);
    expect(iconVersion(shop(null, 'Megh'))).not.toBe(plain);
    expect(iconVersion(shop(null))).toBe(plain);
  });

  it("serves only the storefront app's own icons, never the dashboard's", () => {
    expect(isStoreIconFile('store-192.png')).toBe(true);
    expect(isStoreIconFile('store-apple-180.png')).toBe(true);
    expect(isStoreIconFile('icon-192.png')).toBe(false);
    expect(isStoreIconFile('../icon-192.png')).toBe(false);
  });
});

describe("the storefront's service worker (CCH-10, Slice 12c)", () => {
  it('is this build, compiles, and never keeps the cart, search or the API', () => {
    const source = serviceWorkerSource('build-42');
    expect(() => new Script(source)).not.toThrow();
    expect(source).toContain('const VERSION = "build-42";');
    expect(source).toContain(`const PAGES_KEPT = ${String(PAGES_KEPT)};`);
    expect(source).toMatch(/NEVER_KEPT = \['\/api\/', '\/search', '\/cart'/);
    // The offline page keeps the files it names, read by a regex that must survive the template string.
    expect(source).toContain(String.raw`html.match(/\/_next\/static\/[^"'\s)]+/g)`);
  });
});
