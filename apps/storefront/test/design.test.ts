import {
  BrandCorners,
  BrandFont,
  BrandSpacing,
  fontStack,
  ProductRowLayout,
  ProductRowSource,
  STOREFRONT_THEMES,
  StorefrontLinkKind,
  StorefrontSectionKind,
  StorefrontThemeKey,
  startingDesign,
  storefrontTokens,
  type StorefrontSection,
} from '@lytronix/validators';
import { describe, expect, it } from 'vitest';

import type { ServerAnswer } from '../src/lib/api/server-api';
import type { PublicBrand, PublicStorefrontDesign } from '../src/lib/api/storefront-api';
import { productQueryString, StorefrontApi } from '../src/lib/api/storefront-api';
import { iconVersion, themeColor } from '../src/lib/app/app-manifest';
import { designLook, frameBrand, pageTheme } from '../src/lib/design/design-look';
import { homeReadPlan, queryKey, rowQuery } from '../src/lib/design/home-reads';
import { linkHref } from '../src/lib/design/links';
import { firstLetter } from '../src/lib/design/marks';
import { EdgeCachePolicy } from '../src/lib/edge/edge-cache';
import { StorefrontEnvironment } from '../src/lib/env';

// STOREFRONT-BUILDER-PLAN: the designed home's plain functions -- what each row asks for, where a button leads, how a
// theme and the shop's identity dress the page -- and the preview read that is never kept.

const CATEGORY = { id: 'c1', slug: 'winter', name: 'Winter' };
const PRODUCT = { id: 'p1', slug: 'shawl', name: 'Shawl' };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function design(sections: StorefrontSection[]): PublicStorefrontDesign {
  return {
    theme: StorefrontThemeKey.Soft,
    palette: 0,
    sections,
    images: {},
    categories: [CATEGORY],
    products: [PRODUCT],
    preview: false,
  };
}

type ProductsSection = Extract<StorefrontSection, { kind: StorefrontSectionKind.Products }>;

function row(source: ProductRowSource, extra: Partial<ProductsSection> = {}): ProductsSection {
  return {
    id: id(1),
    visible: true,
    kind: StorefrontSectionKind.Products,
    source,
    categoryId: null,
    productIds: [],
    title: null,
    layout: ProductRowLayout.Grid,
    count: 4,
    ...extra,
  };
}

describe('what each product row asks for (SB-9)', () => {
  const reach = design([]);
  it('asks the order its source names, only what is in stock, as many as it shows', () => {
    expect(rowQuery(row(ProductRowSource.Newest), reach)).toEqual({
      inStock: true,
      limit: 4,
      sort: 'newest',
    });
    expect(rowQuery(row(ProductRowSource.OnSale, { count: 6 }), reach)).toEqual({
      inStock: true,
      limit: 6,
      sort: 'discount',
      onSale: true,
    });
    expect(rowQuery(row(ProductRowSource.BestSellers), reach)?.sort).toBe('best_selling');
  });

  it("asks a category by its link, and only the picked products shoppers can reach, in the seller's order", () => {
    expect(
      rowQuery(row(ProductRowSource.Category, { categoryId: CATEGORY.id }), reach),
    ).toMatchObject({ category: 'winter' });
    expect(rowQuery(row(ProductRowSource.Category, { categoryId: 'gone' }), reach)).toBeNull();
    expect(
      rowQuery(row(ProductRowSource.Picked, { productIds: ['gone', PRODUCT.id] }), reach),
    ).toEqual({ inStock: true, productIds: [PRODUCT.id] });
    expect(rowQuery(row(ProductRowSource.Picked, { productIds: ['gone'] }), reach)).toBeNull();
  });

  it("plans a starting design's reads once each: its rows, the auto hero, the offers and the trust strip's wallets", () => {
    const start = startingDesign(StorefrontThemeKey.Royal);
    const plan = homeReadPlan({ ...design([]), sections: start.sections });
    expect(plan).toMatchObject({ hero: true, offers: true, methods: true });
    expect(plan.rows.map((each) => each.query.sort)).toEqual(['best_selling', 'discount']);
    expect(queryKey({ sort: 'newest', limit: 4 })).toBe(queryKey({ limit: 4, sort: 'newest' }));
  });

  it('writes the new filters into the list request', () => {
    expect(productQueryString({ sort: 'discount', onSale: true, productIds: ['a', 'b'] })).toBe(
      'sort=discount&onSale=true&productIds=a%2Cb',
    );
  });
});

describe('where a button leads (SB-16)', () => {
  const reach = design([]);
  it('to the lists, a category or a product; one shoppers can no longer reach, home', () => {
    expect(linkHref({ kind: StorefrontLinkKind.OnSale }, reach)).toBe('/offers');
    expect(linkHref({ kind: StorefrontLinkKind.JustIn }, reach)).toBe('/new');
    expect(linkHref({ kind: StorefrontLinkKind.BestSellers }, reach)).toBe('/best');
    expect(linkHref({ kind: StorefrontLinkKind.Category, categoryId: CATEGORY.id }, reach)).toBe(
      '/c/winter',
    );
    expect(linkHref({ kind: StorefrontLinkKind.Product, productId: 'gone' }, reach)).toBe('/');
  });
});

const BRAND: PublicBrand = {
  version: 'v1',
  colors: {
    main: '#7a1f2b',
    accent: '#f2a516',
    background: '#fbf7f0',
    onMain: '#ffffff',
    onAccent: '#1b1300',
    text: '#1f2933',
    mainText: '#7a1f2b',
  },
  fonts: {
    heading: { id: BrandFont.NotoSerifBengaliFraunces },
    body: { id: BrandFont.HindSiliguriPlusJakartaSans },
  },
  corners: BrandCorners.Square,
  spacing: BrandSpacing.Airy,
  darkLogo: null,
  icon: null,
};

