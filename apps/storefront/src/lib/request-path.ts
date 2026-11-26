// The not-found page says what is missing by the path it was asked for (a product link, LND-03, or anything else), and
// Next gives that page no path of its own, so the middleware puts it on every request as this header.
export const STOREFRONT_PATH_HEADER = 'x-storefront-path';
// Slice 13: and its query, so a request on another of the shop's hosts is led to the same page at its main address.
export const STOREFRONT_QUERY_HEADER = 'x-storefront-query';
// STOREFRONT-BUILDER-PLAN SB-12: the draft's preview, at its own address (app/preview).
export const PREVIEW_PATH = '/preview';

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
  // STOREFRONT-BUILDER-PLAN SB-12: the draft's preview stays at the shop's Lytro address, the one host the dashboard
  // may frame it from (deploy/Caddyfile, security_headers_shop).
  if (path === PREVIEW_PATH) return null;
  return `${shop.publicOrigin}${path === '' ? '/' : path}${query}`;
}

/**
 * A product's or category's slug from its page's address (/p/, /l/, /c/), as the shop has it. Next hands a page that
 * segment still percent-encoded when it holds letters outside ASCII -- a Bangla product's /p/অর্গানজা-শাড়ি arrives as
 * %E0%A6%85... -- and the API, asked with it encoded once more, found nothing: every Bangla product and category page
 * answered 404 (staging, 2026-11-19). Decoded once here; a broken escape is kept as typed, and finds nothing.
 */
export function slugOfSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * The query string a moved link keeps: all of it -- `?v=`, a design card's `?d=`, an ad's click ID -- so the redirect
 * lands on the same variant or design and the visit stays the ad's.
 */
export function keptQuery(query: Record<string, string | string[] | undefined>): string {
  const kept = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    for (const each of value === undefined ? [] : Array.isArray(value) ? value : [value]) {
      kept.append(name, each);
    }
  }
  const text = kept.toString();
  return text === '' ? '' : `?${text}`;
}
