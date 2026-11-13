// The listener app's current release, as `latest.json` beside the file on the downloads host says (SITE-PAGES-DESIGN
// §6). The release command writes it (apps/listener-android, `listenerRelease`), and the owner uploads the two together.
// The website's /listener page and the server's GET /listener/app (TENANT-DASHBOARD-DESIGN §7.44) both read it through
// this one check, so they never disagree about what a release is -- in `common`, which needs no zod.

/** Where the file and `latest.json` live when no setting says otherwise (`LISTENER_DOWNLOAD_URL`). */
export const LISTENER_DOWNLOAD_DEFAULT_URL = 'https://download.lytro.app';

export interface ListenerRelease {
  version: string;
  /** Where the file is: always on the host, whatever the JSON holds, so nothing there can send a shop elsewhere. */
  url: string;
  sha256: string;
  bytes: number;
}

/** §7.44: the release as the dashboard shows it -- its version and size, and the file's link for the button and QR. */
export type ListenerAppView = Pick<ListenerRelease, 'version' | 'url' | 'bytes'>;

/** GET /listener/app's answer: null when there's no release to offer (none uploaded, or the host can't be read). */
export interface ListenerAppRead {
  release: ListenerAppView | null;
}

// "1.2.3", or with one tag, as staging's copy is "1.0.0-staging" (its downloads host serves staging.lytro.app/listener).
const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z]+)?$/;
const SHA256 = /^[0-9a-f]{64}$/;
const FILE = /^[A-Za-z0-9._-]+\.apk$/;

/** A release from `latest.json`'s contents on the host at `base`, or null for anything that doesn't read as one. */
export function listenerReleaseOf(body: unknown, base: string): ListenerRelease | null {
  if (typeof body !== 'object' || body === null) return null;
  const { version, file, sha256, bytes } = body as Record<string, unknown>;
  if (typeof version !== 'string' || !VERSION.test(version)) return null;
  if (typeof file !== 'string' || !FILE.test(file)) return null;
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) return null;
  if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes <= 0) return null;
  return { version, url: `${base.replace(/\/+$/, '')}/${file}`, sha256, bytes };
}
