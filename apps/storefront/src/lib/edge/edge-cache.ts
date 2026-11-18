import { EDGE_LIFETIMES, type EdgeLifetime } from '@lytronix/validators/edge';
import { SHOPPER_COOKIE } from '../account/shopper-cookie';
import { LANGUAGE_COOKIE, parseLanguage } from '../i18n/language';

// Slice 9.10, D9-32: a shop's pages kept at Cloudflare's edge. Only what every shopper sees alike is kept: a shop's
// Lytro address (never its own domain, at launch), its home, category, product, landing, new-arrivals and search pages,
// for a shopper who isn't signed in and reads Bangla. The middleware renders such a page once more inside the storefront
// (EdgeRenderer), reads the marks the page left in it, and answers with the edge's lifetime and the page's tags, or with
// a 503 the edge never keeps when the server was too busy. Everything else is rendered for its shopper and kept nowhere.
// Nothing here loads the pages' words, so the middleware stays small.

/** Set on the storefront's own second request for a page it will hand the edge (never trusted for anything else). */
export const EDGE_RENDER_HEADER = 'x-lytro-edge-render';
/** The shopper's host on that request: Node's fetch sends its own Host, so the page reads the shop's from here. */
export const EDGE_HOST_HEADER = 'x-lytro-edge-host';

// How long the edge keeps a page: one definition with the server's purges (packages/validators, D9-32, D9-33).
export { EDGE_LIFETIMES, type EdgeLifetime };
const PAGE = EDGE_LIFETIMES.page;
const SEARCH = EDGE_LIFETIMES.search;
// While the server is down or too busy, the last good page is better than none, for up to a day.
const STALE_IF_ERROR_SECONDS = 86_400;

/** What the policy needs of a request, so it is tested without Next. */
export interface EdgeRequest {
  method: string;
  /** As the shopper asked for it, lower case, any port included. */
  host: string;
  path: string;
  header(name: string): string | null;
  cookie(name: string): string | undefined;
}

/** Which requests the edge may keep, and for how long. */
export class EdgeCachePolicy {
  constructor(private readonly platformDomain: string) {}

  /** The edge's lifetime for this request's page, or null when it is rendered for this shopper alone. */
  lifetimeOf(request: EdgeRequest): EdgeLifetime | null {
    const lifetime = EdgeCachePolicy.sharedLifetimeOf(request);
    if (lifetime === null) return null;
    if (!this.isShopAddress(request.host)) return null;
    if (parseLanguage(request.cookie(LANGUAGE_COOKIE)) !== 'bn') return null;
    return lifetime;
  }

  /**
   * How long a page every shopper of its shop sees alike is kept, whatever its address and language: the edge keeps
   * the Bangla ones on a shop's Lytro address, the storefront's Redis every one (D9-33). Null when it is rendered for
   * this shopper alone.
   */
  static sharedLifetimeOf(request: EdgeRequest): EdgeLifetime | null {
    if (request.method !== 'GET') return null;
    // The storefront's own second request, and Next's in-page navigations (none link that way today), are never kept.
    if (request.header(EDGE_RENDER_HEADER) !== null) return null;
    if (request.header('rsc') !== null || request.header('next-router-prefetch') !== null)
      return null;
    if (request.cookie(SHOPPER_COOKIE) !== undefined) return null;
    return EdgeCachePolicy.lifetimeOfPath(request.path);
  }

  /**
   * Whether a kept page depends on its query. The home, product and landing pages a shared render draws never read
   * theirs (a `?v=` link is applied in the browser), so Cloudflare's cache rule ignores it (DEPLOYMENT §9f) and the
   * storefront's Redis does too; every other kept page is kept apart by its query.
   */
  static readsQuery(path: string): boolean {
    return !(path === '/' || /^\/[pl]\/[^/]+$/.test(path));
  }

  /** A shop's Lytro address (`<slug>.<platform domain>`); a shop's own domain is left uncached at launch. */
  isShopAddress(host: string): boolean {
    const name = host.replace(/:\d+$/, '');
    const suffix = `.${this.platformDomain}`;
    if (!name.endsWith(suffix)) return false;
    const label = name.slice(0, -suffix.length);
    return label.length > 0 && !label.includes('.');
  }

  static lifetimeOfPath(path: string): EdgeLifetime | null {
    // STOREFRONT-BUILDER-PLAN SB-16: the offers and best-sellers lists are kept as New arrivals is.
    if (path === '/' || path === '/new' || path === '/offers' || path === '/best') return PAGE;
    if (path === '/search') return SEARCH;
    return /^\/[cpl]\/[^/]+$/.test(path) ? PAGE : null;
  }
}

/** The marks a page leaves for the middleware (`<meta name="lytro-edge">`): what it shows, or why it can't be kept. */
export type EdgeMark =
  | { kind: 'tags'; tags: readonly string[] }
  | { kind: 'busy'; seconds: number }
  | { kind: 'private' };

export const EDGE_MARK_NAME = 'lytro-edge';

export function edgeMarkContent(mark: EdgeMark): string {
  switch (mark.kind) {
    case 'tags':
      return `tags ${mark.tags.join(' ')}`;
    case 'busy':
      return `busy ${String(mark.seconds)}`;
    case 'private':
      return 'private';
  }
}

/** What a rendered page's marks say: its tags (none, it isn't kept), a busy wait, and whether it is one shopper's. */
export interface EdgeMarks {
  tags: string[] | null;
  busySeconds: number | null;
  private: boolean;
}

const MARK_PATTERN = /<meta name="lytro-edge" content="([^"]*)"\s*\/?>/g;

export function readEdgeMarks(html: string): EdgeMarks {
  const marks: EdgeMarks = { tags: null, busySeconds: null, private: false };
  for (const match of html.matchAll(MARK_PATTERN)) {
    const [kind = '', ...rest] = (match[1] ?? '').split(' ').filter((part) => part.length > 0);
    if (kind === 'tags') marks.tags = [...new Set([...(marks.tags ?? []), ...rest])];
    else if (kind === 'busy') marks.busySeconds = Number(rest[0]) > 0 ? Number(rest[0]) : 1;
    else if (kind === 'private') marks.private = true;
  }
  return marks;
}

/** The headers Cloudflare keeps a page by. Browsers never keep it: a purge can't reach them. */
export function edgeHeaders(
  lifetime: EdgeLifetime,
  tags: readonly string[],
): Record<string, string> {
  return {
    'cloudflare-cdn-cache-control': [
      `max-age=${String(lifetime.maxAge)}`,
      `stale-while-revalidate=${String(lifetime.staleWhileRevalidate)}`,
      `stale-if-error=${String(STALE_IF_ERROR_SECONDS)}`,
    ].join(', '),
    'cache-tag': tags.join(','),
  };
}
