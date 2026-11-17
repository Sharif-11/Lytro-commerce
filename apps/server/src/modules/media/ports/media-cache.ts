/** D9-31: Cloudflare could not be reached, or refused or delayed the purge (its purge rate included); tried again. */
export class CacheUnavailable extends Error {
  constructor(detail: string) {
    super(`media cache unavailable: ${detail}`);
    this.name = 'CacheUnavailable';
  }
}

/**
 * D9-31, LIF-19: the copies of public media Cloudflare keeps in front of the media bucket. Files are kept a year under
 * names that change with their content (MED-08), so a file is only ever dropped when a whole shop's are deleted.
 */
export interface MediaCache {
  /** Drops every kept copy under a folder of the media address, such as a lapsed shop's `tenants/<shop>/`. */
  purgeFolder(prefix: string): Promise<void>;
}
