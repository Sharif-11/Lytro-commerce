// D9-32 (Slice 9.10): the tags Cloudflare keeps a shop's cached pages under, and the server purges them by. The storefront
// writes them on each page it lets Cloudflare keep; the server names the same ones when what a page shows changes. One
// definition for both, so a page is always tagged as its purge names it. Printable ASCII only (Cloudflare's rule): a slug
// is a host label and a product id a UUID. The storefront's own Redis copy of a drawn page (D9-33) uses the same tags
// and lifetimes. Light on purpose (`@lytronix/validators/edge`): the storefront's middleware reads it on every request.

/** Every page Cloudflare keeps, for a change that reaches every shop (the platform's attribute library). */
export const EDGE_TAG_EVERY = 'lytro';

/** Every kept page of one shop: its name, logo, colours, categories, zones, or its state changed. */
export function shopEdgeTag(slug: string): string {
  return `s:${slug}`;
}

/** A shop's listing pages (home, categories, new, search): which products they list changed. */
export function listingEdgeTag(slug: string): string {
  return `l:${slug}`;
}

/** Every kept page showing one product (its page, its landing pages, its card anywhere, its delivery estimates). */
export function productEdgeTag(productId: string): string {
  return `p:${productId}`;
}

/** How long a kept page lasts, in seconds, and how long after that the edge may still hand it out while it fetches a
    fresh one. */
export interface EdgeLifetime {
  maxAge: number;
  staleWhileRevalidate: number;
}

// The owner, 2026-11-14: five minutes for the shop's pages, a minute for search, whose phrases are endless. A purge on a
// seller's save or a sell-out ends a page's time sooner (the server's EdgePurges). The storefront's Redis keeps a drawn
// page as long as the edge does (D9-33).
export const EDGE_LIFETIMES: { readonly page: EdgeLifetime; readonly search: EdgeLifetime } = {
  page: { maxAge: 300, staleWhileRevalidate: 600 },
  search: { maxAge: 60, staleWhileRevalidate: 60 },
};

/**
 * D9-33: in the page cache's Redis, the hash of when each tag last changed (milliseconds, Redis's own clock). The server
 * writes a tag's time as it purges it; the storefront counts a kept page gone once any of its tags changed after the
 * page was drawn.
 */
export const PAGE_TAG_TIMES_KEY = 'page-tags';

/** How long a tag's change time is kept: past the longest a page lasts, so no page drawn before the change outlives it. */
export const PAGE_TAG_KEEP_MS =
  (Math.max(EDGE_LIFETIMES.page.maxAge, EDGE_LIFETIMES.search.maxAge) + 60) * 1000;

/**
 * D9-33: the server's purge in the page cache's Redis. KEYS: PAGE_TAG_TIMES_KEY. ARGV: PAGE_TAG_KEEP_MS, then the tags.
 * Writes each tag's change time by Redis's own clock, which the storefront compares a page's drawing with, each kept
 * PAGE_TAG_KEEP_MS (Redis 7.4's field expiry), and answers that time. At most CLEAR_PAGE_TAGS_AT_ONCE tags a call.
 */
export const CLEAR_PAGE_TAGS_SCRIPT = `local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local at = string.format('%.0f', now)
local fields = {}
for i = 2, #ARGV do
  fields[#fields + 1] = ARGV[i]
  fields[#fields + 1] = at
end
redis.call('HSET', KEYS[1], unpack(fields))
redis.call('HPEXPIRE', KEYS[1], ARGV[1], 'FIELDS', #ARGV - 1, unpack(ARGV, 2))
return now`;

/** How many tags one CLEAR_PAGE_TAGS_SCRIPT call takes (well inside Lua's limit on a call's arguments). */
export const CLEAR_PAGE_TAGS_AT_ONCE = 500;
