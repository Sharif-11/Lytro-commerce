import type {
  PaymentNeedingAttentionRow,
  TenantPaymentFilter,
  TenantPaymentRow,
  Transaction,
} from '@lytronix/db';
import type { PlanPaymentKind, PlanPaymentStatus } from '@lytronix/validators';
import type { PlanPaymentRecord } from '../types/plan-payment';

export interface NewPlanPaymentValues {
  tenantId: string;
  kind: PlanPaymentKind;
  planId: string | null;
  billingTermId: string | null;
  amount: string;
  creditAmount: string;
}

export interface PlanPaymentStatusValues {
  status: PlanPaymentStatus;
  senderNumber?: string | null;
  transactionId?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: Date | null;
  submittedAt?: Date | null;
  note?: string | null;
}

/** control.plan_payments / control.used_transaction_ids (D2-1, BIL-04 to BIL-07, BAL-03 to BAL-05). */
export interface PlanPaymentsStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  insert(tx: Transaction, values: NewPlanPaymentValues): Promise<PlanPaymentRecord>;
  findById(tx: Transaction, id: string): Promise<PlanPaymentRecord | null>;
  /** Locks the row for the rest of the transaction -- a confirm/reject reads-then-writes it atomically. */
  findByIdForUpdate(tx: Transaction, id: string): Promise<PlanPaymentRecord | null>;
  listPending(tx: Transaction, kind?: PlanPaymentKind): Promise<PlanPaymentRecord[]>;
  /** UPG-08: any not-yet-decided row of this kind for this tenant, submitted or not. */
  findActiveForTenant(
    tx: Transaction,
    tenantId: string,
    kind: PlanPaymentKind,
  ): Promise<PlanPaymentRecord | null>;
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
  /** BIL-07/BAL-05: true if this transaction ID has ever been used, by any tenant, including deleted ones. */
  transactionIdUsed(tx: Transaction, transactionId: string): Promise<boolean>;
  /** Registers the ID, in the same `tx` as the status change that uses it -- the real platform-wide guard. */
  registerTransactionId(tx: Transaction, transactionId: string, tenantId: string): Promise<void>;
  /** BIL-15: unsubmitted `pending` rows past `cutoff` (their own `quotedAt` + 24h) expire. Returns the count. */
  expireStalePending(tx: Transaction, cutoff: Date): Promise<number>;
}
