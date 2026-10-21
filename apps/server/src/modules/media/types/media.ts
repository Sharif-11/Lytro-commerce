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
import type { MediaKind, MediaPurpose, MediaStatus } from '@lytronix/validators';
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
  uses: MediaUses & {
    /** ORD-46: past orders whose line shows this photo; orders arrive in Phase 4. */
    pastOrders: number;
  };
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

/** STO-01, STO-02: the shop's storage, now. A null limit is unlimited (PLN-19). */
export interface StorageUsage {
  usedBytes: number;
  limitBytes: number | null;
}
