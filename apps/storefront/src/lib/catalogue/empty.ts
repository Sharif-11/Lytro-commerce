import type { ProductCard, ProductPage } from '../api/storefront-api';
import { spreadsDesigns } from '../design/card-links';
import { type OpenShopPage, storefrontApi } from '../storefront';

// STOREFRONT-BUILDER-PLAN SB-33 (the owner, 2026-11-26): a page with no products is never a dead end. It leads to more of
// the shop's products, or, in a shop with none yet, to the ways of reaching it.

/** How many of the shop's other products an empty page offers. */
export const EMPTY_MORE = 4;

/** What an empty list leads to. */
export type EmptyNext =
  /** "In stock only" emptied it: say so, and lift the filter. */
  | { kind: 'filtered' }
  /** The shop has no product at all yet: the home's words and its contacts. */
  | { kind: 'bare' }
  /** Other products exist: these few, in stock first. */
  | { kind: 'more'; products: ProductCard[] };

/**
 * What a list page shows when its list came back empty: one more read (only then) of the shop's first few products, in
 * `sort`'s order with what is in stock first; none at all means a bare shop. Null while the list has products.
 */
export async function emptyNext(
  page: OpenShopPage,
  list: ProductPage | null,
  inStock: boolean,
  sort: 'newest' | 'best_selling' = 'newest',
): Promise<EmptyNext | null> {
  if (list !== null && list.products.length > 0) return null;
  if (inStock) return { kind: 'filtered' };
  const more = await storefrontApi.products(page.shop, page.shopper, {
    sort,
    limit: EMPTY_MORE,
    designs: spreadsDesigns(page.info),
  });
  const products = more?.products ?? [];
  return products.length === 0 ? { kind: 'bare' } : { kind: 'more', products };
}

/** Every product an empty page shows (none of its list's, the few it offers), so a change to any purges it (D9-32). */
export function shownOn(list: ProductPage | null, next: EmptyNext | null): ProductCard[] {
  return [...(list?.products ?? []), ...(next?.kind === 'more' ? next.products : [])];
}
