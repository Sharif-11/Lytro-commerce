import type {
  BillingPaymentState,
  PaymentCancelReason,
  GatewayResult,
  PaymentMethod,
  PaymentReviewReason,
  PlanPaymentKind,
  PlanPaymentMethod,
  PlanPaymentPageFrom,
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
  /** ADM-14: marked "recorded by the platform". */
  recordedByPlatform: boolean;
  /** ADM-17, D8-15: the seller's screenshot of the payment, when they added one. */
  evidenceId: string | null;
  /** PAYMENT-PAGE-DESIGN §8: paying on the payment page, and bKash's own checkout when the way is automatic. */
  pageRef: string | null;
  pageExpiresAt: Date | null;
  pageFrom: PlanPaymentPageFrom | null;
  payMethod: PaymentMethod | null;
  idChanges: number;
  gatewayPaymentId: string | null;
  gatewayUrl: string | null;
  gatewayResult: GatewayResult | null;
  test: boolean;
  createdAt: Date;
}

/** BIL-02, BAL-03, ADM-17: what a seller's "I have paid" says; a screenshot is optional (D8-15). */
export interface WalletSubmission {
  transactionId: string;
  senderNumber: string;
  amountPaid: string;
  evidenceId?: string | null;
}

/** BIL-19: a payment as the shop reads it in Billing: its state, how it was paid, what it names, and its invoice. */
export interface TenantPaymentRecord extends PlanPaymentRecord {
  state: BillingPaymentState;
  /** 'wallet' once a transaction ID was submitted, 'balance' when paid from the balance, null before either. */
  method: PlanPaymentMethod | null;
  planName: string | null;
  billingTerm: { labelEn: string; labelBn: string; months: number } | null;
  invoice: { id: string; number: number } | null;
  /** ADM-17, D8-15: when the seller's screenshot of it was sent; null when none was. */
  evidenceSentAt: Date | null;
  /** Slice 8.8 (the owner, 2026-11-11): the screenshot's type and size, which Billing shows; no file name is kept. */
  evidenceType: string | null;
  evidenceBytes: number | null;
}

/** BIL-19: the rejected or lapsed payment the shop should act on, as Home shows it. */
export interface PaymentNeedingAttention {
  id: string;
  kind: PlanPaymentKind;
  amount: string;
  state: BillingPaymentState;
}

/** ADM-06: a payment as the operator's queue reads it, with its shop and the wallet a receipt says it arrived on. */
export type QueuedPlanPayment = PlanPaymentRecord & {
  shopName: string;
  shopSlug: string;
  wallet: PaymentMethod | null;
};
