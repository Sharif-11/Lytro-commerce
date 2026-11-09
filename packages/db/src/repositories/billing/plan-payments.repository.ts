import {
  and,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  notExists,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  billingTerms,
  invoices,
  planPayments,
  plans,
  usedTransactionIds,
  type SelectPlanPayment,
  type SelectUsedTransactionId,
  lytroListenerMessages,
  tenants,
} from '../../schema';
import {
  BillingPaymentState,
  PlanPaymentStatus,
  type PaymentCancelReason,
  type PaymentReviewReason,
  type PlanPaymentKind,
  ListenerMessageStatus,
  type PaymentMethod,
} from '@lytronix/validators';
import type { Executor } from '../../transactions';

export interface NewPlanPayment {
  tenantId: string;
  kind: PlanPaymentKind;
  planId: string | null;
  billingTermId: string | null;
  amount: string;
  creditAmount: string;
  recordedByPlatform?: boolean;
}

/** BIL-19: a payment as the shop's Billing section lists it: the row, the names it shows, and its invoice. */
export type TenantPaymentRow = SelectPlanPayment & {
  planName: string | null;
  termLabelEn: string | null;
  termLabelBn: string | null;
  termMonths: number | null;
  invoiceId: string | null;
  invoiceNumber: number | null;
};

/** BIL-19: what the shop's payments may be listed by, and what the list returns. */
export interface TenantPaymentFilter {
  state?: BillingPaymentState;
  kind?: PlanPaymentKind;
  page: number;
  limit: number;
}

/** BIL-19: the rejected or lapsed payment the shop should act on. */
export interface PaymentNeedingAttentionRow {
  id: string;
  kind: PlanPaymentKind;
  amount: string;
  status: PlanPaymentStatus;
  transactionId: string | null;
}

// BIL-19: each seller-facing state as the rows it covers -- the SQL twin of `billingPaymentStateOf`.
function stateCondition(state: BillingPaymentState): SQL | undefined {
  switch (state) {
    case BillingPaymentState.Awaiting:
      return and(
        eq(planPayments.status, PlanPaymentStatus.Pending),
        isNull(planPayments.transactionId),
      );
    case BillingPaymentState.Checking:
      return and(
        inArray(planPayments.status, [PlanPaymentStatus.Pending, PlanPaymentStatus.NeedsReview]),
        isNotNull(planPayments.transactionId),
      );
    case BillingPaymentState.Paid:
      return eq(planPayments.status, PlanPaymentStatus.Verified);
    case BillingPaymentState.Rejected:
      return eq(planPayments.status, PlanPaymentStatus.Rejected);
    case BillingPaymentState.Expired:
      return eq(planPayments.status, PlanPaymentStatus.Expired);
    case BillingPaymentState.Cancelled:
      return eq(planPayments.status, PlanPaymentStatus.Cancelled);
    case BillingPaymentState.Reversed:
      return eq(planPayments.status, PlanPaymentStatus.Reversed);
  }
}

// BIL-19, BIL-15: when a payment was decided -- or, never submitted, when it lapsed, 24 hours after its quote.
const decidedAt = sql`coalesce(${planPayments.verifiedAt}, ${planPayments.quotedAt} + interval '24 hours')`;

// D2-1: control.plan_payments -- the pending -> needs_review/verified/rejected/expired/cancelled state machine.
/**
 * ADM-06: a payment as the operator's queue lists it, with its shop. `wallet` is the wallet a receipt says it arrived
 * on: a seller names no wallet when paying Lytro, so it stays null until one of Lytro's phones has seen the money.
 */
