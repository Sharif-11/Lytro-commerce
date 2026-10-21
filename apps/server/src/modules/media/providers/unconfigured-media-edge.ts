import type { MediaEdge, MediaUsageTotal } from '../ports/media-edge';

/**
 * D3-4: the media Worker's side while Cloudflare is not set up (CLOUDFLARE_API_TOKEN unset): the Worker recorded
 * nothing, and there is no shared store to write, so bandwidth is neither counted nor enforced.
 */
export class UnconfiguredMediaEdge implements MediaEdge {
  usageByMinute(): Promise<MediaUsageTotal[]> {
    return Promise.resolve([]);
  }

  write(): Promise<void> {
    return Promise.resolve();
  }
}
