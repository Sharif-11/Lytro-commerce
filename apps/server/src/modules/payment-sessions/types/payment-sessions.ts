import type {
  GatewayResult,
  PaymentMethod,
  PaymentPageReviewReason,
  PaymentPageReportReason,
  PaymentRejectReason,
  PaymentPageReportStatus,
  PaymentSessionState,
} from '@lytronix/validators';
import type { OrderPaymentLink } from '../../orders/types/orders';
import type { ShopperPaymentMethod } from '../../payment-methods/types/payment-methods';

/** PAY-01: a session just opened -- the page's address, the amount and when it runs out. */
export type OpenedPayment = OrderPaymentLink;

/** PAY-05, PAY-17: what the payment page shows of a session, beside the shop's name and logo. */
export interface PaymentPageSession {
  /** Kept on the server: the page's routes leave it out. */
  sessionId: string;
  orderNumber: string;
  amount: string;
  state: PaymentSessionState;
  expiresAt: Date;
  /** The method chosen at checkout, then the one paid by; null while the shopper is still to choose. */
  method: PaymentMethod | null;
  /** WAL-06: the methods the shopper may pay by now, each with its active account. */
  methods: ShopperPaymentMethod[];
  returnUrl: string | null;
  cancelUrl: string | null;
  /** PAY-14 (Slice 5.3): why staff rejected the payment, when they did -- the page words the reason. */
  rejected: { reason: PaymentRejectReason; note: string | null } | null;
  /** PAY-14 (Slice 5.4b): why a payment waits for staff, as far as a shopper is to know. */
  review: { reason: PaymentPageReviewReason } | null;
  /** VER-07 (Slice 5.4b): a phone of the shop's reported lately and can read this payment's wallet. */
  listenerOnline: boolean;
  /** PAY-07 (agreed 2026-11-02): how many more times the shopper may correct the ID; 0 once someone decided. */
  idChangesLeft: number;
  /** PAY-08, VER-09 (Slice 5.7): how the last try at the wallet's own checkout ended, for the page to offer another. */
  gatewayResult: GatewayResult | null;
  /** VER-11 (Slice 5.7): on a gateway's test environment. */
  test: boolean;
  /** PAY-07: what the shopper typed, once they have. */
  submitted: {
    method: PaymentMethod;
    transactionId: string;
    senderNumber: string | null;
    submittedAt: Date;
  } | null;
}

/** ORD-17 (Slice 5.2): an unverified order's open payment, for its tracking page to send the shopper back to. */
export type TrackedPayment = OrderPaymentLink & { state: PaymentSessionState };

/** TVR-02, ADM-12 (Slice 5.2b): a shopper's report as the operator's queue shows it, with the page to open. */
export interface PaymentPageReportView {
  id: string;
  shop: { id: string; name: string; slug: string; paymentPageSuspended: boolean };
  paymentUrl: string;
  reason: PaymentPageReportReason;
  note: string | null;
  ip: string | null;
  status: PaymentPageReportStatus;
  createdAt: Date;
  handledAt: Date | null;
}
