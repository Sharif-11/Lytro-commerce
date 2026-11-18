/**
 * D9-33: the storefront's own copies of drawn shop pages, in the page cache's Redis, kept under the same tags as
 * Cloudflare's (D9-32) and dropped by them first, so Cloudflare never fetches an old copy again from the storefront.
 * Never throws: a copy a clearing missed lasts at most its lifetime, and Cloudflare's purge still goes out.
 */
export interface PageCache {
  clearTags(tags: readonly string[]): Promise<void>;
}