describe('how the theme dresses the page (SB-7, SB-17, SB-18)', () => {
  const soft = design([]);
  it("sets the theme's colour set as the sketch's variables, with its heading and body faces", () => {
    const look = designLook({ ...soft, palette: 1 }, null);
    const tokens = storefrontTokens(StorefrontThemeKey.Soft, 1);
    expect(look.variables['--main']).toBe(tokens['main']);
    expect(look.variables['--card-bg']).toBe(tokens['card-bg']);
    expect(look.variables['--fh']).toBe(
      fontStack(STOREFRONT_THEMES[StorefrontThemeKey.Soft].headingFont),
    );
  });

  it("puts the shop's own identity over the theme's colours, fonts and corners, keeping the layout", () => {
    const look = designLook(soft, BRAND);
    expect(look.variables).toMatchObject({
      '--main': '#7a1f2b',
      '--bg': '#fbf7f0',
      '--btn-bg': '#7a1f2b',
      '--r-btn': '0px',
    });
    expect(look.variables['--fb']).toContain('Plus Jakarta Sans');
    expect(look.theme.hero).toBe(STOREFRONT_THEMES[StorefrontThemeKey.Soft].hero);
  });

  it("dresses every page's frame in the theme when no identity shows; an older server's answer stays as it was", () => {
    const framed = frameBrand({ brand: null, design: soft });
    expect(framed?.colors.main).toBe(storefrontTokens(StorefrontThemeKey.Soft, 0)['main']);
    expect(frameBrand({ brand: BRAND, design: soft })).toBe(BRAND);
    expect(frameBrand({ brand: null })).toBeNull();
  });
});

describe('the edge and the preview (SB-12, SB-16)', () => {
  it('keeps the offers and best-sellers lists as New arrivals is, and never the preview', () => {
    const page = EdgeCachePolicy.lifetimeOfPath('/new');
    expect(EdgeCachePolicy.lifetimeOfPath('/offers')).toEqual(page);
    expect(EdgeCachePolicy.lifetimeOfPath('/best')).toEqual(page);
    expect(EdgeCachePolicy.lifetimeOfPath('/preview')).toBeNull();
  });

  it('reads the draft afresh each time, and never as the shop every shopper is shown', async () => {
    const env = new StorefrontEnvironment({
      SERVER_URL: 'http://server:3000/',
      PLATFORM_DOMAIN: 'lytro.app',
    });
    const paths: string[] = [];
    const answers: ServerAnswer<unknown>[] = [
      { status: 200, data: { name: 'Live' }, code: null, details: {} },
      { status: 200, data: { name: 'Draft' }, code: null, details: {} },
      { status: 200, data: { name: 'Draft again' }, code: null, details: {} },
      { status: 404, data: null, code: 'not_found', details: {} },
    ];
    const api = new StorefrontApi(
      {
        send: (call) => {
          paths.push(call.path);
          return Promise.resolve(answers.shift() as never);
        },
      },
      env,
    );
    const shop = {
      slug: 'megh',
      storefrontEnabled: true,
      key: 'k',
      origin: 'https://megh.lytro.app',
      mainHost: null,
      publicOrigin: 'https://megh.lytro.app',
    };
    const shopper = { host: 'megh.lytro.app', clientAddress: null, language: 'bn' as const };
    expect((await api.shop(shop, shopper)).name).toBe('Live');
    expect((await api.shopPreview(shop, shopper, 'a b'))?.name).toBe('Draft');
    expect((await api.shopPreview(shop, shopper, 'a b'))?.name).toBe('Draft again');
    expect(await api.shopPreview(shop, shopper, 'ended')).toBeNull();
    // The shop every shopper is shown is still the live one, read once, and the last one kept is too.
    expect((await api.shop(shop, shopper)).name).toBe('Live');
    expect(api.lastShop('megh')?.name).toBe('Live');
    expect(paths).toEqual([
      '/v1/shop',
      '/v1/shop?preview=a%20b',
      '/v1/shop?preview=a%20b',
      '/v1/shop?preview=ended',
    ]);
  });
});

describe('the rest of the shop in its theme (SB-5, SB-17)', () => {
  const shop = {
    name: 'মেঘ ফ্যাশন',
    slug: 'megh',
    metaPixelId: null,
    logo: null,
    contact: { phone: null, email: null, address: null },
    deliveryZones: [],
    brand: null,
  };

  it("marks a shop and a quote with their first whole letter, a Bangla letter's vowel sign kept", () => {
    expect(firstLetter('মেঘ ফ্যাশন')).toBe('মে');
    expect(firstLetter('  rupkotha')).toBe('R');
    expect(firstLetter('')).toBe('');
  });

  it("gives the app's icons new links when the shop sets its own icon, and the same ones without", () => {
    const before = iconVersion(shop);
    expect(iconVersion({ ...shop, icon: null })).toBe(before);
    const withIcon = iconVersion({
      ...shop,
      icon: { id: 'i1', urls: { main: 'm', thumbnail: 't' } },
    });
    expect(withIcon).not.toBe(before);
  });

  it("colours the phone's bar with the theme where no identity shows, and draws pages as before without a design", () => {
    const soft = design([]);
    expect(themeColor({ ...shop, design: soft })).toBe(
      storefrontTokens(StorefrontThemeKey.Soft, 0)['main'],
    );
    expect(pageTheme({ brand: null })).toBeNull();
    expect(pageTheme({ brand: null, design: soft })).toMatchObject({
      header: STOREFRONT_THEMES[StorefrontThemeKey.Soft].header,
      card: STOREFRONT_THEMES[StorefrontThemeKey.Soft].card,
    });
  });
});
