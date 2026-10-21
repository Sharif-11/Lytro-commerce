import { PublicProductSort, type PublicProductListQuery } from '@lytronix/validators';

/**
 * CCH-03: a product list request as its cache entry is named -- the order resolved (relevance when searching, else
 * featured), the search's spacing and letter case folded, the version and every unknown parameter left out -- so two
 * requests asking the same thing in any order share one entry.
 */
export interface ListRequest {
  category: string | null;
  search: string | null;
  sort: PublicProductSort;
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
    cursor: query.cursor ?? null,
    limit: query.limit,
  };
}

// What each order's positions are, in order, so a cursor made for another order (or by hand) is refused, not sent to
// the database.
const INTEGER = /^-?\d{1,10}$/;
const TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PRICE = /^\d{1,8}(\.\d{1,2})?$/;
const SCORE = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i;
const POSITIONS: Readonly<Record<PublicProductSort, readonly RegExp[]>> = {
  [PublicProductSort.Featured]: [INTEGER, TIME, UUID],
  [PublicProductSort.Newest]: [TIME, UUID],
  [PublicProductSort.PriceLow]: [PRICE, UUID],
  [PublicProductSort.PriceHigh]: [PRICE, UUID],
  [PublicProductSort.Relevance]: [SCORE, UUID],
};

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
  const position = decoded.slice(1);
  const expected = POSITIONS[sort];
  if (position.length !== expected.length) return null;
  const valid = position.every(
    (value: unknown, index) => typeof value === 'string' && expected[index]?.test(value) === true,
  );
  return valid ? (position as string[]) : null;
}
