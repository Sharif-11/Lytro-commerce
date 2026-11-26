import { StorefrontLinkKind, type StorefrontLink } from '@lytronix/validators';
import type { PublicCategory, PublicShop, PublicStorefrontDesign } from '../api/storefront-api';
import { productPath } from './card-links';

/** OFFERS-PLAN OF-8: an offer's page, at its link name. */
export function offerPath(slug: string): string {
  return `/offers/${slug}`;
}

/**
 * SB-16: where a button leads; a category or product shoppers can no longer reach leads home, an offer no longer
 * running leads to On sale (OF-22).
 */
export function linkHref(
  link: StorefrontLink,
  design: Pick<PublicStorefrontDesign, 'categories' | 'products' | 'offers'>,
): string {
  switch (link.kind) {
    case StorefrontLinkKind.OnSale:
      return '/offers';
    case StorefrontLinkKind.JustIn:
      return '/new';
    case StorefrontLinkKind.BestSellers:
      return '/best';
    case StorefrontLinkKind.Category: {
      const category = design.categories.find((row) => row.id === link.categoryId);
      return category ? `/c/${category.slug}` : '/';
    }
    case StorefrontLinkKind.Product: {
      const product = design.products.find((row) => row.id === link.productId);
      return product ? productPath(product.id) : '/';
    }
    case StorefrontLinkKind.Offer: {
      const offer = (design.offers ?? []).find((row) => row.id === link.offerId);
      return offer ? offerPath(offer.slug) : '/offers';
    }
  }
}

/**
 * The owner, 2026-11-25: the অফার link shows only while something is on sale -- a running offer or a product's own sale
 * price -- and comes back by itself when one starts. A product going on or off sale drops the shop's kept pages
 * (CatalogueVersion, ProductService), so no kept page keeps a stale link. /offers itself stays, empty, for old links.
 */
export function showsOffers(shop: Pick<PublicShop, 'sale'>): boolean {
  return (shop.sale?.products ?? 0) > 0;
}

/** A category anywhere in the shop's tree; null when shoppers can no longer reach it. */
export function categoryOf(tree: readonly PublicCategory[], id: string): PublicCategory | null {
  for (const category of tree) {
    if (category.id === id) return category;
    const found = categoryOf(category.children, id);
    if (found) return found;
  }
  return null;
}

/** SB-16 as amended 2026-11-26: what a seller's own slide or banner is shown by -- what its link leads to holds now. */
export interface LinkFacts {
  /** The shop's categories, each with its products (its subcategories' included). */
  categories: readonly PublicCategory[];
  /** What is on sale now. */
  sale: { products: number };
  /** The products the shop shows; undefined from an older server's answer. */
  productCount: number | undefined;
}

/**
 * SB-16 as amended (the owner, 2026-11-26, "yes to all"): a seller's own slide or banner shows only while where it leads
 * holds something -- On sale while anything is on sale, an offer while it runs, a category while it holds a product,
 * Just in and Best sellers while the shop shows any product. It comes back by itself when that changes. A product's link
 * always shows (one gone leads home, SB-16).
 */
export function linkShows(
  link: StorefrontLink,
  design: Pick<PublicStorefrontDesign, 'offers'>,
  facts: LinkFacts,
): boolean {
  switch (link.kind) {
    case StorefrontLinkKind.OnSale:
      return facts.sale.products > 0;
    case StorefrontLinkKind.Offer:
      return (design.offers ?? []).some((offer) => offer.id === link.offerId);
    case StorefrontLinkKind.Category:
      return (categoryOf(facts.categories, link.categoryId)?.productCount ?? 0) > 0;
    case StorefrontLinkKind.JustIn:
    case StorefrontLinkKind.BestSellers:
      return facts.productCount === undefined || facts.productCount > 0;
    case StorefrontLinkKind.Product:
      return true;
  }
}
