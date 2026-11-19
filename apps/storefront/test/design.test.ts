import {
  AnnouncementItemKind,
  announcementPairs,
  BrandCorners,
  BrandFont,
  BrandSpacing,
  fontStack,
  HeroDesign,
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
import type {
  DeliveryZoneView,
  ProductCard,
  PublicBrand,
  PublicStorefrontDesign,
} from '../src/lib/api/storefront-api';
import { productQueryString, StorefrontApi } from '../src/lib/api/storefront-api';
import { iconVersion, themeColor } from '../src/lib/app/app-manifest';
import { designLook, frameBrand, pageTheme, triedTheme } from '../src/lib/design/design-look';
import { barItems, deliveryParts } from '../src/lib/design/announcement';
import {
  collectionKey,
  collectionQuery,
  collectionViews,
  type CollectionFacts,
} from '../src/lib/design/collections';
import {
  fallbackReads,
  hasTiles,
  heroQuery,
  homeReadPlan,
  queryKey,
  rowQuery,
} from '../src/lib/design/home-reads';
import { Words } from '../src/lib/i18n/words';
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

  it("plans a starting design's reads once each: its rows, the auto hero, the banners' collections and the trust strip's wallets", () => {
    const start = startingDesign(StorefrontThemeKey.Royal);
    const plan = homeReadPlan({ ...design([]), sections: start.sections });
    expect(plan.methods).toBe(true);
    expect(plan.heroes).toHaveLength(1);
    expect(plan.heroes[0]?.query).toMatchObject({ sort: 'discount', onSale: true, limit: 3 });
    // Royal's hero is an overlay, with no tiles to read for; its banners fill themselves from three collections.
    expect(plan.collections.map(collectionKey)).toEqual(['on_sale', 'just_in', 'best_sellers']);
    expect(plan.rows.map((each) => each.query.sort)).toEqual(['best_selling', 'discount']);
    expect(queryKey({ sort: 'newest', limit: 4 })).toBe(queryKey({ limit: 4, sort: 'newest' }));
  });

  // OFFERS-PLAN OF-8, OF-22: a running offer's cards in the shop's order; one no longer running has no row, and a
  // button to it leads to On sale.
  it("asks a running offer's cards by its link name, and none for an offer no longer running", () => {
    const offer = { id: id(9), slug: 'eid-offer', name: 'Eid offer' };
    const withOffer = { ...reach, offers: [offer] };
    expect(rowQuery(row(ProductRowSource.Offer, { offerId: offer.id }), withOffer)).toEqual({
      inStock: true,
      limit: 4,
      sort: 'featured',
      offer: 'eid-offer',
    });
    expect(rowQuery(row(ProductRowSource.Offer, { offerId: id(8) }), withOffer)).toBeNull();
    expect(linkHref({ kind: StorefrontLinkKind.Offer, offerId: offer.id }, withOffer)).toBe(
      '/offers/eid-offer',
    );
    expect(linkHref({ kind: StorefrontLinkKind.Offer, offerId: id(8) }, withOffer)).toBe('/offers');
    expect(productQueryString({ offer: 'eid-offer', designs: true })).toBe(
      'designs=true&offer=eid-offer',
    );
  });

  it('writes the new filters into the list request', () => {
    expect(productQueryString({ sort: 'discount', onSale: true, productIds: ['a', 'b'] })).toBe(
      'sort=discount&onSale=true&productIds=a%2Cb',
    );
  });
});

