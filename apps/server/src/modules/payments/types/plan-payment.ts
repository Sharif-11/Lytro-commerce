import type {
  BillingPaymentState,
  PaymentCancelReason,
  PaymentReviewReason,
  PlanPaymentKind,
  PlanPaymentMethod,
  PlanPaymentStatus,
} from '@lytronix/validators';

export interface PlanPaymentRecord {
  id: string;
  tenantId: string;
  kind: PlanPaymentKind;
  planId: string | null;
  billingTermId: string | null;
  amount: string;
  creditAmount: string;
  quotedAt: Date;
  status: PlanPaymentStatus;
  senderNumber: string | null;
  transactionId: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  /** BIL-19: when the shop submitted its transaction ID; null until it does. */
  submittedAt: Date | null;
  /** ADM-06, BIL-19: the operator's note on a rejection; null otherwise. */
  note: string | null;
  /** BIL-19: on a cancelled request, who closed it -- the shop, or its newer request of the same kind. */
  cancelReason: PaymentCancelReason | null;
  /** BIL-06 (Slice 5.6): what the seller says they sent; what a receipt or the operator says arrived; why it waits. */
  amountSent: string | null;
  amountArrived: string | null;
  reviewReason: PaymentReviewReason | null;
  createdAt: Date;
}

/** BIL-19: a payment as the shop reads it in Billing: its state, how it was paid, what it names, and its invoice. */
export interface TenantPaymentRecord extends PlanPaymentRecord {
  state: BillingPaymentState;
  /** 'wallet' once a transaction ID was submitted, 'balance' when paid from the balance, null before either. */
  method: PlanPaymentMethod | null;
  planName: string | null;
  billingTerm: { labelEn: string; labelBn: string; months: number } | null;
  invoice: { id: string; number: number } | null;
}

/** BIL-19: the rejected or lapsed payment the shop should act on, as Home shows it. */
export interface PaymentNeedingAttention {
  id: string;
  kind: PlanPaymentKind;
  amount: string;
  state: BillingPaymentState;
}
