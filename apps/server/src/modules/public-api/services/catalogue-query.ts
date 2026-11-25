import { PublicProductSort, type PublicProductListQuery } from '@lytronix/validators';

/**
 * CCH-03: a product list request as its cache entry is named -- the order resolved (relevance when searching, else
 * featured), the search's spacing and letter case folded, the stock filter as true or false, the version and every
 * unknown parameter left out -- so two requests asking the same thing in any order share one entry.
 */
export interface ListRequest {
  category: string | null;
  search: string | null;
  sort: PublicProductSort;
  inStock: boolean;
  /** SB-9: only products on sale. */
  onSale: boolean;
  /** SB-9: only these products, in this order (a row the seller picked); null for any. */
  ids: string[] | null;
  /** DC-1: each design of a product with two or more its own card. */
  designs: boolean;
  /** OFFERS-PLAN OF-8: only one offer's cards (its link name); null for any. */
  offer: string | null;
  cursor: string | null;
  limit: number;
}

export function listRequestOf(query: PublicProductListQuery): ListRequest {
  const search =
    query.search === undefined ? null : query.search.replace(/\s+/gu, ' ').trim().toLowerCase();
  const asked = query.sort;
  const sort =
    asked === undefined || (asked === PublicProductSort.Relevance && search === null)
      ? search === null
        ? PublicProductSort.Featured
        : PublicProductSort.Relevance
      : asked;
  return {
    category: query.category?.toLowerCase() ?? null,
    search,
    sort,
    inStock: query.inStock ?? false,
    onSale: query.onSale ?? false,
    ids: query.productIds ?? null,
    designs: query.designs ?? false,
    offer: query.offer?.toLowerCase() ?? null,
    // SB-9: a picked row is one page of exactly its products.
    cursor: query.productIds === undefined ? (query.cursor ?? null) : null,
    limit: query.productIds === undefined ? query.limit : query.productIds.length,
  };
}

// What each order's positions are, in order, so a cursor made for another order (or by hand) is refused, not sent to
// the database.
const INTEGER = /^-?\d{1,10}$/;
const TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PRICE = /^\d{1,8}(\.\d{1,2})?$/;
const SCORE = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i;
const QUANTITY = /^\d{1,11}(\.\d{1,3})?$/;
// Every order starts with whether the card is in stock (the owner, 2026-11-25: sold-out cards last) and ends with the
// card's design number (DC-1); featured goes on with whether the seller placed it and where (DC-7).
const STOCKED = /^[01]$/;
const OWN_POSITIONS: Readonly<Record<PublicProductSort, readonly RegExp[]>> = {
  [PublicProductSort.Featured]: [INTEGER, INTEGER, TIME, UUID, INTEGER],
  [PublicProductSort.Newest]: [TIME, UUID, INTEGER],
  [PublicProductSort.PriceLow]: [PRICE, UUID, INTEGER],
  [PublicProductSort.PriceHigh]: [PRICE, UUID, INTEGER],
  [PublicProductSort.Relevance]: [SCORE, UUID, INTEGER],
  [PublicProductSort.Discount]: [INTEGER, TIME, UUID, INTEGER],
  [PublicProductSort.BestSelling]: [QUANTITY, TIME, UUID, INTEGER],
};

/**
 * The stock key's value for an in-stock card: 1 in the orders that run high to low, 0 in price low to high, so in
 * stock comes first either way. A cursor made before the key existed (a page kept from the release before) resumes
 * among the cards in stock.
 */
const inStockValue = (sort: PublicProductSort): string =>
  sort === PublicProductSort.PriceLow ? '0' : '1';

/** CCH-11: where the next page starts, as an opaque token naming its order. */
export function cursorOf(sort: PublicProductSort, position: readonly string[]): string {
  return Buffer.from(JSON.stringify([sort, ...position])).toString('base64url');
}

/** The position a cursor names, when it was made for this order; else null. */
export function positionOf(sort: PublicProductSort, cursor: string): string[] | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(decoded) || decoded[0] !== sort) return null;
  const own = OWN_POSITIONS[sort];
  const named: unknown[] = decoded.slice(1);
  const position = named.length === own.length ? [inStockValue(sort), ...named] : named;
  const expected = [STOCKED, ...own];
  if (position.length !== expected.length) return null;
  const valid = position.every(
    (value: unknown, index) => typeof value === 'string' && expected[index]?.test(value) === true,
  );
  return valid ? (position as string[]) : null;
}
