import type {
  PaymentNeedingAttentionRow,
  TenantPaymentFilter,
  TenantPaymentRow,
  Transaction,
} from '@lytronix/db';
import type {
  GatewayResult,
  PaymentMethod,
  PaymentReviewReason,
  PaymentCancelReason,
  PlanPaymentKind,
  PlanPaymentPageFrom,
  PlanPaymentStatus,
} from '@lytronix/validators';
import type { PlanPaymentRecord, QueuedPlanPayment } from '../types/plan-payment';

export interface NewPlanPaymentValues {
  tenantId: string;
  kind: PlanPaymentKind;
  planId: string | null;
  billingTermId: string | null;
  amount: string;
  creditAmount: string;
}

/** PAYMENT-PAGE-DESIGN §8: what paying on the page changes on the row. */
export interface PlanPaymentPageValues {
  pageRef?: string;
  pageExpiresAt?: Date;
  pageFrom?: PlanPaymentPageFrom;
  payMethod?: PaymentMethod | null;
  gatewayPaymentId?: string | null;
  gatewayUrl?: string | null;
  gatewayResult?: GatewayResult | null;
  test?: boolean;
}

export interface PlanPaymentStatusValues {
  status: PlanPaymentStatus;
  senderNumber?: string | null;
  transactionId?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: Date | null;
  submittedAt?: Date | null;
  note?: string | null;
  cancelReason?: PaymentCancelReason | null;
  amountSent?: string | null;
  amountArrived?: string | null;
  reviewReason?: PaymentReviewReason | null;
}

/** control.plan_payments / control.used_transaction_ids (D2-1, BIL-04 to BIL-07, BAL-03 to BAL-05). */
export interface PlanPaymentsStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** Throws `UniqueViolation('openUpgrade')` when the shop already has an open upgrade (UPG-08). */
  insert(tx: Transaction, values: NewPlanPaymentValues): Promise<PlanPaymentRecord>;
  findById(tx: Transaction, id: string): Promise<PlanPaymentRecord | null>;
  /** Locks the row for the rest of the transaction -- a confirm/reject reads-then-writes it atomically. */
  findByIdForUpdate(tx: Transaction, id: string): Promise<PlanPaymentRecord | null>;
  listPending(
    tx: Transaction,
    kind?: PlanPaymentKind,
    tenantId?: string,
  ): Promise<QueuedPlanPayment[]>;
  /** UPG-08: a submitted row of this kind for this tenant still waiting for the operator. */
  findSubmittedOpen(
    tx: Transaction,
    tenantId: string,
    kind: PlanPaymentKind,
  ): Promise<PlanPaymentRecord | null>;
  /** BIL-19: closes the open, unsubmitted requests of these kinds (just `id`, when given); the ids it closed. */
  closeOpen(
    tx: Transaction,
    tenantId: string,
    kinds: PlanPaymentKind[],
    reason: PaymentCancelReason,
    now: Date,
    id?: string,
  ): Promise<string[]>;
  /** BAL-03, BIL-04: one shop's submitted payments of these kinds still waiting for a decision. */
  submittedForTenant(
    tx: Transaction,
    tenantId: string,
    kinds: PlanPaymentKind[],
  ): Promise<{ count: number; amount: string }>;
  /** BIL-19: these shops' payments, newest first, with names and invoice; `total` counts the whole filter. */
  listForTenants(
    tx: Transaction,
    tenantIds: string[],
    filter: TenantPaymentFilter,
  ): Promise<{ payments: TenantPaymentRow[]; total: number }>;
  /** BIL-19: the newest rejected or lapsed payment of these kinds since `since` that was not paid again. */
  needingAttention(
    tx: Transaction,
    tenantId: string,
    kinds: PlanPaymentKind[],
    since: Date,
  ): Promise<PaymentNeedingAttentionRow | null>;
  setStatus(tx: Transaction, id: string, values: PlanPaymentStatusValues): Promise<void>;
  /** ADM-06 (Slice 5.6): a receipt from Lytro's own phone holding this ID is used by this payment. */
  markReceiptUsed(tx: Transaction, transactionId: string, paymentId: string): Promise<void>;
  /** ADM-06 (Slice 5.6): a receipt that claimed this payment is unclaimed again. */
  releaseReceipt(tx: Transaction, paymentId: string): Promise<void>;
  /** VER-02 (Slice 5.6): the payment a receipt with this ID settles, held; null when no seller typed it. */
  lockTyped(tx: Transaction, transactionId: string): Promise<PlanPaymentRecord | null>;
  findByPageRef(tx: Transaction, ref: string): Promise<PlanPaymentRecord | null>;
  lockByPageRef(tx: Transaction, ref: string): Promise<PlanPaymentRecord | null>;
  pageLabelOf(
    tx: Transaction,
    id: string,
  ): Promise<{ planName: string | null; termEn: string | null; termBn: string | null } | null>;
  setPage(tx: Transaction, id: string, values: PlanPaymentPageValues): Promise<void>;
  /** PAY-07: throws `UniqueViolation('transactionId')` when another open payment holds the ID. */
  changeTyped(
    tx: Transaction,
    id: string,
    values: { transactionId: string; senderNumber: string | null; submittedAt: Date },
  ): Promise<void>;
  /** VER-09: bKash checkouts past their window that never came back. */
  gatewayDue(tx: Transaction, now: Date): Promise<PlanPaymentRecord[]>;
  /** BIL-06 (Slice 5.6): the row becomes the top-up its money now is. */
  creditInstead(
    tx: Transaction,
    id: string,
    values: { kind: PlanPaymentKind; amount: string; verifiedBy: string; verifiedAt: Date },
  ): Promise<void>;
  /** BIL-07/BAL-05: true if this transaction ID has ever been used, by any tenant, including deleted ones. */
  transactionIdUsed(tx: Transaction, transactionId: string): Promise<boolean>;
  /** Registers the ID, in the same `tx` as the status change that uses it -- the real platform-wide guard. */
  registerTransactionId(tx: Transaction, transactionId: string, tenantId: string): Promise<void>;
  /** BIL-15: unsubmitted `pending` rows past `cutoff` (their own `quotedAt` + 24h) expire. Returns the count. */
  expireStalePending(tx: Transaction, cutoff: Date): Promise<number>;
}