export type QueuedPlanPaymentRow = SelectPlanPayment & {
  shopName: string;
  shopSlug: string;
  wallet: PaymentMethod | null;
};

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

  // The operator queue: submitted (transaction ID attached) payments still awaiting a decision; one shop's alone for its
  // page (ADM-03).
  async listPending(
    tx: Executor,
    kind?: PlanPaymentKind,
    tenantId?: string,
  ): Promise<QueuedPlanPaymentRow[]> {
    const conditions = and(
      inArray(planPayments.status, [PlanPaymentStatus.Pending, PlanPaymentStatus.NeedsReview]),
      isNotNull(planPayments.transactionId),
      kind ? eq(planPayments.kind, kind) : undefined,
      tenantId ? eq(planPayments.tenantId, tenantId) : undefined,
    );
    return tx
      .select({
        ...getTableColumns(planPayments),
        shopName: tenants.shopName,
        shopSlug: tenants.slug,
        wallet: lytroListenerMessages.method,
      })
      .from(planPayments)
      .innerJoin(tenants, eq(tenants.id, planPayments.tenantId))
      .leftJoin(
        lytroListenerMessages,
        and(
          eq(lytroListenerMessages.planPaymentId, planPayments.id),
          inArray(lytroListenerMessages.status, [
            ListenerMessageStatus.Matched,
            ListenerMessageStatus.NeedsReview,
          ]),
        ),
      )
      .where(conditions)
      .orderBy(desc(planPayments.quotedAt));
  }

  /**
   * BAL-03, BIL-04: one shop's payments of these kinds that were submitted (a transaction ID attached) and still wait
   * for the operator's decision -- how many, and for how much in all.
   */
  async submittedForTenant(
    tx: Executor,
    tenantId: string,
    kinds: PlanPaymentKind[],
  ): Promise<{ count: number; amount: string }> {
    const rows = await tx
      .select({
        count: sql<number>`count(*)::int`,
        amount: sql<string>`coalesce(sum(${planPayments.amount}), 0)::numeric(12, 2)::text`,
      })
      .from(planPayments)
      .where(
        and(
          eq(planPayments.tenantId, tenantId),
          inArray(planPayments.kind, kinds),
          inArray(planPayments.status, [PlanPaymentStatus.Pending, PlanPaymentStatus.NeedsReview]),
          isNotNull(planPayments.transactionId),
        ),
      );
    return rows[0] ?? { count: 0, amount: '0.00' };
  }

  /**
   * UPG-08: a row of this kind the shop submitted (a transaction ID attached) that still waits for the operator. An
   * unsubmitted one never blocks: the next request of its kind closes it (`closeOpen`).
   */
  async findSubmittedOpen(
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
          isNotNull(planPayments.transactionId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * BIL-19: closes the shop's open requests of these kinds that nothing was submitted for -- the shop's own Cancel for
   * one, or every one a newer request of the same kind replaces. A submitted row is never touched: money may have
   * moved. The ids it closed.
   */
  async closeOpen(
    tx: Executor,
    tenantId: string,
    kinds: PlanPaymentKind[],
    reason: PaymentCancelReason,
    now: Date,
    id?: string,
  ): Promise<string[]> {
    const rows = await tx
      .update(planPayments)
      .set({ status: PlanPaymentStatus.Cancelled, cancelReason: reason, verifiedAt: now })
      .where(
        and(
          eq(planPayments.tenantId, tenantId),
          inArray(planPayments.kind, kinds),
          eq(planPayments.status, PlanPaymentStatus.Pending),
          isNull(planPayments.transactionId),
          id === undefined ? undefined : eq(planPayments.id, id),
        ),
      )
      .returning({ id: planPayments.id });
    return rows.map((row) => row.id);
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
      submittedAt?: Date | null;
      note?: string | null;
      cancelReason?: PaymentCancelReason | null;
      amountSent?: string | null;
      amountArrived?: string | null;
      reviewReason?: PaymentReviewReason | null;
      evidenceId?: string | null;
    },
  ): Promise<void> {
    await tx.update(planPayments).set(values).where(eq(planPayments.id, id));
  }

  /**
   * VER-02 (Slice 5.6): the payment a receipt with this transaction ID settles, held -- one still open before one closed, the
   * newest of each. Null when no seller typed it.
   */
  async lockTyped(tx: Executor, transactionId: string): Promise<SelectPlanPayment | null> {
    const [row] = await tx
      .select()
      .from(planPayments)
      .where(eq(planPayments.transactionId, transactionId))
      .orderBy(
        sql`CASE WHEN ${planPayments.status} IN ('pending', 'needs_review') THEN 0 ELSE 1 END`,
        desc(planPayments.submittedAt),
      )
      .limit(1)
      .for('update');
    return row ?? null;
  }

  /** BIL-06 (Slice 5.6, agreed 2026-11-03): money for a plan or add-on put on the balance: the row becomes the top-up it now is. */
  async creditInstead(
    tx: Executor,
    id: string,
    values: { kind: PlanPaymentKind; amount: string; verifiedBy: string; verifiedAt: Date },
  ): Promise<void> {
    await tx
      .update(planPayments)
      .set({
        ...values,
        planId: null,
        billingTermId: null,
        creditAmount: '0',
        amountArrived: values.amount,
        status: PlanPaymentStatus.Verified,
      })
      .where(eq(planPayments.id, id));
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

  /**
   * BIL-19: these shops' payments to the platform (a shop's own, and its owner's earlier shops', LIF-21), newest
   * first, each with the plan and term it names and the invoice it produced; optionally one state or kind.
   */
  async listForTenants(
    tx: Executor,
    tenantIds: string[],
    filter: TenantPaymentFilter,
  ): Promise<{ payments: TenantPaymentRow[]; total: number }> {
    if (tenantIds.length === 0) return { payments: [], total: 0 };
    const where = and(
      inArray(planPayments.tenantId, tenantIds),
      filter.kind ? eq(planPayments.kind, filter.kind) : undefined,
      filter.state ? stateCondition(filter.state) : undefined,
    );
    const [payments, counted] = await Promise.all([
      this.selectWithNames(tx)
        .where(where)
        .orderBy(desc(planPayments.quotedAt), desc(planPayments.id))
        .limit(filter.limit)
        .offset((filter.page - 1) * filter.limit),
      tx
        .select({ total: sql<number>`count(*)::int` })
        .from(planPayments)
        .where(where),
    ]);
    return { payments, total: counted[0]?.total ?? 0 };
  }

  /**
   * BIL-19: the payment the shop should act on -- its newest rejected or expired payment of these kinds, decided (or
   * lapsed) since `since`, with no later payment of the same kind, which would mean the shop has already paid again.
   * A later request the shop cancelled is not paying again.
   */
  async needingAttention(
    tx: Executor,
    tenantId: string,
    kinds: PlanPaymentKind[],
    since: Date,
  ): Promise<PaymentNeedingAttentionRow | null> {
    if (kinds.length === 0) return null;
    const later = alias(planPayments, 'later');
    const rows = await tx
      .select({
        id: planPayments.id,
        kind: planPayments.kind,
        amount: planPayments.amount,
        status: planPayments.status,
        transactionId: planPayments.transactionId,
      })
      .from(planPayments)
      .where(
        and(
          eq(planPayments.tenantId, tenantId),
          inArray(planPayments.kind, kinds),
          inArray(planPayments.status, [PlanPaymentStatus.Rejected, PlanPaymentStatus.Expired]),
          sql`${decidedAt} >= ${since}`,
          notExists(
            tx
              .select({ one: sql`1` })
              .from(later)
              .where(
                and(
                  eq(later.tenantId, planPayments.tenantId),
                  eq(later.kind, planPayments.kind),
                  gt(later.quotedAt, planPayments.quotedAt),
                  ne(later.status, PlanPaymentStatus.Cancelled),
                ),
              ),
          ),
        ),
      )
      .orderBy(desc(decidedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  /** The row with the plan's and term's names and the invoice's id and number beside it. */
  private selectWithNames(tx: Executor) {
    return tx
      .select({
        ...getTableColumns(planPayments),
        planName: plans.name,
        termLabelEn: billingTerms.labelEn,
        termLabelBn: billingTerms.labelBn,
        termMonths: billingTerms.months,
        invoiceId: invoices.id,
        invoiceNumber: invoices.number,
      })
      .from(planPayments)
      .leftJoin(plans, eq(plans.id, planPayments.planId))
      .leftJoin(billingTerms, eq(billingTerms.id, planPayments.billingTermId))
      .leftJoin(invoices, eq(invoices.planPaymentId, planPayments.id));
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

  /**
   * ORD-15: registers the ID for this shop unless it is already registered, in the same transaction as the payment.
   * `claimed` when this call registered it; otherwise the shop that holds it -- this one, or another that used it first.
   */
  async claim(
    tx: Executor,
    transactionId: string,
    tenantId: string,
  ): Promise<{ claimed: boolean; tenantId: string }> {
    const [row] = await tx
      .insert(usedTransactionIds)
      .values({ transactionId, tenantId })
      .onConflictDoNothing()
      .returning({ tenantId: usedTransactionIds.tenantId });
    if (row) return { claimed: true, tenantId: row.tenantId };
    const [held] = await tx
      .select({ tenantId: usedTransactionIds.tenantId })
      .from(usedTransactionIds)
      .where(eq(usedTransactionIds.transactionId, transactionId));
    if (!held) throw new Error('a transaction ID that conflicted is registered');
    return { claimed: false, tenantId: held.tenantId };
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
