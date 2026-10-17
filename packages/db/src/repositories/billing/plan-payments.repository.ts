import { and, desc, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import {
  planPayments,
  usedTransactionIds,
  type SelectPlanPayment,
  type SelectUsedTransactionId,
} from '../../schema';
import { PlanPaymentStatus, type PlanPaymentKind } from '@lytronix/validators';
import type { Executor } from '../../transactions';

export interface NewPlanPayment {
  tenantId: string;
  kind: PlanPaymentKind;
  planId: string | null;
  billingTermId: string | null;
  amount: string;
  creditAmount: string;
}

// D2-1: control.plan_payments -- the pending -> needs_review/verified/rejected/expired state machine.
export class PlanPaymentsRepository {
  async insert(tx: Executor, values: NewPlanPayment): Promise<SelectPlanPayment> {
    const [row] = await tx.insert(planPayments).values(values).returning();
    if (!row) throw new Error('insert returned no plan payment');
    return row;
  }

  async findById(tx: Executor, id: string): Promise<SelectPlanPayment | null> {
    const rows = await tx.select().from(planPayments).where(eq(planPayments.id, id)).limit(1);
    return rows[0] ?? null;
  }

  /** Locks the row for the rest of the transaction -- a confirm/reject reads-then-writes it atomically. */
  async findByIdForUpdate(tx: Executor, id: string): Promise<SelectPlanPayment | null> {
    const rows = await tx.select().from(planPayments).where(eq(planPayments.id, id)).for('update');
    return rows[0] ?? null;
  }

  // The operator queue: submitted (transaction ID attached) payments still awaiting a decision.
  async listPending(tx: Executor, kind?: PlanPaymentKind): Promise<SelectPlanPayment[]> {
    const base = and(
      inArray(planPayments.status, [PlanPaymentStatus.Pending, PlanPaymentStatus.NeedsReview]),
      isNotNull(planPayments.transactionId),
    );
    const conditions = kind ? and(base, eq(planPayments.kind, kind)) : base;
    return tx.select().from(planPayments).where(conditions).orderBy(desc(planPayments.quotedAt));
  }

  /** UPG-08: any not-yet-decided row of this kind for this tenant, submitted or not -- the one-pending check. */
  async findActiveForTenant(
    tx: Executor,
    tenantId: string,
    kind: PlanPaymentKind,
  ): Promise<SelectPlanPayment | null> {
    const rows = await tx
      .select()
      .from(planPayments)
      .where(
        and(
          eq(planPayments.tenantId, tenantId),
          eq(planPayments.kind, kind),
          inArray(planPayments.status, [PlanPaymentStatus.Pending, PlanPaymentStatus.NeedsReview]),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async setStatus(
    tx: Executor,
    id: string,
    values: {
      status: PlanPaymentStatus;
      senderNumber?: string | null;
      transactionId?: string | null;
      verifiedBy?: string | null;
      verifiedAt?: Date | null;
    },
  ): Promise<void> {
    await tx.update(planPayments).set(values).where(eq(planPayments.id, id));
  }

  /**
   * BIL-15: an unsubmitted quote (never got a transaction ID) past its own 24h window expires. A row
   * already submitted (`transaction_id` set) is left alone -- it's awaiting an operator's own decision,
   * not sitting idle, so BIL-15's expiry doesn't apply to it at all.
   */
  async expireStalePending(tx: Executor, cutoff: Date): Promise<number> {
    const rows = await tx
      .update(planPayments)
      .set({ status: PlanPaymentStatus.Expired })
      .where(
        and(
          eq(planPayments.status, PlanPaymentStatus.Pending),
          isNull(planPayments.transactionId),
          lt(planPayments.quotedAt, cutoff),
        ),
      )
      .returning({ id: planPayments.id });
    return rows.length;
  }
}

// BIL-07/BAL-05: a transaction ID is usable for exactly one payment, platform-wide, forever.
export class UsedTransactionIdsRepository {
  /** Registers the ID in the same transaction as the payment it confirms. Fails on a 23505 if already used. */
  async insert(
    tx: Executor,
    transactionId: string,
    tenantId: string,
  ): Promise<SelectUsedTransactionId> {
    const [row] = await tx
      .insert(usedTransactionIds)
      .values({ transactionId, tenantId })
      .returning();
    if (!row) throw new Error('insert returned no used-transaction-id row');
    return row;
  }

  async exists(tx: Executor, transactionId: string): Promise<boolean> {
    const rows = await tx
      .select({ transactionId: usedTransactionIds.transactionId })
      .from(usedTransactionIds)
      .where(eq(usedTransactionIds.transactionId, transactionId))
      .limit(1);
    return rows.length > 0;
  }
}
