/**
 * MED-01, MED-02, MED-08, MED-10, MED-13, BND-01, BND-07: what the media Worker (`apps/media-worker`) and the server
 * agree on, in one place, so the two never drift apart: the media address's paths, signed private links, the shared
 * store the server writes and the Worker reads, and the usage data points the Worker writes and the server totals.
 */

/** MED-01: every stored object's key, and so every media path, starts with this and the shop's id. */
export const MEDIA_TENANT_PREFIX = 'tenants/';

/** BND-07, MED-08: the folder, under a shop's prefix, whose files are served only through signed links. */
export const MEDIA_PRIVATE_FOLDER = 'private';

/** BND-07: how long a signed private link works. */
export const MEDIA_LINK_TTL_SECONDS = 15 * 60;

/** BND-07: a signed link's query: when it stops working (Unix seconds), and its signature (base64url HMAC-SHA256). */
export const MEDIA_LINK_EXPIRES_PARAM = 'expires';
export const MEDIA_LINK_SIGNATURE_PARAM = 'signature';

/** BND-07: what a signed link's signature covers: its path (as requested, with its leading slash) and its expiry. */
export function mediaLinkMessage(path: string, expiresAt: number): string {
  return `${path}\n${String(expiresAt)}`;
}

/**
 * MED-10, BND-03, LIF-07: why a shop's media is refused -- its bandwidth for the cycle is used up, or its public side
 * is offline (read-only, locked, archived, suspended or deleted).
 */
export type MediaBlockReason = 'bandwidth' | 'offline';

/** MED-10: the shared store's key holding every blocked shop, as a {@link MediaBlockedList}. */
export const MEDIA_BLOCKED_KEY = 'blocked';

/** MED-10: each blocked shop's id, and why. A shop not named is served. */
export type MediaBlockedList = Record<string, MediaBlockReason>;

/** MED-13: the shared store's key holding one shop's registered website addresses, as a list of exact origins. */
export function mediaOriginsKey(tenantId: string): string {
  return `origins:${tenantId}`;
}

/** BND-03: the header a media response refused for bandwidth carries. */
export const MEDIA_QUOTA_HEADER = 'X-Quota';

/**
 * BND-01: each usage data point the Worker writes, one per response: the shop's id as the index, the bytes actually
 * sent and the request (always 1) as numbers, and whether the file was public or private and the status as text.
 * The server's totals read them by these positions.
 */
export const MEDIA_USAGE_POINT = {
  /** `index1`: the shop's id. */
  tenantIndex: 0,
  /** `double1`: the bytes the response body actually sent. */
  bytesDouble: 0,
  /** `double2`: the requests, always 1. */
  requestsDouble: 1,
  /** `blob1`: `public` or `private`. */
  accessBlob: 0,
  /** `blob2`: the response's status code. */
  statusBlob: 1,
} as const;
