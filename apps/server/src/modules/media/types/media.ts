import type {
  InsertMediaReconciliation,
  MediaOutcome,
  MediaUses,
  NewMedia,
  NewMediaObject,
  ProductImageRow,
  SelectMedia,
  SelectMediaObject,
} from '@lytronix/db';
import type { MediaKind, MediaPurpose, MediaStatus, PackAutoBuyState } from '@lytronix/validators';
import type { CyclePacks } from '../../../common/usage-warnings';
import type { MediaUrls } from '../../../common/media-links';

// The stored rows, as aliases of the shared types (ENGINEERING-STANDARDS §4), never copies.
export type MediaRecord = SelectMedia;
export type MediaObjectRecord = SelectMediaObject;
/** MED-04: what one night's comparison found for a shop whose rows and R2 differ. */
export type MediaReconciliation = Omit<InsertMediaReconciliation, 'id' | 'createdAt'>;
export type { MediaOutcome, MediaUses, NewMedia, NewMediaObject, ProductImageRow };

/** MED-03, MED-09: one item as the shop sees it. */
export interface MediaView {
  id: string;
  kind: MediaKind;
  status: MediaStatus;
  purpose: MediaPurpose;
  width: number | null;
  height: number | null;
  /** STO-09: a video's length, once ready. */
  durationMs: number | null;
  /** STO-01: the bytes it stores, every file of it; 0 until it is ready. */
  bytes: number;
  /** Present once it is ready: the file, and its thumbnail (an image) or poster (a video). */
  urls: MediaUrls | null;
  /**
   * Why it was refused, once refused: not_supported, too_large, unreadable, not_uploaded, storage_full, or
   * processing_failed when the nightly run found it stuck.
   */
  failure: string | null;
  createdAt: Date;
}

/** MED-09: one item, with where it is attached, so deleting it can say what it leaves. */
export interface MediaDetail extends MediaView {
  /** Where it shows, and (ORD-46, MED-09) how many past orders' items show it. */
  uses: MediaUses;
}

/** MED-03: an upload started -- the item, and where the browser sends its file. */
export interface UploadStarted {
  media: MediaView;
  upload: { url: string; method: 'PUT'; headers: Record<string, string>; expiresAt: Date };
}

export interface MediaPage {
  media: MediaView[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/**
 * STO-01, STO-02: the shop's storage, now. A null limit is unlimited (PLN-19). With the largest file of each kind
 * (STO-04, STO-05), which the operator may change, for the line under the upload.
 */
export interface StorageUsage {
  usedBytes: number;
  limitBytes: number | null;
  imageMaxMb: number;
  videoMaxMb: number;
}

/** BND-08: one Asia/Dhaka calendar day of the cycle's bandwidth. */
export interface BandwidthDay {
  day: string;
  bytes: number;
  requests: number;
}

/**
 * BND-01, BND-06, BND-08: the shop's media bandwidth this cycle -- the bytes sent and the requests answered -- its
 * limit (null is unlimited, PLN-19), and its days, which total the cycle.
 */
export interface BandwidthUsage {
  cycleStart: Date;
  usedBytes: number;
  requests: number;
  /** BND-04: the cycle's allowance -- the shop's own limit, then its packs; null is unlimited. */
  limitBytes: number | null;
  /** The shop's own limit, without packs; the grace is a share of it (BND-03). */
  ownLimitBytes: number | null;
  packs: CyclePacks;
  /** BND-04: what is left of the shop's bandwidth packs, carried on until used. */
  packLeftBytes: number;
  /** PLN-15: auto-buy of bandwidth packs, and how it stands this cycle. */
  autoBuy: boolean;
  autoPacks: number;
  autoBuyState: PackAutoBuyState | null;
  days: BandwidthDay[];
}
