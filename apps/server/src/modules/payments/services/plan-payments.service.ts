import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { PlanPaymentKind, PlanPaymentStatus } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import type { NewPlanPaymentValues, PlanPaymentsStore } from '../ports/plan-payments-store';
import { PLAN_PAYMENTS_STORE } from '../tokens';
import type { PlanPaymentRecord } from '../types/plan-payment';

const PENDING_LIKE: readonly PlanPaymentStatus[] = [
  PlanPaymentStatus.Pending,
  PlanPaymentStatus.NeedsReview,
];

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
   * BIL-02/BAL-03: a wallet payment's "I have paid" step. `matchesQuoted` decides which bucket it lands in
   * (BIL-06) -- either way nothing activates until an operator later calls `approve`. Refuses a row that was
   * already submitted or isn't pending, so a tenant can't resubmit over an operator's decision.
   */
  async recordSubmission(
    tx: Transaction,
    id: string,
    values: { transactionId: string; senderNumber: string; matchesQuoted: boolean },
  ): Promise<void> {
    const payment = await this.store.findByIdForUpdate(tx, id);
    if (!payment) throw new ApiError('not_found', 'PlanPaymentNotFound', {});
    if (payment.status !== PlanPaymentStatus.Pending || payment.transactionId !== null) {
      throw new ApiError('conflict', 'PlanPaymentNotPending', {});
    }
    try {
      await this.store.setStatus(tx, id, {
        status: values.matchesQuoted ? PlanPaymentStatus.Pending : PlanPaymentStatus.NeedsReview,
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
}
