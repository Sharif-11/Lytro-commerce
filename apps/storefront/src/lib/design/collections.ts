import { StorefrontLinkKind, type StorefrontCollection } from '@lytronix/validators';
import type {
  DesignTarget,
  ImageView,
  ProductCard,
  ProductQuery,
  PublicCategory,
} from '../api/storefront-api';
import { money, type Words } from '../i18n/words';

// STOREFRONT-BUILDER-PLAN BL-3, BL-9, BL-12, BL-13: a collection of the shop's -- on sale, just in, best sellers or one
// category -- as a hero's tile or a banner that fills itself draws it: words and a photo from the shop's own data, and
// the collection's page behind a tap.

/** BL-12: a collection's products read: one for its photo, the rest to pass over what the slide or another shows. */
export const COLLECTION_READ = 4;

/** BL-13: the collections an empty one gives way to, in this order. */
export const FALLBACK_COLLECTIONS: readonly StorefrontCollection[] = [
  { kind: StorefrontLinkKind.OnSale },
  { kind: StorefrontLinkKind.JustIn },
  { kind: StorefrontLinkKind.BestSellers },
];

/** One collection, however many places show it. */
export function collectionKey(collection: StorefrontCollection): string {
  return collection.kind === StorefrontLinkKind.Category
    ? `category:${collection.categoryId}`
    : collection.kind;
}

/** What a collection reads; null for a category shoppers can no longer reach (SB-16). */
export function collectionQuery(
  collection: StorefrontCollection,
  categories: readonly Pick<DesignTarget, 'id' | 'slug'>[],
): ProductQuery | null {
  const base = { inStock: true, limit: COLLECTION_READ };
  switch (collection.kind) {
    case StorefrontLinkKind.OnSale:
      return { ...base, sort: 'discount', onSale: true };
    case StorefrontLinkKind.JustIn:
      return { ...base, sort: 'newest' };
    case StorefrontLinkKind.BestSellers:
      return { ...base, sort: 'best_selling' };
    case StorefrontLinkKind.Category: {
      const category = categories.find((row) => row.id === collection.categoryId);
      return category ? { ...base, sort: 'newest', category: category.slug } : null;
    }
  }
}

/** A collection as a tile or a banner shows it. */
export interface CollectionView {
  key: string;
  /** The product its photo is of, which the places after it pass over; null for a category's own picture. */
  productId: string | null;
  image: ImageView;
  kicker: string;
  headline: string;
  description: string | null;
  href: string;
}

/** What the collections are drawn from. */
export interface CollectionFacts {
  /** Each collection's products, by `collectionKey`. */
  lists: ReadonlyMap<string, readonly ProductCard[]>;
  /** The shop's categories, for a category's picture, name, count and page. */
  categories: readonly PublicCategory[];
  /** SB-9: what is on sale now. */
  sale: { products: number; bestDiscount: number };
  words: Words;
}

function categoryOf(tree: readonly PublicCategory[], id: string): PublicCategory | null {
  for (const category of tree) {
    if (category.id === id) return category;
    const found = categoryOf(category.children, id);
    if (found) return found;
  }
  return null;
}

function viewOf(
  collection: StorefrontCollection,
  facts: CollectionFacts,
  skip: ReadonlySet<string>,
): CollectionView | null {
  const key = collectionKey(collection);
  const pictured = (facts.lists.get(key) ?? []).filter((product) => product.image !== null);
  const pick = pictured.find((product) => !skip.has(product.id)) ?? pictured.at(-1) ?? null;
  const { words } = facts;
  if (collection.kind === StorefrontLinkKind.Category) {
    const category = categoryOf(facts.categories, collection.categoryId);
    if (!category || category.productCount === 0) return null;
    const own = category.cover ?? category.image;
    const image = own ?? pick?.image ?? null;
    if (!image) return null;
    return {
      key,
      productId: own || !pick ? null : pick.id,
      image,
      kicker: words.t('sb_n_products', { n: category.productCount }),
      headline: category.name,
      description: null,
      href: `/c/${category.slug}`,
    };
  }
  if (!pick?.image) return null;
  const base = { key, productId: pick.id, image: pick.image };
  switch (collection.kind) {
    case StorefrontLinkKind.OnSale:
      if (facts.sale.products === 0) return null;
      return {
        ...base,
        kicker: words.t('sb_offers_on'),
        headline: words.t('sb_up_to', { p: facts.sale.bestDiscount }),
        description: words.t('sb_on_n', { n: facts.sale.products }),
        href: '/offers',
      };
    case StorefrontLinkKind.JustIn:
      return {
        ...base,
        kicker: words.t('sb_just_in'),
        headline: pick.name,
        description: pick.minPrice === null ? null : money(pick.minPrice),
        href: '/new',
      };
    case StorefrontLinkKind.BestSellers:
      return {
        ...base,
        kicker: words.t('sb_best_sellers'),
        headline: pick.name,
        description:
          (pick.ordered ?? 0) > 0 ? words.t('sb_ordered', { n: pick.ordered ?? 0 }) : null,
        href: '/best',
      };
  }
}

/**
 * BL-12, BL-13: what each collection shows, in order. One with nothing to show gives way to the first standard
 * collection none of the others shows, else leaves; each photo passes over the products already shown (`shown`, then
 * the places before it).
 */
export function collectionViews(
  collections: readonly StorefrontCollection[],
  facts: CollectionFacts,
  shown: readonly string[] = [],
): CollectionView[] {
  const skip = new Set(shown);
  const taken = new Set(collections.map(collectionKey));
  const views: CollectionView[] = [];
  for (const collection of collections) {
    let view = viewOf(collection, facts, skip);
    for (const instead of FALLBACK_COLLECTIONS) {
      if (view) break;
      const key = collectionKey(instead);
      if (taken.has(key)) continue;
      view = viewOf(instead, facts, skip);
      if (view) taken.add(key);
    }
    if (!view) continue;
    if (view.productId) skip.add(view.productId);
    views.push(view);
  }
  return views;
}
