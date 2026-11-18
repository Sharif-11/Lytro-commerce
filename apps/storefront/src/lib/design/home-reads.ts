import {
  ProductRowSource,
  StorefrontFill,
  StorefrontSectionKind,
  type StorefrontSection,
} from '@lytronix/validators';
import type {
  ProductCard,
  ProductQuery,
  PublicStorefrontDesign,
  ShopperPaymentMethod,
} from '../api/storefront-api';

// STOREFRONT-BUILDER-PLAN SB-9: what the designed home reads besides the shop -- each product row's products, and what
// the sections that fill themselves draw from. Plain functions of the design; the page makes the reads.

/** SB-9: the auto hero's slides: the three biggest savings (or, with nothing on sale, the three newest). */
export const HERO_AUTO_SLIDES = 3;

type ProductsSection = Extract<StorefrontSection, { kind: StorefrontSectionKind.Products }>;

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

/** What the home's reads came back with, by section where a section has its own. */
export interface DesignedHomeReads {
  /** Each product row's products, by section ID; a row reading nothing is left out. */
  rows: ReadonlyMap<string, ProductCard[]>;
  /** SB-9: the auto hero's products. */
  hero: ProductCard[];
  /** SB-9: the auto offer banners' two products: the biggest saving, and the newest. */
  offers: { saving: ProductCard | null; newest: ProductCard | null };
  /** SB-9: the trust strip's ways to pay. */
  methods: ShopperPaymentMethod[];
}

/** Every read the design's visible sections need, once each. */
export interface HomeReadPlan {
  rows: { sectionId: string; query: ProductQuery }[];
  hero: boolean;
  offers: boolean;
  methods: boolean;
}

export function homeReadPlan(design: PublicStorefrontDesign): HomeReadPlan {
  const plan: HomeReadPlan = { rows: [], hero: false, offers: false, methods: false };
  for (const section of design.sections) {
    switch (section.kind) {
      case StorefrontSectionKind.Products: {
        const query = rowQuery(section, design);
        if (query) plan.rows.push({ sectionId: section.id, query });
        break;
      }
      case StorefrontSectionKind.Hero:
        if (section.fill === StorefrontFill.Auto) plan.hero = true;
        break;
      case StorefrontSectionKind.OfferBanners:
        if (section.fill === StorefrontFill.Auto) plan.offers = true;
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
