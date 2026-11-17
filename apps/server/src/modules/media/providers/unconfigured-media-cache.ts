import type { MediaCache } from '../ports/media-cache';

/** D9-31: no Cloudflare in front of the media (development, tests): nothing is kept, so nothing needs dropping. */
export class UnconfiguredMediaCache implements MediaCache {
  purgeFolder(): Promise<void> {
    return Promise.resolve();
  }
}