describe("the hero's tiles and the banners' collections (BL-2 to BL-13)", () => {
  const card = (n: number, extra: Partial<ProductCard> = {}): ProductCard =>
    ({
      id: `p${String(n)}`,
      slug: `p${String(n)}`,
      name: `Product ${String(n)}`,
      image: { id: `i${String(n)}`, urls: { main: `/p${String(n)}.jpg` } },
      minPrice: '500',
      ...extra,
    }) as unknown as ProductCard;
  const facts = (
    lists: Record<string, ProductCard[]>,
    sale = { products: 2, bestDiscount: 25 },
  ): CollectionFacts => ({
    lists: new Map(Object.entries(lists)),
    categories: [
      {
        id: CATEGORY.id,
        slug: CATEGORY.slug,
        name: 'Winter',
        image: null,
        productCount: 7,
        children: [],
      },
    ],
    sale,
    words: new Words('en'),
  });
  const hero = (extra: Record<string, unknown>) =>
    ({
      ...startingDesign(StorefrontThemeKey.Royal).sections.find(
        (section) => section.kind === StorefrontSectionKind.Hero,
      ),
      ...extra,
    }) as Extract<StorefrontSection, { kind: StorefrontSectionKind.Hero }>;

  it('reads three of the source the seller chose, the offers and best sellers falling back to the newest (BL-3, BL-5)', () => {
    expect(heroQuery(ProductRowSource.OnSale)).toMatchObject({
      query: { sort: 'discount', onSale: true },
      fallback: { sort: 'newest' },
    });
    expect(heroQuery(ProductRowSource.BestSellers)).toMatchObject({
      query: { sort: 'best_selling' },
      fallback: { sort: 'newest' },
    });
    expect(heroQuery(ProductRowSource.Newest)).toMatchObject({
      query: { sort: 'newest' },
      fallback: null,
    });
  });

  it("draws tiles only for the slide-and-tiles design, its own or its theme's (BL-2)", () => {
    expect(hasTiles(hero({ design: null }), design([]))).toBe(false);
    expect(hasTiles(hero({ design: HeroDesign.SlideTiles }), design([]))).toBe(true);
    const tiles = hero({
      design: HeroDesign.SlideTiles,
      tiles: [
        { kind: StorefrontLinkKind.JustIn },
        { kind: StorefrontLinkKind.Category, categoryId: CATEGORY.id },
      ],
    });
    expect(homeReadPlan(design([tiles])).collections.map(collectionKey)).toEqual([
      'just_in',
      'category:c1',
    ]);
    expect(
      collectionQuery({ kind: StorefrontLinkKind.Category, categoryId: 'gone' }, [CATEGORY]),
    ).toBeNull();
  });

  it("shows each collection's words, a photo the slide or an earlier place doesn't, and its page behind a tap (BL-12)", () => {
    const views = collectionViews(
      [{ kind: StorefrontLinkKind.OnSale }, { kind: StorefrontLinkKind.BestSellers }],
      facts({
        on_sale: [card(1), card(2)],
        best_sellers: [card(2, { ordered: 12 }), card(3, { ordered: 4 })],
      }),
      ['p1'],
    );
    expect(views).toMatchObject([
      {
        productId: 'p2',
        kicker: 'Offers on',
        headline: 'Up to 25% off',
        description: 'On 2 products',
        href: '/offers',
      },
      {
        productId: 'p3',
        kicker: 'Best sellers',
        headline: 'Product 3',
        description: 'Ordered 4 times',
        href: '/best',
      },
    ]);
    const category = collectionViews(
      [{ kind: StorefrontLinkKind.Category, categoryId: CATEGORY.id }],
      facts({ 'category:c1': [card(5)] }),
    );
    expect(category).toMatchObject([
      { productId: 'p5', kicker: '7 products', headline: 'Winter', href: '/c/winter' },
    ]);
  });

  it('gives an empty collection the next one no other place shows, else leaves it, reading those only then (BL-13)', () => {
    const nothingOnSale = { products: 0, bestDiscount: 0 };
    const views = collectionViews(
      [{ kind: StorefrontLinkKind.OnSale }, { kind: StorefrontLinkKind.JustIn }],
      facts({ on_sale: [], just_in: [card(1)], best_sellers: [card(2)] }, nothingOnSale),
    );
    expect(views.map((view) => view.href)).toEqual(['/best', '/new']);
    expect(
      collectionViews([{ kind: StorefrontLinkKind.OnSale }], facts({ on_sale: [] }, nothingOnSale)),
    ).toEqual([]);
    const plan = {
      collections: [{ kind: StorefrontLinkKind.OnSale }, { kind: StorefrontLinkKind.JustIn }],
    } as const;
    const full = new Map([
      ['on_sale', [card(1)]],
      ['just_in', [card(2)]],
    ]);
    expect(fallbackReads(plan, full)).toEqual([]);
    const empty = new Map([
      ['on_sale', []],
      ['just_in', [card(2)]],
    ]);
    expect(fallbackReads(plan, empty)).toEqual([{ kind: StorefrontLinkKind.BestSellers }]);
  });
});

