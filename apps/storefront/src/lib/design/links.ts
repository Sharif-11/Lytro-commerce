import { StorefrontLinkKind, type StorefrontLink } from '@lytronix/validators';
import type { PublicShop, PublicStorefrontDesign } from '../api/storefront-api';
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
