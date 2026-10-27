import type { MediaKind, MediaPurpose, MediaStatus } from '@lytronix/validators';

/** Mirrors `MediaView` in apps/server/src/modules/media/types/media.ts (MED-03, MED-09): one item as the shop sees it. */
export interface MediaView {
  id: string;
  kind: MediaKind;
  status: MediaStatus;
  purpose: MediaPurpose;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  bytes: number;
  urls: { main: string; thumbnail: string } | null;
  /** Why it was refused, once refused: not_supported, too_large, unreadable, not_uploaded, storage_full. */
  failure: string | null;
  createdAt: string;
}

/** Mirrors `UploadStarted`: the item, and where the browser sends its file. */
export interface UploadStarted {
  media: MediaView;
  upload: { url: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string };
}
