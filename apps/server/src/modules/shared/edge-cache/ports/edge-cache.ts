/** D9-31, D9-32: Cloudflare could not be reached, or refused or delayed the purge (its purge rate included); tried again. */
export class CacheUnavailable extends Error {
  constructor(detail: string) {
    super(`edge cache unavailable: ${detail}`);
    this.name = 'CacheUnavailable';
  }
}

/** D9-32: Cloudflare takes at most this many tags, or prefixes, in one purge on every plan. */
export const MOST_PURGED_AT_ONCE = 100;

/**
 * D9-31, D9-32, LIF-19: the copies Cloudflare keeps in front of Lytro -- public media, and shops' pages. Media files are
 * kept a year under names that change with their content (MED-08), so they are only dropped when a whole shop's are
 * deleted; a shop's pages are dropped by the tags they were kept under when what they show changes.
 */
export interface EdgeCache {
  /** Drops every kept copy under a folder of the media address, such as a lapsed shop's `tenants/<shop>/`. */
  purgeFolder(prefix: string): Promise<void>;
  /** Drops every kept page carrying any of these tags (at most MOST_PURGED_AT_ONCE). */
  purgeTags(tags: readonly string[]): Promise<void>;
}
