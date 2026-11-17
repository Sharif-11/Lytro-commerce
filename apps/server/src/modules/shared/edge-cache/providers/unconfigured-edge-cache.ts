import type { EdgeCache } from '../ports/edge-cache';

/** D9-31, D9-32: no Cloudflare in front of Lytro (development, tests): nothing is kept, so nothing needs dropping. */
export class UnconfiguredEdgeCache implements EdgeCache {
  purgeFolder(): Promise<void> {
    return Promise.resolve();
  }

  purgeTags(): Promise<void> {
    return Promise.resolve();
  }
}
