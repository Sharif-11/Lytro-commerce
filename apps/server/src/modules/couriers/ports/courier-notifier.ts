import type { CourierKey, ParcelAttention, ParcelReading } from '@lytronix/validators';

/** Slice 6.2 read: something on a parcel staff should look at; nothing has moved on its account. */
export interface ParcelAttentionNotice {
  tenantId: string;
  orderId: string;
  orderNumber: string;
  courierKey: CourierKey;
  why: ParcelAttention;
}

/** NTF-03: a parcel's news moved its order. */
export interface ParcelMovedNotice {
  tenantId: string;
  orderId: string;
  orderNumber: string;
  courierKey: CourierKey;
  reading: ParcelReading;
}

/** CRR-15, read agreed 2026-11-05: what the owner of a connection should do. */
export type ConnectionTrouble =
  // The courier refuses this login, so nothing more is asked of it until the keys change.
  | 'login_refused'
  // A check found news no message brought, on a connection whose messages had been arriving.
  | 'paste_broken'
  // Messages are arriving without a good signature, so the token needs pasting too.
  | 'token_missing';

export interface ConnectionTroubleNotice {
  tenantId: string;
  courierKey: CourierKey;
  trouble: ConnectionTrouble;
}

/**
 * CRR-25 (Slice 6.6, read agreed 2026-11-06): a courier the shop is connected to is being retired. Lytro's fixed words name the courier
 * the operator suggested and, where the shop's default moved, the courier it moved to.
 */
export interface CourierRetiringNotice {
  tenantId: string;
  courierKey: CourierKey;
  suggestedKey: CourierKey;
  defaultMovedTo: CourierKey | null;
}

/** Slice 6.6: a courier being retired is back; defaults that moved stay where they are. */
export interface CourierBackNotice {
  tenantId: string;
  courierKey: CourierKey;
}

/**
 * CRR-15, CRR-28, NTF-03, D4-10 (Phase 6 Slice 6.2): who hears about a courier's news. A stand-in until Phase 7 delivers it in-app and
 * by push, as the order and payment notices are.
 */
export interface CourierNotifier {
  parcelNeedsAttention(notice: ParcelAttentionNotice): Promise<void>;
  parcelMoved(notice: ParcelMovedNotice): Promise<void>;
  connectionTrouble(notice: ConnectionTroubleNotice): Promise<void>;
  courierRetiring(notice: CourierRetiringNotice): Promise<void>;
  courierBack(notice: CourierBackNotice): Promise<void>;
}
