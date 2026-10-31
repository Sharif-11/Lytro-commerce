import type {
  PaymentListStatus,
  PaymentMethod,
  PaymentRejectReason,
  PaymentSessionSource,
  VerificationLevel,
} from '@lytronix/validators';
import type { OrderPerson } from '../../orders/types/orders';

/** PAY-19: one payment as the shop's list shows it. */
export interface PaymentListItem {
  id: string;
  /** `session`: a transaction ID typed on the page, to verify or rejected; `payment`: money in on the order. */
  kind: 'session' | 'payment';
  status: PaymentListStatus;
  order: { id: string; orderNumber: string };
  method: PaymentMethod;
  amount: string;
  senderNumber: string | null;
  transactionId: string | null;
  at: Date;
  /** Typed at checkout or through a staff link; null for money staff recorded or collected. */
  source: PaymentSessionSource | null;
  verificationLevel: VerificationLevel | null;
  decidedBy: OrderPerson | null;
  decidedAt: Date | null;
  rejectReason: PaymentRejectReason | null;
  note: string | null;
}

/** PAY-19: a page of the list, and how many payments and how much money the filter holds. */
export interface PaymentPage {
  payments: PaymentListItem[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  amount: string;
}
