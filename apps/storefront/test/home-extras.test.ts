import {
  HeroDesign,
  ProductRowLayout,
  ProductRowSource,
  ProductRowSource as Source,
  StorefrontFill,
  StorefrontLinkKind,
  StorefrontSectionKind,
  StorefrontThemeKey,
  type StorefrontLink,
  type StorefrontSection,
} from '@lytronix/validators';
import { describe, expect, it } from 'vitest';

import type {
  ImageView,
  ProductCard,
  PublicCategory,
  PublicStorefrontDesign,
} from '../src/lib/api/storefront-api';
import { DashboardOrigin } from '../src/lib/design/dashboard-origin';
import { homeLayout, homeReadPlan, mayAllHide, rowShows } from '../src/lib/design/home-reads';
import { leftOut } from '../src/lib/design/left-out';
import { type LinkFacts, linkShows } from '../src/lib/design/links';

// STOREFRONT-BUILDER-PLAN SB-32 as amended (the owner, 2026-11-26, "yes to all"): a seller's own slide or banner hides
// while its link leads where nothing is now (SB-16 as amended), and an automatic grid ends on a full line of four.

type ProductsSection = Extract<StorefrontSection, { kind: StorefrontSectionKind.Products }>;
type HeroSection = Extract<StorefrontSection, { kind: StorefrontSectionKind.Hero }>;
type BannersSection = Extract<StorefrontSection, { kind: StorefrontSectionKind.OfferBanners }>;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PHOTO = id(500);
const GONE = id(501);
const IMAGE: ImageView = { id: PHOTO, urls: { main: '/m.jpg', thumbnail: '/t.jpg' } };

function design(
  sections: StorefrontSection[],
  extra: Partial<PublicStorefrontDesign> = {},
): PublicStorefrontDesign {
  return {
    theme: StorefrontThemeKey.Studio,
    palette: 0,
    sections,
    images: { [PHOTO]: IMAGE },
    categories: [{ id: 'lip', slug: 'lipstick', name: 'Lipstick' }],
    products: [],
    preview: false,
    offers: [{ id: 'eid', slug: 'eid', name: 'Eid' }],
    ...extra,
  };
}

function category(
  key: string,
  productCount: number,
  children: PublicCategory[] = [],
): PublicCategory {
  return { id: key, slug: key, name: key, image: null, productCount, children };
}

const facts = (extra: Partial<LinkFacts> = {}): LinkFacts => ({
  categories: [category('lip', 2, [category('matte', 0)]), category('perfume', 0)],
  sale: { products: 3 },
  productCount: 12,
  ...extra,
});

const ON_SALE: StorefrontLink = { kind: StorefrontLinkKind.OnSale };
const JUST_IN: StorefrontLink = { kind: StorefrontLinkKind.JustIn };
const BEST: StorefrontLink = { kind: StorefrontLinkKind.BestSellers };
const PRODUCT: StorefrontLink = { kind: StorefrontLinkKind.Product, productId: id(7) };
const offer = (offerId: string): StorefrontLink => ({ kind: StorefrontLinkKind.Offer, offerId });
const toCategory = (categoryId: string): StorefrontLink => ({
  kind: StorefrontLinkKind.Category,
  categoryId,
});

describe("a seller's own slide or banner and where it leads (SB-16 as amended)", () => {
  const d = design([]);

  it('On sale shows only while something is on sale', () => {
    expect(linkShows(ON_SALE, d, facts())).toBe(true);
    expect(linkShows(ON_SALE, d, facts({ sale: { products: 0 } }))).toBe(false);
  });

  it('an offer shows only while it runs', () => {
    expect(linkShows(offer('eid'), d, facts())).toBe(true);
    expect(linkShows(offer('ended'), d, facts())).toBe(false);
    // An older server's answer names no offers: none runs.
    expect(linkShows(offer('eid'), design([], { offers: undefined }), facts())).toBe(false);
  });

  it('a category shows only while it holds a product, its subcategories found too', () => {
    expect(linkShows(toCategory('lip'), d, facts())).toBe(true);
    expect(linkShows(toCategory('perfume'), d, facts())).toBe(false);
    expect(linkShows(toCategory('matte'), d, facts())).toBe(false);
    // One shoppers can no longer reach.
    expect(linkShows(toCategory('gone'), d, facts())).toBe(false);
  });

  it('Just in and Best sellers hide only when the shop shows no product', () => {
    for (const link of [JUST_IN, BEST]) {
      expect(linkShows(link, d, facts())).toBe(true);
      expect(linkShows(link, d, facts({ productCount: 0 }))).toBe(false);
      // An older server sends no count: shown, as before.
      expect(linkShows(link, d, facts({ productCount: undefined }))).toBe(true);
    }
  });

  it("a product's link always shows (one gone leads home)", () => {
    expect(linkShows(PRODUCT, d, facts({ productCount: 0, sale: { products: 0 } }))).toBe(true);
  });
});

