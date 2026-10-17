import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { PlanPaymentKind, PlanPaymentStatus } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { HOUR_MS } from '../../../common/time';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import type { NewPlanPaymentValues, PlanPaymentsStore } from '../ports/plan-payments-store';
import { PLAN_PAYMENTS_STORE } from '../tokens';
import type { PlanPaymentRecord } from '../types/plan-payment';

const PENDING_LIKE: readonly PlanPaymentStatus[] = [
  PlanPaymentStatus.Pending,
  PlanPaymentStatus.NeedsReview,
];

// BIL-15: an unsubmitted quote expires this long after it was first quoted.
export const PENDING_PURCHASE_EXPIRY_MS = 24 * HOUR_MS;

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

  /** UPG-08: whether this tenant already has an undecided row of this kind, submitted or not. */
  findActiveForTenant(tenantId: string, kind: PlanPaymentKind): Promise<PlanPaymentRecord | null> {
    return this.store.run((tx) => this.store.findActiveForTenant(tx, tenantId, kind));
  }

  /**
   * The shared "I have paid" wallet step every kind of payment uses: verifies the payment belongs to this
   * tenant, then records the submission (BIL-02/BAL-03). Nothing activates until an operator later approves it.
   */
  async submitWalletPayment(
    paymentId: string,
    tenantId: string,
    input: { transactionId: string; senderNumber: string; amountPaid: string },
    expectedKind?: PlanPaymentKind,
  ): Promise<PlanPaymentRecord> {
    await this.store.run(async (tx) => {
      const payment = await this.store.findByIdForUpdate(tx, paymentId);
      if (
        !payment ||
        payment.tenantId !== tenantId ||
        (expectedKind !== undefined && payment.kind !== expectedKind)
      ) {
        throw new ApiError('not_found', 'PlanPaymentNotFound', {});
      }
      await this.recordSubmission(tx, paymentId, {
        transactionId: input.transactionId,
        senderNumber: input.senderNumber,
        matchesQuoted: input.amountPaid === payment.amount,
      });
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
      });
    } catch (error) {
      if (error instanceof UniqueViolation && error.target === 'transactionId') {
        throw new ApiError('conflict', 'TransactionIdAlreadyUsed', {});
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

  async reject(
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
    await this.store.setStatus(tx, id, {
      status: PlanPaymentStatus.Rejected,
      verifiedBy: operatorId,
      verifiedAt: now,
    });
    return {
      ...payment,
      status: PlanPaymentStatus.Rejected,
      verifiedBy: operatorId,
      verifiedAt: now,
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
