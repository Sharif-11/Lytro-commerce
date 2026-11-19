import {
  HeroDesign,
  ProductRowSource,
  STOREFRONT_THEMES,
  StorefrontFill,
  StorefrontSectionKind,
  type HeroSource,
  type StorefrontCollection,
  type StorefrontSection,
} from '@lytronix/validators';
import type {
  ProductCard,
  ProductQuery,
  PublicStorefrontDesign,
  ShopperPaymentMethod,
} from '../api/storefront-api';
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
  design: Pick<PublicStorefrontDesign, 'categories' | 'products'>,
): ProductQuery | null {
  // Sold-out products leave a row (SB-9).
  const base = { inStock: true, limit: section.count };
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
      return picked.length > 0 ? { inStock: true, productIds: picked } : null;
    }
  }
}

const NEWEST_SLIDES: ProductQuery = { sort: 'newest', inStock: true, limit: HERO_AUTO_SLIDES };

/** BL-3, BL-5: what an auto hero's slides read, and what they read instead when that comes back empty. */
export function heroQuery(source: HeroSource): {
  query: ProductQuery;
  fallback: ProductQuery | null;
} {
  switch (source) {
    case ProductRowSource.OnSale:
      return {
        query: { sort: 'discount', onSale: true, inStock: true, limit: HERO_AUTO_SLIDES },
        fallback: NEWEST_SLIDES,
      };
    case ProductRowSource.BestSellers:
      return {
        query: { sort: 'best_selling', inStock: true, limit: HERO_AUTO_SLIDES },
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

/** What the home's reads came back with, by section where a section has its own. */
export interface DesignedHomeReads {
  /** Each product row's products, by section ID; a row reading nothing is left out. */
  rows: ReadonlyMap<string, ProductCard[]>;
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
}

export function homeReadPlan(design: PublicStorefrontDesign): HomeReadPlan {
  const plan: HomeReadPlan = { rows: [], heroes: [], collections: [], methods: false };
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
        if (query) plan.rows.push({ sectionId: section.id, query });
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
  return plan;
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
