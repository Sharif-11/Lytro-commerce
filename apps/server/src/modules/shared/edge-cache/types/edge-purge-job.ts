/** D9-32: tags whose kept pages Cloudflare should drop, queued in the transaction that changed what they show. */
export interface EdgePurgeJob {
  tags: string[];
  /** When the change was queued (ms since the epoch); the purge waits a moment past it (EdgePurgeRunner). */
  at: number;
}
