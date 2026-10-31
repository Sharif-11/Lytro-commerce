import type {
  PaymentMethod,
  PaymentPageReportReason,
  PaymentPageReportStatus,
  PaymentSessionState,
} from '@lytronix/validators';
import type { OrderPaymentLink } from '../../orders/types/orders';
import type { ShopperPaymentMethod } from '../../payment-methods/types/payment-methods';

/** PAY-01: a session just opened -- the page's address, the amount and when it runs out. */
export type OpenedPayment = OrderPaymentLink;

/** PAY-05, PAY-17: what the payment page shows of a session, beside the shop's name and logo. */
export interface PaymentPageSession {
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
