/** LSN-12: a phone revoked after too many calls from another app installation, as its owner and Lytro are told. */
export interface ListenerAutoRevokedNotice {
  tenantId: string;
  deviceId: string;
  name: string;
  flags: number;
}

/** LSN-14 (Slice 5.4b): a phone sending too much, as its owner and Lytro are told. */
export interface ListenerVolumeNotice {
  tenantId: string;
  deviceId: string;
  name: string;
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
  volumeFlagged(notice: ListenerVolumeNotice): Promise<void>;
  unreadMessages(notice: ListenerUnreadNotice): Promise<void>;
}
