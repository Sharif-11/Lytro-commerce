import {
  HeroDesign,
  ProductRowSource,
  PUBLIC_PAGE_SIZE_MAX,
  STOREFRONT_ALL_PRODUCTS_PAGE,
  STOREFRONT_THEMES,
  StorefrontFill,
  StorefrontSectionKind,
  storefrontRowFill,
  type HeroSource,
  type StorefrontCollection,
  type StorefrontSection,
} from '@lytronix/validators';
import type {
  ProductCard,
  ProductPage,
  ProductQuery,
  PublicStorefrontDesign,
  ShopperPaymentMethod,
} from '../api/storefront-api';
import { cardKey } from './card-links';
import { collectionKey, FALLBACK_COLLECTIONS } from './collections';

// STOREFRONT-BUILDER-PLAN SB-9: what the designed home reads besides the shop -- each product row's products, and what
// the sections that fill themselves draw from. Plain functions of the design; the page makes the reads.

/** SB-9: the auto hero's slides: three of its source's products. */
export const HERO_AUTO_SLIDES = 3;

type ProductsSection = Extract<StorefrontSection, { kind: StorefrontSectionKind.Products }>;
type HeroSection = Extract<StorefrontSection, { kind: StorefrontSectionKind.Hero }>;

/** SB-9, SB-16: what a product row lists; null when it names a category or products shoppers can no longer reach. */
export function rowQuery(
  section: ProductsSection,
  design: Pick<PublicStorefrontDesign, 'categories' | 'products' | 'offers'>,
): ProductQuery | null {
  // SB-9 as amended 2026-11-25 (the owner: "the storefront must be populated even if there is no stock. And just re
  // order the stock out products at last"): a row lists sold-out products too, and the server puts them last.
  const base = { limit: section.count };
  switch (section.source) {
    case ProductRowSource.Newest:
      return { ...base, sort: 'newest' };
    case ProductRowSource.OnSale:
      return { ...base, sort: 'discount', onSale: true };
    case ProductRowSource.BestSellers:
      return { ...base, sort: 'best_selling' };
    case ProductRowSource.Category: {
      const category = design.categories.find((row) => row.id === section.categoryId);
      return category ? { ...base, sort: 'newest', category: category.slug } : null;
    }
    case ProductRowSource.Picked: {
      const reachable = new Set(design.products.map((row) => row.id));
      const picked = section.productIds.filter((id) => reachable.has(id)).slice(0, section.count);
      return picked.length > 0 ? { productIds: picked } : null;
    }
    // OF-8, OF-22: a running offer's cards in the shop's order; one no longer running, no row.
    case ProductRowSource.Offer: {
      const offer = (design.offers ?? []).find((row) => row.id === section.offerId);
      return offer ? { ...base, sort: 'featured', offer: offer.slug } : null;
    }
  }
}

// The hero's slides too: in stock first, sold out only when the shop has nothing else (SB-9 as amended 2026-11-25).
const NEWEST_SLIDES: ProductQuery = { sort: 'newest', limit: HERO_AUTO_SLIDES };

/** BL-3, BL-5: what an auto hero's slides read, and what they read instead when that comes back empty. */
export function heroQuery(source: HeroSource): {
  query: ProductQuery;
  fallback: ProductQuery | null;
} {
  switch (source) {
    case ProductRowSource.OnSale:
      return {
        query: { sort: 'discount', onSale: true, limit: HERO_AUTO_SLIDES },
        fallback: NEWEST_SLIDES,
      };
    case ProductRowSource.BestSellers:
      return {
        query: { sort: 'best_selling', limit: HERO_AUTO_SLIDES },
        fallback: NEWEST_SLIDES,
      };
    case ProductRowSource.Newest:
      return { query: NEWEST_SLIDES, fallback: null };
  }
}