function slide(link: StorefrontLink, mediaId = PHOTO) {
  return {
    photo: { mediaId, focusX: 50, focusY: 50 },
    kicker: null,
    headline: 'Eid',
    description: null,
    button: 'Shop',
    link,
  };
}

function hero(slides: ReturnType<typeof slide>[]): HeroSection {
  return {
    id: id(1),
    visible: true,
    kind: StorefrontSectionKind.Hero,
    fill: StorefrontFill.Own,
    source: ProductRowSource.OnSale,
    design: HeroDesign.Overlay,
    slides,
    tiles: [{ kind: StorefrontLinkKind.OnSale }, { kind: StorefrontLinkKind.JustIn }],
  };
}

function banners(items: ReturnType<typeof slide>[]): BannersSection {
  return {
    id: id(2),
    visible: true,
    kind: StorefrontSectionKind.OfferBanners,
    fill: StorefrontFill.Own,
    layout: null,
    collections: [{ kind: StorefrontLinkKind.OnSale }, { kind: StorefrontLinkKind.JustIn }],
    banners: items,
  };
}

describe('the reads an own hero or banners section needs when all of it may hide (SB-16 as amended)', () => {
  const selling = { sale: { products: 3, bestDiscount: 20 }, productCount: 12 };
  const idle = { sale: { products: 0, bestDiscount: 0 }, productCount: 12 };

  it("reads an own hero's source only when every slide may hide", () => {
    const sale = hero([slide(ON_SALE)]);
    expect(homeReadPlan(design([sale]), selling).heroes).toEqual([]);
    expect(homeReadPlan(design([sale]), idle).heroes.map((each) => each.sectionId)).toEqual([
      sale.id,
    ]);
    // One slide sure to show is enough.
    expect(homeReadPlan(design([hero([slide(ON_SALE), slide(PRODUCT)])]), idle).heroes).toEqual([]);
  });

  it("reads it for a category's slide, whose count is known only when the page is drawn", () => {
    expect(homeReadPlan(design([hero([slide(toCategory('lip'))])]), selling).heroes).toHaveLength(
      1,
    );
  });

  it('reads it for slides whose photos are gone, so the hero fills itself (SB-16)', () => {
    expect(mayAllHide([slide(PRODUCT, GONE)], design([]), selling)).toBe(true);
    expect(mayAllHide([slide(PRODUCT)], design([]), selling)).toBe(false);
  });

  it("reads the banners' collections only when every own banner may hide", () => {
    const own = banners([slide(ON_SALE), slide(offer('ended'))]);
    expect(homeReadPlan(design([own]), selling).collections).toEqual([]);
    expect(homeReadPlan(design([own]), idle).collections).toEqual(own.collections);
  });
});

const row = (
  at: number,
  source: Source,
  extra: Partial<ProductsSection> = {},
): ProductsSection => ({
  id: id(at),
  visible: true,
  kind: StorefrontSectionKind.Products,
  source,
  categoryId: source === Source.Category ? 'lip' : null,
  productIds: [],
  title: null,
  layout: ProductRowLayout.Grid,
  count: 8,
  ...extra,
});
const cards = (...names: string[]): ProductCard[] =>
  names.map(
    (name) => ({ id: `id-${name}`, slug: name, name, designId: null }) as unknown as ProductCard,
  );
const names = (list: readonly ProductCard[] | undefined) => (list ?? []).map((each) => each.name);
const SIX = cards('a', 'b', 'c', 'd', 'e', 'f');

