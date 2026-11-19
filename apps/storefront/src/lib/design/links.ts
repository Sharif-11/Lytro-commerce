import { StorefrontLinkKind, type StorefrontLink } from '@lytronix/validators';
import type { PublicStorefrontDesign } from '../api/storefront-api';

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
      return product ? `/p/${product.slug}` : '/';
    }
    case StorefrontLinkKind.Offer: {
      const offer = (design.offers ?? []).find((row) => row.id === link.offerId);
      return offer ? offerPath(offer.slug) : '/offers';
    }
  }
}