/** BL-2: whether a hero is drawn as a slide with its two tiles beside it (the section's design, else its theme's). */
export function hasTiles(
  section: HeroSection,
  design: Pick<PublicStorefrontDesign, 'theme'>,
): boolean {
  return (section.design ?? STOREFRONT_THEMES[design.theme].hero) === HeroDesign.SlideTiles;
}

/**
 * SB-32 (the owner, 2026-11-26): a row the seller picked by hand shows as chosen; every other row fills itself and skips
 * what a row above it showed.
 */
export function fillsItself(section: ProductsSection): boolean {
  return section.source !== ProductRowSource.Picked;
}

/**
 * SB-32: whether a row shows only when it can still fill (`storefrontRowFill`) -- not a hand-picked row, nor a running
 * offer's (the owner, 2026-11-26: an offer's row always shows, however few of its cards are left).
 */
export function mustFill(section: ProductsSection): boolean {
  return fillsItself(section) && section.source !== ProductRowSource.Offer;
}

/** SB-32: "সব প্রোডাক্ট" -- the cards the rows above did not show. */
export interface AllProducts {
  /** The first page. */
  shown: ProductCard[];
  /** What the read held past the first page, shown before the list is read further. */
  queued: ProductCard[];
  /** Where the list goes on; null at its end. */
  cursor: string | null;
  /** Every card on the page or queued, by `cardKey`, so a later page skips them. */
  seen: string[];
  /** The products the rows above show, by ID, for the button's "আরও Nটি". */
  above: string[];
}

/** What the home's reads came back with, by section where a section has its own. */
export interface DesignedHomeReads {
  /** Each product row's products as it shows them, by section ID; a row with nothing to show is left out. */
  rows: ReadonlyMap<string, ProductCard[]>;
  /** SB-32: "সব প্রোডাক্ট". */
  all: AllProducts;
  /** SB-9, BL-3: each auto hero's products, by section ID. */
  heroes: ReadonlyMap<string, ProductCard[]>;
  /** BL-12, BL-13: each collection's products, by `collectionKey`, the ones read in an empty one's place included. */
  collections: ReadonlyMap<string, ProductCard[]>;
  /** SB-9: the trust strip's ways to pay. */
  methods: ShopperPaymentMethod[];
}

/** Every read the design's visible sections need, once each. */
export interface HomeReadPlan {
  rows: { sectionId: string; query: ProductQuery }[];
  heroes: { sectionId: string; query: ProductQuery; fallback: ProductQuery | null }[];
  /** BL-3, BL-9: the collections the heroes' tiles and the auto banners show, once each. */
  collections: StorefrontCollection[];
  methods: boolean;
  /** SB-32: "সব প্রোডাক্ট", in the shop's own order: its first page and as many again as the rows above may show. */
  all: ProductQuery;
}

/** SB-32: a list asked for its own count and as many again as the rows above may show, so it fills after skipping them. */
function withRoom(count: number, above: number): number {
  return Math.min(PUBLIC_PAGE_SIZE_MAX, count + above);
}

export function homeReadPlan(design: PublicStorefrontDesign): HomeReadPlan {
  const plan: HomeReadPlan = {
    rows: [],
    heroes: [],
    collections: [],
    methods: false,
    all: { sort: 'featured', limit: STOREFRONT_ALL_PRODUCTS_PAGE },
  };
  // SB-32: how many cards the product rows read so far may show.
  let above = 0;
  const want = (collections: readonly StorefrontCollection[]): void => {
    for (const collection of collections) {
      const key = collectionKey(collection);
      if (!plan.collections.some((each) => collectionKey(each) === key)) {
        plan.collections.push(collection);
      }
    }
  };
  for (const section of design.sections) {
    switch (section.kind) {
      case StorefrontSectionKind.Products: {
        const query = rowQuery(section, design);
        if (query) {
          plan.rows.push({
            sectionId: section.id,
            query: fillsItself(section)
              ? { ...query, limit: withRoom(section.count, above) }
              : query,
          });
          above += section.count;
        }
        break;
      }
      case StorefrontSectionKind.Hero:
        if (section.fill === StorefrontFill.Auto) {
          plan.heroes.push({ sectionId: section.id, ...heroQuery(section.source) });
        }
        if (hasTiles(section, design)) want(section.tiles);
        break;
      case StorefrontSectionKind.OfferBanners:
        if (section.fill === StorefrontFill.Auto) want(section.collections);
        break;
      case StorefrontSectionKind.Trust:
        plan.methods = true;
        break;
      default:
        break;
    }
  }
  plan.all = { sort: 'featured', limit: withRoom(STOREFRONT_ALL_PRODUCTS_PAGE, above) };
  return plan;
}

