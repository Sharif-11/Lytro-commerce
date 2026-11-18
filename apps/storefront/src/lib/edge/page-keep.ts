import { createHash } from 'node:crypto';
import { LANGUAGE_COOKIE, parseLanguage } from '../i18n/language';
import { EdgeCachePolicy, type EdgeLifetime, type EdgeRequest } from './edge-cache';

/** A page the storefront's Redis may keep: its key there, and how long a drawn copy is fresh. */
export interface PageKeep {
  key: string;
  lifetime: EdgeLifetime;
}

/** What the policy needs of a request: the edge policy's, and the query as the shopper sent it (`?a=1`, or ''). */
export type KeptPageRequest = EdgeRequest & { search: string };

/**
 * D9-33: which pages the storefront's Redis keeps, and under what key. Every page every shopper of its shop sees alike
 * (EdgeCachePolicy.sharedLifetimeOf): on a shop's Lytro address or its own domain, in Bangla or English, as long as the
 * edge keeps one. Its key names this build, the shop's host, the language, the path and, where the page reads it, the
 * query, so no two pages that could differ share one; it is hashed, so a long search keeps a short key.
 */
export class PageKeepPolicy {
  constructor(private readonly buildId: string) {}

  keepOf(request: KeptPageRequest): PageKeep | null {
    const lifetime = EdgeCachePolicy.sharedLifetimeOf(request);
    if (lifetime === null) return null;
    const host = request.host.trim().toLowerCase().replace(/:\d+$/, '');
    if (host === '') return null;
    const name = [
      this.buildId,
      host,
      parseLanguage(request.cookie(LANGUAGE_COOKIE)),
      request.path,
      EdgeCachePolicy.readsQuery(request.path) ? PageKeepPolicy.queryOf(request.search) : '',
    ].join('\n');
    return { key: `page:${createHash('sha256').update(name).digest('hex')}`, lifetime };
  }

  /**
   * The query as a page reads it, in one order: `?b=2&a=1` and `?a=1&b=2` are one page, and a shared link's tracking
   * words (`?fbclid=`, `?utm_source=`) are none of it, as no page reads them.
   */
  static queryOf(search: string): string {
    const kept = [...new URLSearchParams(search)].filter(([name]) => !isTracking(name));
    kept.sort(([a, x], [b, y]) => (a === b ? compare(x, y) : compare(a, b)));
    return new URLSearchParams(kept).toString();
  }
}

// Words ad networks add to a shared link; no page reads them.
const TRACKING = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'ttclid',
  'twclid',
  'igshid',
]);

function isTracking(name: string): boolean {
  return TRACKING.has(name) || name.startsWith('utm_');
}

function compare(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
