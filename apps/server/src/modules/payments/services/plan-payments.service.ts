import { Inject, Injectable } from '@nestjs/common';
import type { TenantPaymentFilter, TenantPaymentRow, Transaction } from '@lytronix/db';
import {
  billingPaymentStateOf,
  PAYMENT_ATTENTION_DAYS,
  PlanPaymentKind,
  PlanPaymentStatus,
  ServerFieldProblemCode,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { DAY_MS, HOUR_MS } from '../../../common/time';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import type { NewPlanPaymentValues, PlanPaymentsStore } from '../ports/plan-payments-store';
import { PLAN_PAYMENTS_STORE } from '../tokens';
import type {
  PaymentNeedingAttention,
  PlanPaymentRecord,
  TenantPaymentRecord,
} from '../types/plan-payment';

const PENDING_LIKE: readonly PlanPaymentStatus[] = [
  PlanPaymentStatus.Pending,
  PlanPaymentStatus.NeedsReview,
];

// BIL-15: an unsubmitted quote expires this long after it was first quoted.
export const PENDING_PURCHASE_EXPIRY_MS = 24 * HOUR_MS;

/** BIL-19: the stored row as the shop reads it -- its state and method folded from the status and transaction ID. */
function asTenantPayment(row: TenantPaymentRow): TenantPaymentRecord {
  const { planName, termLabelEn, termLabelBn, termMonths, invoiceId, invoiceNumber, ...payment } =
    row;
  return {
    ...payment,
    state: billingPaymentStateOf(payment.status, payment.transactionId),
    method:
      payment.transactionId !== null
        ? 'wallet'
        : payment.status === PlanPaymentStatus.Verified
          ? 'balance'
          : null,
    planName,
    billingTerm:
      termLabelEn !== null && termLabelBn !== null && termMonths !== null
        ? { labelEn: termLabelEn, labelBn: termLabelBn, months: termMonths }
        : null,
    invoice:
      invoiceId !== null && invoiceNumber !== null
        ? { id: invoiceId, number: invoiceNumber }
        : null,
  };
}

/**
 * D2-1: control.plan_payments, the stand-in confirmation row for a purchase, renewal, upgrade or top-up. This
 * service knows the generic pending -> needs_review/verified/rejected state machine and the transaction-ID
 * registry; it has no opinion on what a verified payment should *do* -- activating a plan or crediting a
 * balance is each caller's own job, done in the same transaction right after `approve`/`markVerifiedDirect`.
 */
@Injectable()
export class PlanPaymentsService {
  constructor(@Inject(PLAN_PAYMENTS_STORE) private readonly store: PlanPaymentsStore) {}

  quote(tx: Transaction, values: NewPlanPaymentValues): Promise<PlanPaymentRecord> {
    return this.store.insert(tx, values);
  }

  quoteStandalone(values: NewPlanPaymentValues): Promise<PlanPaymentRecord> {
    return this.store.run((tx) => this.quote(tx, values));
  }

  async find(id: string): Promise<PlanPaymentRecord> {
    const payment = await this.store.run((tx) => this.store.findById(tx, id));
    if (!payment) throw new ApiError('not_found', 'PlanPaymentNotFound', {});
    return payment;
  }

  findForUpdate(tx: Transaction, id: string): Promise<PlanPaymentRecord | null> {
    return this.store.findByIdForUpdate(tx, id);
  }

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.store.run(work);
  }

  /** The operator payment-queue: every submitted (transaction-ID attached), still-undecided payment. */
  listPending(kind?: PlanPaymentKind): Promise<PlanPaymentRecord[]> {
    return this.store.run((tx) => this.store.listPending(tx, kind));
  }

  /**
   * BAL-03, BIL-04: how many of the shop's payments of these kinds were submitted and are being checked by the
   * operator, and for how much in all -- Home's "being checked" rows.
   */
  beingChecked(
    tenantId: string,
    kinds: PlanPaymentKind[],
  ): Promise<{ count: number; amount: string }> {
    return this.store.run((tx) => this.store.submittedForTenant(tx, tenantId, kinds));
  }

  /** UPG-08: whether this tenant already has an undecided row of this kind, submitted or not. */
  findActiveForTenant(tenantId: string, kind: PlanPaymentKind): Promise<PlanPaymentRecord | null> {
    return this.store.run((tx) => this.store.findActiveForTenant(tx, tenantId, kind));
  }

  /** BIL-19: these shops' payments to the platform, as Billing lists them, newest first. */
  async listForTenants(
    tenantIds: string[],
    filter: TenantPaymentFilter,
  ): Promise<{ payments: TenantPaymentRecord[]; total: number }> {
    const page = await this.store.run((tx) => this.store.listForTenants(tx, tenantIds, filter));
    return { payments: page.payments.map(asTenantPayment), total: page.total };
  }

  /**
   * BIL-19: the rejected or lapsed payment Home shows -- the newest of these kinds decided within the attention
   * days, unless the shop has since started a new payment of the same kind.
   */
  async needingAttention(
    tenantId: string,
    kinds: PlanPaymentKind[],
    now = new Date(),
  ): Promise<PaymentNeedingAttention | null> {
    const since = new Date(now.getTime() - PAYMENT_ATTENTION_DAYS * DAY_MS);
    const row = await this.store.run((tx) =>
      this.store.needingAttention(tx, tenantId, kinds, since),
    );
    return row
      ? {
          id: row.id,
          kind: row.kind,
          amount: row.amount,
          state: billingPaymentStateOf(row.status, row.transactionId),
        }
      : null;
  }

  /**
   * The shared "I have paid" wallet step every kind of payment uses: verifies the payment belongs to this
   * tenant, then records the submission (BIL-02/BAL-03). Nothing activates until an operator later approves it.
   */
  async submitWalletPayment(
    paymentId: string,
    tenantId: string,
    input: { transactionId: string; senderNumber: string; amountPaid: string },
    expectedKinds: readonly PlanPaymentKind[],
    now = new Date(),
  ): Promise<PlanPaymentRecord> {
    await this.store.run(async (tx) => {
      const payment = await this.store.findByIdForUpdate(tx, paymentId);
      if (!payment || payment.tenantId !== tenantId || !expectedKinds.includes(payment.kind)) {
        throw new ApiError('not_found', 'PlanPaymentNotFound', {});
      }
      await this.recordSubmission(
        tx,
        paymentId,
        {
          transactionId: input.transactionId,
          senderNumber: input.senderNumber,
          matchesQuoted: input.amountPaid === payment.amount,
        },
        now,
      );
    });
    return this.find(paymentId);
  }

  /**
   * BIL-02/BAL-03: a wallet payment's "I have paid" step. `matchesQuoted` decides which bucket it lands in
   * (BIL-06) -- either way nothing activates until an operator later calls `approve`. Refuses a row that was
   * already submitted or has moved past `pending`/`expired`, so a tenant can't resubmit over an operator's
   * decision. BIL-15: a submission arriving after the sweep already marked the row `expired` is still
   * accepted -- but always goes to `needs_review`, regardless of amount match, never the normal `pending`
   * bucket a timely submission would land in.
   */
  async recordSubmission(
    tx: Transaction,
    id: string,
    values: { transactionId: string; senderNumber: string; matchesQuoted: boolean },
    now = new Date(),
  ): Promise<void> {
    const payment = await this.store.findByIdForUpdate(tx, id);
    if (!payment) throw new ApiError('not_found', 'PlanPaymentNotFound', {});
    const isLate = payment.status === PlanPaymentStatus.Expired;
    if (
      (payment.status !== PlanPaymentStatus.Pending && !isLate) ||
      payment.transactionId !== null
    ) {
      throw new ApiError('conflict', 'PlanPaymentNotPending', {});
    }
    try {
      await this.store.setStatus(tx, id, {
        status:
          isLate || !values.matchesQuoted
            ? PlanPaymentStatus.NeedsReview
            : PlanPaymentStatus.Pending,
        transactionId: values.transactionId,
        senderNumber: values.senderNumber,
        submittedAt: now,
      });
    } catch (error) {
      if (error instanceof UniqueViolation && error.target === 'transactionId') {
        throw new FieldsError(
          [
            {
              field: 'transactionId',
              problem: ServerFieldProblemCode.AlreadyUsed,
              messageKey: 'TransactionIdAlreadyUsed',
            },
          ],
          'conflict',
        );
      }
      throw error;
    }
  }

  /**
   * BIL-05/BIL-07: an operator's queue decision (D2-1's manual stand-in). Registers the already-submitted
   * transaction ID -- platform-wide, exactly once (BIL-07/BAL-05) -- and marks the row verified, all in the
   * caller's own `tx`; the caller does the actual plan activation/balance credit right after this returns.
   */
  async approve(
    tx: Transaction,
    id: string,
    operatorId: string,
    now: Date,
  ): Promise<PlanPaymentRecord> {
    const payment = await this.store.findByIdForUpdate(tx, id);
    if (!payment) throw new ApiError('not_found', 'PlanPaymentNotFound', {});
    if (!PENDING_LIKE.includes(payment.status)) {
      throw new ApiError('conflict', 'PlanPaymentNotPending', {});
    }
    if (!payment.transactionId) throw new ApiError('validation_error', 'TransactionIdRequired', {});
    if (await this.store.transactionIdUsed(tx, payment.transactionId)) {
      throw new ApiError('conflict', 'TransactionIdAlreadyUsed', {});
    }
    await this.store.registerTransactionId(tx, payment.transactionId, payment.tenantId);
    await this.store.setStatus(tx, id, {
      status: PlanPaymentStatus.Verified,
      verifiedBy: operatorId,
      verifiedAt: now,
    });
    return {
      ...payment,
      status: PlanPaymentStatus.Verified,
      verifiedBy: operatorId,
      verifiedAt: now,
    };
  }

  /** ADM-06: turned down, with the operator's note kept on the row so the shop can read why (BIL-19). */
  async reject(
    tx: Transaction,
    id: string,
    operatorId: string,
    now: Date,
    note: string,
  ): Promise<PlanPaymentRecord> {
    const payment = await this.store.findByIdForUpdate(tx, id);
    if (!payment) throw new ApiError('not_found', 'PlanPaymentNotFound', {});
    if (!PENDING_LIKE.includes(payment.status)) {
      throw new ApiError('conflict', 'PlanPaymentNotPending', {});
    }
    await this.store.setStatus(tx, id, {
      status: PlanPaymentStatus.Rejected,
      verifiedBy: operatorId,
      verifiedAt: now,
      note,
    });
    return {
      ...payment,
      status: PlanPaymentStatus.Rejected,
      verifiedBy: operatorId,
      verifiedAt: now,
      note,
    };
  }

  /** BIL-08: paying from balance is atomic and instant -- no transaction ID, no operator in the loop. */
  async markVerifiedDirect(tx: Transaction, id: string, now: Date): Promise<void> {
    await this.store.setStatus(tx, id, { status: PlanPaymentStatus.Verified, verifiedAt: now });
  }

  /** BIL-15: the recurring sweep's own entry point -- unsubmitted quotes older than 24h expire. */
  expireStalePending(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - PENDING_PURCHASE_EXPIRY_MS);
    return this.store.run((tx) => this.store.expireStalePending(tx, cutoff));
  }
}
