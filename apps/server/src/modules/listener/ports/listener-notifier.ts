import type { ListenerRevokeReason } from '@lytronix/validators';

/** LSN-12: a phone revoked after too many calls from another app installation, as its owner and Lytro are told. */
export interface ListenerAutoRevokedNotice {
  /** Null for Lytro's own phone (Slice 5.6). */
  tenantId: string | null;
  deviceId: string;
  name: string;
  flags: number;
}

/** LSN-14 (Slice 5.4b): a phone sending too much, as its owner and Lytro are told. */
export interface ListenerVolumeNotice {
  /** Null for Lytro's own phone (Slice 5.6). */
  tenantId: string | null;
  deviceId: string;
  name: string;
}

/** LSN-21: a shop's phone Lytro revoked, or whose app installation it blocked, as the shop's owner is told. */
export interface ListenerLytroRevokedNotice {
  tenantId: string;
  deviceId: string;
  name: string;
  reason: ListenerRevokeReason;
}

/** VER-06 (amended 2026-11-02): today's unreadable messages passed the mark, as Lytro is told. */
export interface ListenerUnreadNotice {
  day: string;
  total: number;
}

/**
 * LSN-12 (Phase 5 Slice 5.4a): tells the shop's owner and Lytro's operators of a phone revoked on its own. Phase 7
 * delivers it in-app and by push (NTF-01, NTF-03).
 */
export interface ListenerNotifier {
  deviceAutoRevoked(notice: ListenerAutoRevokedNotice): Promise<void>;
  /** LSN-21 (found missing at the Phase 5 close-out). */
  deviceRevokedByLytro(notice: ListenerLytroRevokedNotice): Promise<void>;
  volumeFlagged(notice: ListenerVolumeNotice): Promise<void>;
  unreadMessages(notice: ListenerUnreadNotice): Promise<void>;
}