describe('an automatic grid ends on a full line (SB-32 as amended)', () => {
  it('shows whole lines of four, the rest coming in "সব প্রোডাক্ট"', () => {
    const newest = row(10, Source.Newest);
    const laid = homeLayout(design([newest]), new Map([[newest.id, SIX]]), {
      products: SIX,
      nextCursor: null,
    });
    expect(names(laid.rows.get(newest.id))).toEqual(['a', 'b', 'c', 'd']);
    expect(names(laid.all.shown)).toEqual(['e', 'f']);
  });

  it('cuts newest, on sale, best sellers and a category to 4, 8 or 12', () => {
    for (const source of [Source.Newest, Source.OnSale, Source.BestSellers, Source.Category]) {
      expect(rowShows(row(11, source), 6)).toBe(4);
      expect(rowShows(row(11, source, { count: 12 }), 9)).toBe(8);
      expect(rowShows(row(11, source, { count: 12 }), 12)).toBe(12);
    }
  });

  it('shows a grid saved at 6 as 4', () => {
    const saved = row(12, Source.BestSellers, { count: 6 });
    const laid = homeLayout(design([saved]), new Map([[saved.id, SIX]]), {
      products: [],
      nextCursor: null,
    });
    expect(names(laid.rows.get(saved.id))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('never cuts a picked row, an offer row or a carousel', () => {
    expect(rowShows(row(13, Source.Picked), 6)).toBe(6);
    expect(rowShows(row(13, Source.Offer), 6)).toBe(6);
    expect(rowShows(row(13, Source.Newest, { layout: ProductRowLayout.Carousel }), 6)).toBe(6);
    const picked = row(14, Source.Picked, { productIds: ['x'] });
    const laid = homeLayout(design([picked]), new Map([[picked.id, SIX]]), {
      products: [],
      nextCursor: null,
    });
    expect(names(laid.rows.get(picked.id))).toHaveLength(6);
  });
});

describe('what the home leaves out, for the design editor (SB-32 as amended, de-*)', () => {
  const newest = row(20, Source.Newest, { count: 4 });
  const lipstick = row(21, Source.Category, { count: 4 });
  const best = row(22, Source.BestSellers, { count: 4 });
  const picked = row(23, Source.Picked, { productIds: ['x'] });
  const offerRow = row(24, Source.Offer, { offerId: 'ended' });
  const wide: StorefrontSection = {
    id: id(25),
    visible: true,
    kind: StorefrontSectionKind.WideBanner,
    banner: slide(toCategory('perfume')),
  };
  const own = banners([slide(ON_SALE), slide(JUST_IN), slide(offer('ended'))]);
  const slides = hero([slide(PRODUCT), slide(toCategory('perfume'))]);

  it('reports exactly what the render drops: a short row, a row its repeats left short, own items leading nowhere', () => {
    const d = design([slides, newest, lipstick, best, picked, offerRow, own, wide]);
    const rows = new Map<string, ProductCard[]>([
      [newest.id, cards('a', 'b', 'c', 'd', 'e')],
      // Two lipsticks: short of a grid.
      [lipstick.id, cards('l1', 'l2')],
      // Five best sellers, but three already among the newest: two left, short.
      [best.id, cards('a', 'b', 'c', 'x1', 'x2')],
      [picked.id, cards('p1')],
    ]);
    const laid = homeLayout(d, rows, { products: [], nextCursor: null });
    expect([...laid.rows.keys()]).toEqual([newest.id, picked.id]);
    expect(leftOut(d, laid.rows, facts({ sale: { products: 0 } }))).toEqual({
      rows: [
        { sectionId: lipstick.id, fill: 4 },
        { sectionId: best.id, fill: 4 },
      ],
      items: [
        { sectionId: slides.id, index: 1, link: StorefrontLinkKind.Category },
        { sectionId: own.id, index: 0, link: StorefrontLinkKind.OnSale },
        { sectionId: own.id, index: 2, link: StorefrontLinkKind.Offer },
        { sectionId: wide.id, index: 0, link: StorefrontLinkKind.Category },
      ],
    });
  });

  it('never names a picked or an offer row, or an automatic section', () => {
    const d = design([picked, offerRow, { ...own, fill: StorefrontFill.Auto }]);
    expect(leftOut(d, new Map(), facts({ sale: { products: 0 } }))).toEqual({
      rows: [],
      items: [],
    });
  });

  it('says a carousel needs 5', () => {
    const carousel = row(26, Source.Newest, { layout: ProductRowLayout.Carousel, count: 6 });
    expect(leftOut(design([carousel]), new Map(), facts()).rows).toEqual([
      { sectionId: carousel.id, fill: 5 },
    ]);
  });
});

describe('who may read /preview/layout from a browser (SB-32 as amended)', () => {
  it('lets only the dashboard read it', () => {
    const origins = new DashboardOrigin('lytro.app');
    expect(origins.headersFor('https://app.lytro.app')).toEqual({
      'access-control-allow-origin': 'https://app.lytro.app',
      vary: 'Origin',
    });
    for (const other of [
      'https://evil.example',
      'https://rodh.lytro.app',
      'http://app.lytro.app',
      null,
    ]) {
      expect(origins.headersFor(other)).toEqual({ vary: 'Origin' });
    }
    // Staging's dashboard names its own domain.
    expect(new DashboardOrigin('staging.lytro.app').allows('https://app.staging.lytro.app')).toBe(
      true,
    );
  });

  it('lets a local dashboard read it only where the domain is localhost', () => {
    expect(new DashboardOrigin('localhost').allows('http://localhost:5173')).toBe(true);
    expect(new DashboardOrigin('lytro.app').allows('http://localhost:5173')).toBe(false);
  });
});