/**
 * SB-32 Q1: where "সব প্রোডাক্ট" goes on every home, the seller's own included -- after the page's last row of
 * products; with none, before the trust strip, else at the end. The index of the section it goes before.
 */
export function allProductsAt(sections: readonly StorefrontSection[]): number {
  let last = -1;
  sections.forEach((section, index) => {
    if (section.kind === StorefrontSectionKind.Products) last = index;
  });
  if (last >= 0) return last + 1;
  const trust = sections.findIndex((section) => section.kind === StorefrontSectionKind.Trust);
  return trust >= 0 ? trust : sections.length;
}

/**
 * SB-32: what the rows and "সব প্রোডাক্ট" show, from what they read. Top to bottom, a row that fills itself skips the
 * cards a row above it showed and takes its count of the rest; one left short of its fill shows nothing, and its cards
 * come in "সব প্রোডাক্ট" (Q6). A picked row shows as chosen. "সব প্রোডাক্ট" holds every card not shown above.
 */
export function homeLayout(
  design: Pick<PublicStorefrontDesign, 'sections'>,
  rows: ReadonlyMap<string, readonly ProductCard[]>,
  all: ProductPage,
): { rows: Map<string, ProductCard[]>; all: AllProducts } {
  const seen = new Set<string>();
  const above = new Set<string>();
  const shown = new Map<string, ProductCard[]>();
  for (const section of design.sections) {
    if (section.kind !== StorefrontSectionKind.Products) continue;
    const read = rows.get(section.id) ?? [];
    const cards = fillsItself(section)
      ? read.filter((card) => !seen.has(cardKey(card))).slice(0, section.count)
      : [...read];
    if (cards.length === 0) continue;
    if (mustFill(section) && cards.length < storefrontRowFill(section)) continue;
    for (const card of cards) {
      seen.add(cardKey(card));
      above.add(card.id);
    }
    shown.set(section.id, cards);
  }
  const rest = all.products.filter((card) => !seen.has(cardKey(card)));
  return {
    rows: shown,
    all: {
      shown: rest.slice(0, STOREFRONT_ALL_PRODUCTS_PAGE),
      queued: rest.slice(STOREFRONT_ALL_PRODUCTS_PAGE),
      cursor: all.nextCursor,
      seen: [...seen, ...rest.map(cardKey)],
      above: [...above],
    },
  };
}

/**
 * BL-13: when a collection came back empty, the standard ones not yet read, so one can show in its place. Read after
 * the first reads, and only then: a shop with something in every collection asks nothing more.
 */
export function fallbackReads(
  plan: { collections: readonly StorefrontCollection[] },
  read: ReadonlyMap<string, readonly ProductCard[]>,
): StorefrontCollection[] {
  const empty = plan.collections.some(
    (collection) => (read.get(collectionKey(collection)) ?? []).length === 0,
  );
  if (!empty) return [];
  return FALLBACK_COLLECTIONS.filter((collection) => !read.has(collectionKey(collection)));
}

/** The same request asked once, however many sections ask it. */
export function queryKey(query: ProductQuery): string {
  return JSON.stringify([
    query.sort ?? '',
    query.category ?? '',
    query.onSale === true,
    query.inStock === true,
    query.productIds ?? [],
    query.limit ?? 0,
  ]);
}
