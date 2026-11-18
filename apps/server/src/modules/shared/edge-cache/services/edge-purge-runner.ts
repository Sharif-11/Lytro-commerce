import { Inject, Injectable } from '@nestjs/common';
import { SECOND_MS } from '../../../../common/time';
import { type EdgeCache, MOST_PURGED_AT_ONCE } from '../ports/edge-cache';
import type { PageCache } from '../ports/page-cache';
import { EDGE_CACHE, EDGE_PURGE_TIMING, PAGE_CACHE } from '../tokens';
import type { EdgePurgeJob } from '../types/edge-purge-job';

/** How long after the newest change a purge waits: the server's own catalogue cache reads versions 2 seconds old. */
export const PURGE_SETTLE_MS = 5 * SECOND_MS;
/** Cloudflare's purge by tag takes 5 requests a minute on the Free plan: one every 12 seconds. */
export const PURGE_SPACING_MS = 12 * SECOND_MS;

/** The clock and the wait the runner keeps, apart so a test can keep them. */
export interface PurgeTiming {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const REAL_PURGE_TIMING: PurgeTiming = {
  now: () => Date.now(),
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};

/**
 * D9-32: one batch of queued purges (EdgePurgeWorker takes up to 100 jobs every 12 seconds). Waits until the newest
 * change has settled, sends each tag once, at most 100 to a request and 12 seconds apart, within Cloudflare's purge
 * rate. A refusal (its rate included) throws, so the whole batch is tried again later; purging a page twice is harmless.
 * D9-33: the storefront's own kept pages are cleared first, all at once (its Redis has no purge rate), so Cloudflare
 * can't fetch an old copy again from the storefront once its own is purged.
 */
@Injectable()
export class EdgePurgeRunner {
  constructor(
    @Inject(EDGE_CACHE) private readonly cache: Pick<EdgeCache, 'purgeTags'>,
    @Inject(PAGE_CACHE) private readonly pages: PageCache,
    @Inject(EDGE_PURGE_TIMING) private readonly timing: PurgeTiming,
  ) {}

  async run(jobs: readonly EdgePurgeJob[]): Promise<void> {
    if (jobs.length === 0) return;
    const newest = Math.max(...jobs.map((job) => job.at));
    const wait = newest + PURGE_SETTLE_MS - this.timing.now();
    if (wait > 0) await this.timing.sleep(wait);

    const tags = [...new Set(jobs.flatMap((job) => job.tags))];
    await this.pages.clearTags(tags);
    for (let start = 0; start < tags.length; start += MOST_PURGED_AT_ONCE) {
      if (start > 0) await this.timing.sleep(PURGE_SPACING_MS);
      await this.cache.purgeTags(tags.slice(start, start + MOST_PURGED_AT_ONCE));
    }
  }
}
