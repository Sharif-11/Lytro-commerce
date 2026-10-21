import type { MediaKind, MediaPurpose } from '@lytronix/validators';

/** STO-09, D3-5: an item the shop sent was refused after it left the upload screen, and why. */
export interface MediaFailureNotice {
  tenantId: string;
  mediaId: string;
  kind: MediaKind;
  purpose: MediaPurpose;
  failure: string;
}

/**
 * STO-09, D3-5: tells the shop its media was refused -- a video that would not compress, or anything the nightly run
 * found stuck. Phase 7's notification module delivers it in the app and by push; until then a console stand-in.
 */
export interface MediaNotifier {
  mediaFailed(notice: MediaFailureNotice): Promise<void>;
}
