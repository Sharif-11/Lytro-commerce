import { EDGE_LIFETIMES, type EdgeLifetime } from '@lytronix/validators/edge';
import { languageCookie } from '../i18n/language';

// PHASE-9-PLAN 9.10 (2026-11-20, for the owner's Facebook campaign): lytro.app's pages kept at Cloudflare's edge, as
// shop pages are (D9-32, docs/DEPLOYMENT.md §9g). Only what every visitor sees alike is kept: the landing, about,
// listener, terms and privacy pages, read in Bangla. Browsers never keep them (Next's own `Cache-Control` stays), and
// nothing here reads the page's query, so an ad's `?fbclid=` or `?utm_*=` link is the same kept page (Cloudflare's
// cache rule ignores the query; test/edge-guards.test.ts keeps every page from reading it).

/** The tag every kept page carries, so the owner can clear them all at once (Caching → Purge → Custom, by tag). */
export const SITE_EDGE_TAG = 'site';

/** The pages the edge may keep. Not /contact: its form posts to a Server Action whose name changes with each build,
    so a page kept across a release would post to one that no longer exists. Not a past legal version's own address:
    it is rarely read, and an unknown one is a 404. */
export const KEPT_PATHS: ReadonlySet<string> = new Set([
  '/',
  '/about',
  '/listener',
  '/terms',
  '/privacy',
]);

// The storefront's page lifetime, one definition with it (packages/validators): 5 minutes, then 10 more handed out
// stale while a fresh copy is fetched.
const PAGE = EDGE_LIFETIMES.page;
// While the website is down, the last good page is better than none, for up to a day (the storefront's own rule).
const STALE_IF_ERROR_SECONDS = 86_400;

/** What the policy needs of a request, so it is tested without Next. */
export interface SiteRequest {
  method: string;
  path: string;
  header(name: string): string | null;
  cookie(name: string): string | undefined;
}

/** Which of the site's requests the edge may keep, and the headers that say so. */
export class SiteEdgePolicy {
  constructor(
    private readonly lifetime: EdgeLifetime = PAGE,
    private readonly staleIfErrorSeconds = STALE_IF_ERROR_SECONDS,
  ) {}

  /**
   * The edge's headers for this request's page: kept for a Bangla reader, `no-store` for an English one (Cloudflare's
   * rule skips that cookie too), none for anything else (a form post, a browser's fetch, any other path).
   */
  headersFor(request: SiteRequest): Record<string, string> | null {
    if (request.method !== 'GET') return null;
    if (!KEPT_PATHS.has(request.path)) return null;
    // A tap on a link fetches the page's data, not its HTML, at the same path. Next hides its own marks of that fetch
    // (the `RSC` header, `?_rsc=`) from middleware, so the browser's says it: anything but a page load is never kept.
    // Cloudflare's rule skips `?_rsc=` as well (§9g), for a browser that sends no such header. A crawler sends none.
    const destination = request.header('sec-fetch-dest');
    if (destination !== null && destination !== 'document') return null;
    if (languageCookie.parse(request.cookie(languageCookie.name)) !== 'bn')
      return { 'cloudflare-cdn-cache-control': 'no-store' };
    return {
      'cloudflare-cdn-cache-control': [
        `max-age=${String(this.lifetime.maxAge)}`,
        `stale-while-revalidate=${String(this.lifetime.staleWhileRevalidate)}`,
        `stale-if-error=${String(this.staleIfErrorSeconds)}`,
      ].join(', '),
      'cache-tag': SITE_EDGE_TAG,
    };
  }
}