describe('the announcement bar (BL-10, BL-17)', () => {
  const zones: DeliveryZoneView[] = [
    {
      id: 'h',
      name: { bn: 'ঢাকা সিটির ভেতরে', en: 'Inside Dhaka city' },
      charge: '70.00',
      noDelivery: false,
      kind: 'home',
    },
    {
      id: 'f',
      name: { bn: 'ঢাকা সিটির বাইরে', en: 'Outside Dhaka city' },
      charge: '130.00',
      noDelivery: false,
      kind: 'fallback',
    },
    {
      id: 's',
      name: { bn: 'সাভার', en: 'Savar' },
      charge: '100.00',
      noDelivery: false,
      kind: 'other',
    },
    {
      id: 'n',
      name: { bn: 'বান্দরবান', en: 'Bandarban' },
      charge: '300.00',
      noDelivery: true,
      kind: 'other',
    },
  ];
  const bn = new Words('bn');

  it("says the home zone's charge and the highest elsewhere, or where each starts with a charge per kilo (RAT-14)", () => {
    expect(deliveryParts({ deliveryZones: zones, extraDeliveryChargePerKg: '0.00' }, bn)).toEqual([
      'ঢাকা সিটির ভেতরে ডেলিভারি সর্বোচ্চ ৳70',
      'ঢাকা সিটির বাইরে সর্বোচ্চ ৳130',
    ]);
    expect(deliveryParts({ deliveryZones: zones, extraDeliveryChargePerKg: '20.00' }, bn)).toEqual([
      'ঢাকা সিটির ভেতরে ডেলিভারি ৳70 থেকে',
      'ঢাকা সিটির বাইরে ৳100 থেকে',
    ]);
    // An older server names no zone's kind: the range, as before.
    const older = zones.map((zone) => ({ ...zone, kind: undefined }));
    expect(deliveryParts({ deliveryZones: older }, bn)).toEqual(['ডেলিভারি ৳70–৳130']);
  });

  it("lists the items in the seller's order, those off or with nothing to say left out, two at a time", () => {
    const items = barItems(
      [
        { kind: AnnouncementItemKind.CashOnDelivery, visible: true },
        { kind: AnnouncementItemKind.Delivery, visible: false },
        { kind: AnnouncementItemKind.Offers, visible: true },
        { kind: AnnouncementItemKind.Own, text: 'Eid gifts' },
        { kind: AnnouncementItemKind.Own, text: 'Free wrapping' },
      ],
      { deliveryZones: zones, sale: { products: 3, bestDiscount: 25 } },
      new Words('en'),
    );
    expect(items).toEqual([
      { parts: ['Cash on delivery'], pill: null },
      { parts: ['Up to 25% off on 3 products'], pill: 'Offer' },
      { parts: ['Eid gifts'], pill: null },
      { parts: ['Free wrapping'], pill: null },
    ]);
    expect(announcementPairs(items).map((pair) => pair.length)).toEqual([2, 2]);
    expect(announcementPairs([1, 2, 3, 4, 5])).toEqual([[1, 2], [3, 4], [5]]);
    const nothingOnSale = barItems(
      [{ kind: AnnouncementItemKind.Offers, visible: true }],
      { deliveryZones: [], sale: { products: 0, bestDiscount: 0 } },
      bn,
    );
    expect(nothingOnSale).toEqual([]);
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

  it('shows a theme being tried over the draft, on its first colours, and nothing else the address names', () => {
    const draft = { ...design([]), palette: 2 };
    expect(triedTheme({ design: draft }, 'studio').design).toEqual({
      ...draft,
      theme: StorefrontThemeKey.Studio,
      palette: 0,
    });
    for (const other of [undefined, '', 'toString', 'STUDIO', ['studio']]) {
      expect(triedTheme({ design: draft }, other).design).toBe(draft);
    }
    expect(triedTheme({}, 'studio')).toEqual({});
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
