// The listener app's current release, as `latest.json` beside the file on the downloads bucket says (SITE-PAGES-DESIGN §6). What
// counts as a release is the one check the server's GET /listener/app shares (@lytronix/validators, `listenerReleaseOf`).
import { listenerReleaseOf, type ListenerRelease } from '@lytronix/validators/common';

export type { ListenerRelease };

const MEGABYTE = 1024 * 1024;

// How long a page keeps the answer before asking again, so a new release shows within minutes without a redeploy.
const REVALIDATE_SECONDS = 300;

/** The size as the page says it: `9 MB`, never less than 1. */
export function sizeInMegabytes(bytes: number): number {
  return Math.max(1, Math.round(bytes / MEGABYTE));
}

/**
 * Reads the current release. No file yet, or one that can't be read, is null: the page then says the app isn't ready, rather than
 * offer a link that may not work.
 */
export class ListenerReleases {
  constructor(
    private readonly base: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async latest(): Promise<ListenerRelease | null> {
    try {
      const response = await this.fetcher(`${this.base}/latest.json`, {
        next: { revalidate: REVALIDATE_SECONDS },
      });
      if (!response.ok) return null;
      return listenerReleaseOf(await response.json(), this.base);
    } catch {
      return null;
    }
  }
}
