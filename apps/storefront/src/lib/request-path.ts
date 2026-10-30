// The not-found page says what is missing by the path it was asked for (a product link, LND-03, or anything else), and
// Next gives that page no path of its own, so the middleware puts it on every request as this header.
export const STOREFRONT_PATH_HEADER = 'x-storefront-path';
// Slice 13: and its query, so a request on another of the shop's hosts is led to the same page at its main address.
export const STOREFRONT_QUERY_HEADER = 'x-storefront-query';

/**
 * Slice 13 (its read, points 2 and 3): where a request on another of the shop's hosts goes -- the same path and query
 * on its main address -- or null on the main address itself, or while the shop has no own domain serving.
 */
export function mainAddressTarget(
  host: string,
  shop: { mainHost: string | null; publicOrigin: string },
  path: string,
  query: string,
): string | null {
  if (shop.mainHost === null || host === shop.mainHost) return null;
  return `${shop.publicOrigin}${path === '' ? '/' : path}${query}`;
}
