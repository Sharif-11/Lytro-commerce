import type {
  ListenerDeviceStatus,
  ListenerMessageStatus,
  ListenerRevokeReason,
  PaymentListStatus,
  PaymentMethod,
  PaymentRejectReason,
  PaymentReviewReason,
  PaymentSessionSource,
  VerificationLevel,
} from '@lytronix/validators';
import type { OrderPerson } from './orders';

/** Mirrors `PaymentListItem` (GET /payments, PAY-19): one payment as the shop's list shows it. */
export interface ShopPayment {
  id: string;
  /** `session`: a transaction ID typed on the page, to verify or rejected; `payment`: money in on the order. */
  kind: 'session' | 'payment';
  status: PaymentListStatus;
  order: { id: string; orderNumber: string };
  method: PaymentMethod;
  amount: string;
  senderNumber: string | null;
  transactionId: string | null;
  at: string;
  /** Typed at checkout or through a staff link; null for money staff recorded or collected. */
  source: PaymentSessionSource | null;
  verificationLevel: VerificationLevel | null;
  decidedBy: OrderPerson | null;
  decidedAt: string | null;
  rejectReason: PaymentRejectReason | null;
  note: string | null;
  /** VER-11: from a gateway's test environment; left out of the totals. */
  test: boolean;
  /** Why a receipt sent it to staff. */
  reviewReason: PaymentReviewReason | null;
  /** What the receipt that claims it says arrived. */
  receipt: { amount: string; senderNumber: string | null; receivedAt: string } | null;
}

export interface ShopPaymentsPage {
  payments: ShopPayment[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  /** How much the filter holds, test payments left out. */
  amount: string;
}

/** Mirrors GET /listener/receipts: what a phone read, without what verified nothing. */
export interface PhoneReceipt {
  id: string;
  sender: string;
  method: PaymentMethod | null;
  amount: string | null;
  transactionId: string | null;
  status: ListenerMessageStatus;
  orderNumber: string | null;
  receivedAt: string;
  senderNumber: string | null;
  deviceId: string | null;
  /** Null once redacted, after 90 days (LSN-17). */
  text: string | null;
}

export interface PhoneReceiptsPage {
  receipts: PhoneReceipt[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** Mirrors GET /listener/devices (LSN-02, LSN-20). */
export interface ListenerPhone {
  id: string;
  name: string;
  model: string | null;
  appVersion: string | null;
  pairedAt: string;
  lastSeenAt: string | null;
  /** Seen within the offline window, 30 minutes (LSN-03). */
  online: boolean;
  status: ListenerDeviceStatus;
  revokedAt: string | null;
  revokeReason: ListenerRevokeReason | null;
  flags: number;
  uploadsToday: number;
}

export interface ListenerPhones {
  devices: ListenerPhone[];
  active: number;
  /** The plan's phones; null for none. */
  limit: number | null;
}

/** POST /listener/pairing-codes: shown once, open 10 minutes (LSN-01). */
export interface PairingCode {
  code: string;
  expiresAt: string;
}

/** POST /orders/:id/payment-link (PAY-24). */
export interface PaymentLink {
  paymentUrl: string;
  amount: string;
  expiresAt: string;
}
