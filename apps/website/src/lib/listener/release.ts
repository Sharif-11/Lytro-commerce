// The listener app's current release, as `latest.json` beside the file on the downloads bucket says (SITE-PAGES-DESIGN §6). The
// release command writes it (apps/listener-android, `listenerRelease`), and the owner uploads the two together.

export interface ListenerRelease {
  version: string;
  /** Where the file is: always on the bucket, whatever the JSON holds, so nothing there can send a shop elsewhere. */
  url: string;
  sha256: string;
  bytes: number;
}

// "1.2.3", or with one tag, as staging's copy is "1.0.0-staging" (its downloads bucket serves staging.lytro.app/listener).
const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z]+)?$/;
const SHA256 = /^[0-9a-f]{64}$/;
const FILE = /^[A-Za-z0-9._-]+\.apk$/;
const MEGABYTE = 1024 * 1024;

// How long a page keeps the answer before asking again, so a new release shows within minutes without a redeploy.
const REVALIDATE_SECONDS = 300;

/** A release from the file's contents, or null for anything that doesn't read as one. */
export function releaseOf(body: unknown, base: string): ListenerRelease | null {
  if (typeof body !== 'object' || body === null) return null;
  const { version, file, sha256, bytes } = body as Record<string, unknown>;
  if (typeof version !== 'string' || !VERSION.test(version)) return null;
  if (typeof file !== 'string' || !FILE.test(file)) return null;
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) return null;
  if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes <= 0) return null;
  return { version, url: `${base}/${file}`, sha256, bytes };
}

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
      return releaseOf(await response.json(), this.base);
    } catch {
      return null;
    }
  }
}
