import type { MediaBlockedList } from '@lytronix/shared-types';

/** BND-01: one shop's usage the media Worker recorded in one minute. */
export interface MediaUsageTotal {
  tenantId: string;
  /** The minute's start. */
  minute: Date;
  bytes: number;
  requests: number;
}

/** MED-13: one shop's full list of website addresses. */
export interface ShopOrigins {
  tenantId: string;
  origins: readonly string[];
}

/** MED-10, MED-13: what changed in the shared store since it was last written; each value is written whole. */
export interface EdgeStoreChanges {
  /** Every blocked shop, when the list changed. */
  blocked?: MediaBlockedList;
  /** The shops whose website addresses changed. */
  origins: readonly ShopOrigins[];
}

/** MED-10, BND-02: Cloudflare could not be reached, or would not answer. The minute's work is tried again next minute. */
export class EdgeUnavailable extends Error {
  constructor(detail: string) {
    super(`media edge unavailable: ${detail}`);
    this.name = 'EdgeUnavailable';
  }
}

/**
 * MED-10, MED-13, BND-01, D3-4: the server's side of the media Worker -- the usage it recorded, and the shared store
 * the server writes for it to read: which shops are blocked, and each shop's website addresses. Cloudflare on real
 * servers; without it, nothing is counted and nothing written.
 */
export interface MediaEdge {
  /** BND-01: every shop's usage the Worker recorded from `from` up to, not including, `to`, minute by minute. */
  usageByMinute(from: Date, to: Date): Promise<MediaUsageTotal[]>;
  /** MED-10, MED-13: writes the changes in as few calls as the store allows; all of them, or it throws. */
  write(changes: EdgeStoreChanges): Promise<void>;
}
