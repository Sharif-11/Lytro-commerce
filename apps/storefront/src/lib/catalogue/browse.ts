import { PRODUCT_NEW_DAYS } from '@lytronix/validators/common';
import type { DeliveryZoneView, PublicCategory } from '../api/storefront-api';
import type { Words } from '../i18n/words';

// Slice 12b: how the storefront's home, category, New arrivals and search pages read the catalogue (STOREFRONT-DESIGN
// §2, §3), as plain functions of what the server answered.

const DAY_MS = 24 * 60 * 60 * 1000;

/** A card's "New" tag: a product added within PRODUCT_NEW_DAYS. */
export function isNew(createdAt: string, now: number): boolean {
  const added = Date.parse(createdAt);
  return !Number.isNaN(added) && now - added < PRODUCT_NEW_DAYS * DAY_MS;
}

/** The home hero's line: the first three top-level categories, "and more" when there are others; none, no line. */
export function heroLine(categories: readonly PublicCategory[], words: Words): string | null {
  if (categories.length === 0) return null;
  const list = categories
    .slice(0, 3)
    .map((category) => category.name)
    .join(', ');
  return categories.length > 3 ? words.t('hero_cats', { list }) : list;
}

/** The trust strip's delivery charges: the least and most among the zones that deliver; none, nothing to say. */
export function deliveryRange(
  zones: readonly DeliveryZoneView[],
): { from: number; to: number } | null {
  const charges = zones
    .filter((zone) => !zone.noDelivery)
    .map((zone) => Number(zone.charge))
    .sort((a, b) => a - b);
  const from = charges[0];
  const to = charges.at(-1);
  return from === undefined || to === undefined ? null : { from, to };
}

export interface FoundCategory {
  category: PublicCategory;
  /** The categories it sits among: its parent's children, or the top level. */
  siblings: PublicCategory[];
  parent: PublicCategory | null;
  /** The top-level category it is in, itself at the top: the header's link it lights. */
  top: PublicCategory;
}

/** A visible category by its link, anywhere in the tree. */
export function findCategory(
  tree: readonly PublicCategory[],
  slug: string,
  parent: PublicCategory | null = null,
  top: PublicCategory | null = null,
): FoundCategory | null {
  for (const category of tree) {
    if (category.slug === slug) {
      return { category, siblings: [...tree], parent, top: top ?? category };
    }
    const inside = findCategory(category.children, slug, category, top ?? category);
    if (inside) return inside;
  }
  return null;
}

/** A category by its id, anywhere in the tree. */
export function categoryById(
  tree: readonly PublicCategory[],
  id: string | null,
): PublicCategory | null {
  if (id === null) return null;
  for (const category of tree) {
    if (category.id === id) return category;
    const inside = categoryById(category.children, id);
    if (inside) return inside;
  }
  return null;
}

/** The chips over a category's grid: its subcategories after "All" (the category itself), or, when it has none, the
    categories it sits among with itself on. */
export function chipsFor(found: FoundCategory): { all: boolean; chips: PublicCategory[] } {
  return found.category.children.length > 0
    ? { all: true, chips: found.category.children }
    : { all: false, chips: found.siblings };
}

/** The orders a category or New arrivals page offers; a search orders by relevance only. */
export const LIST_SORTS = ['featured', 'newest', 'price_low', 'price_high'] as const;
export type ListSort = (typeof LIST_SORTS)[number];

export interface ListParams {
  sort: ListSort;
  inStock: boolean;
}

/** The order and stock filter a page's address asks for (`?sort=`, `?stock=in`); anything unknown is the default. */
export function listParams(
  query: Record<string, string | string[] | undefined>,
  fallback: ListSort,
): ListParams {
  const sort = query['sort'];
  return {
    sort: LIST_SORTS.find((each) => each === sort) ?? fallback,
    inStock: query['stock'] === 'in',
  };
}

/** A list page's address with this order and stock filter, the default order left out. */
export function listHref(path: string, params: ListParams, fallback: ListSort): string {
  const search = new URLSearchParams();
  if (params.sort !== fallback) search.set('sort', params.sort);
  if (params.inStock) search.set('stock', 'in');
  const query = search.toString();
  return query === '' ? path : `${path}?${query}`;
}

/** The search a page's address names (`?q=`), trimmed; empty is none. */
export function searchOf(query: Record<string, string | string[] | undefined>): string | null {
  const q = query['q'];
  const text = typeof q === 'string' ? q.replace(/\s+/gu, ' ').trim() : '';
  return text === '' ? null : text;
}
