import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import {
  PaymentSessionState,
  type PaymentMethod,
  type PaymentRejectReason,
  type PaymentSessionSource,
} from '@lytronix/validators';
import {
  orderPayments,
  orders,
  paymentSessionRefs,
  paymentSessions,
  type PaidToSnapshot,
  type SelectPaymentSession,
} from '../../schema';
import type { Executor, Transaction, TransactionRunner } from '../../transactions';

/** PAY-01: a session as it is opened, for an order, awaiting payment until `expiresAt`. */
export interface NewPaymentSession {
  ref: string;
  orderId: string;
  source: PaymentSessionSource;
  amount: string;
  method: PaymentMethod | null;
  returnUrl: string | null;
  cancelUrl: string | null;
  expiresAt: Date;
}

/** VER-01, PAY-14 (Slice 5.3): a session verified or rejected -- by whom, when, and a rejection's reason. */
export interface PaymentDecision {
  state: PaymentSessionState.Verified | PaymentSessionState.Failed;
  decidedBy: string | null;
  decidedAt: Date;
  rejectReason: PaymentRejectReason | null;
  rejectNote: string | null;
}

/** PAY-07: what the shopper typed, and the account they say they paid into. */
export interface PaymentSubmission {
  method: PaymentMethod;
  transactionId: string;
  senderNumber: string | null;
  paidTo: PaidToSnapshot;
  submittedAt: Date;
}

// A session still open: awaiting payment, or a payment being checked.
const OPEN = [
  PaymentSessionState.AwaitingPayment,
  PaymentSessionState.Checking,
  PaymentSessionState.NeedsReview,
];

// PAY-01 to PAY-08 (Phase 5 Slice 5.2): a shop's payment sessions, and the control row that finds a session's shop by
// its reference. Every method on the shop's sessions sets its tenant context.
export class PaymentSessionRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  /** The session and its reference, in the caller's transaction. */
  async insert(
    tx: Transaction,
    tenantId: string,
    values: NewPaymentSession,
  ): Promise<SelectPaymentSession> {
    await tx.insert(paymentSessionRefs).values({ ref: values.ref, tenantId });
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(paymentSessions)
      .values({ tenantId, ...values })
      .returning();
    if (!row) throw new Error('insert returned no payment session');
    return row;
  }

  /** TEN-29: the shop a reference belongs to, before the shop is known; null for none. */
  async tenantOfRef(db: Executor, ref: string): Promise<string | null> {
    const [row] = await db
      .select({ tenantId: paymentSessionRefs.tenantId })
      .from(paymentSessionRefs)
      .where(eq(paymentSessionRefs.ref, ref))
      .limit(1);
    return row?.tenantId ?? null;
  }

  async findByRef(
    tx: Transaction,
    tenantId: string,
    ref: string,
    lock = false,
  ): Promise<SelectPaymentSession | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const query = tx
      .select()
      .from(paymentSessions)
      .where(and(eq(paymentSessions.tenantId, tenantId), eq(paymentSessions.ref, ref)));
    const [row] = lock ? await query.for('update') : await query;
    return row ?? null;
  }

  /** VER-01 (Slice 5.3): a session by its id, held for a decision when `lock`. */
  async findById(
    tx: Transaction,
    tenantId: string,
    id: string,
    lock = false,
  ): Promise<SelectPaymentSession | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const query = tx
      .select()
      .from(paymentSessions)
      .where(and(eq(paymentSessions.tenantId, tenantId), eq(paymentSessions.id, id)));
    const [row] = lock ? await query.for('update') : await query;
    return row ?? null;
  }

  /** VER-01, PAY-14: the session verified or rejected. */
  async decide(
    tx: Transaction,
    tenantId: string,
    id: string,
    decision: PaymentDecision,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(paymentSessions)
      .set({ ...decision, updatedAt: new Date() })
      .where(and(eq(paymentSessions.tenantId, tenantId), eq(paymentSessions.id, id)));
  }

  /**
   * TVR-04 (Slice 5.3): what the shop's online payments come to towards its day's cap -- those verified since `since`
   * and still counted, and every session still open, whose money may yet come.
   */
  async capTotal(tx: Transaction, tenantId: string, since: Date): Promise<string> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [verified] = await tx
      .select({ total: sql<string>`coalesce(sum(${orderPayments.amount}), 0)::text` })
      .from(orderPayments)
      .where(
        and(
          eq(orderPayments.tenantId, tenantId),
          isNotNull(orderPayments.sessionId),
          isNull(orderPayments.voidedAt),
          isNull(orderPayments.refundedAt),
          gte(orderPayments.verifiedAt, since),
        ),
      );
    const [open] = await tx
      .select({ total: sql<string>`coalesce(sum(${paymentSessions.amount}), 0)::text` })
      .from(paymentSessions)
      .where(and(eq(paymentSessions.tenantId, tenantId), inArray(paymentSessions.state, OPEN)));
    return (Number(verified?.total ?? 0) + Number(open?.total ?? 0)).toFixed(2);
  }

  /** PAY-05: the order number the page shows for a session. */
  async orderNumberOf(tx: Transaction, tenantId: string, orderId: string): Promise<string> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ orderNumber: orders.orderNumber })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)));
    // An order is numbered in its own transaction, before any session is opened for it.
    if (!row?.orderNumber) throw new Error('a session names an order the shop has not numbered');
    return row.orderNumber;
  }

  /** ORD-17: the open session of the order with this tracking ID, if it has one. */
  async openForTracking(
    tx: Transaction,
    tenantId: string,
    trackingId: string,
  ): Promise<SelectPaymentSession | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ session: paymentSessions })
      .from(paymentSessions)
      .innerJoin(
        orders,
        and(eq(orders.tenantId, paymentSessions.tenantId), eq(orders.id, paymentSessions.orderId)),
      )
      .where(
        and(
          eq(paymentSessions.tenantId, tenantId),
          eq(orders.trackingId, trackingId),
          inArray(paymentSessions.state, OPEN),
        ),
      )
      .orderBy(desc(paymentSessions.createdAt))
      .limit(1);
    return row?.session ?? null;
  }

  /** The order's open session, if it has one. */
  async openForOrder(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<SelectPaymentSession | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(paymentSessions)
      .where(
        and(
          eq(paymentSessions.tenantId, tenantId),
          eq(paymentSessions.orderId, orderId),
          inArray(paymentSessions.state, OPEN),
        ),
      )
      .orderBy(desc(paymentSessions.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** PAY-07, D5-5: what the shopper typed; the session moves to checking and no longer runs out. */
  async submit(
    tx: Transaction,
    tenantId: string,
    id: string,
    values: PaymentSubmission,
  ): Promise<SelectPaymentSession> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .update(paymentSessions)
      .set({ ...values, state: PaymentSessionState.Checking, updatedAt: new Date() })
      .where(and(eq(paymentSessions.tenantId, tenantId), eq(paymentSessions.id, id)))
      .returning();
    if (!row) throw new Error('update returned no payment session');
    return row;
  }

  /** PAY-03: sessions still awaiting payment whose time ran out, held; one another pass holds is skipped. */
  async lockExpired(tx: Transaction, tenantId: string, now: Date): Promise<SelectPaymentSession[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(paymentSessions)
      .where(
        and(
          eq(paymentSessions.tenantId, tenantId),
          eq(paymentSessions.state, PaymentSessionState.AwaitingPayment),
          lte(paymentSessions.expiresAt, now),
        ),
      )
      .orderBy(asc(paymentSessions.expiresAt))
      .for('update', { skipLocked: true });
  }

  async setState(
    tx: Transaction,
    tenantId: string,
    id: string,
    state: PaymentSessionState,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(paymentSessions)
      .set({ state, updatedAt: new Date() })
      .where(and(eq(paymentSessions.tenantId, tenantId), eq(paymentSessions.id, id)));
  }

  /** LIF-19: the shop's sessions and the references that found them. */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(paymentSessions).where(eq(paymentSessions.tenantId, tenantId));
    await tx.delete(paymentSessionRefs).where(eq(paymentSessionRefs.tenantId, tenantId));
  }
}
