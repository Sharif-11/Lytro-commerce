import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import {
  PaymentSessionState,
  type GatewayResult,
  type PaymentMethod,
  type PaymentRejectReason,
  type PaymentReviewReason,
  type PaymentSessionSource,
} from '@lytronix/validators';
import {
  orderPayments,
  orderLines,
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

  /**
   * Agreed 2026-11-01 (Slice 5.4 read): the order's session still awaiting money cancelled -- the order was paid in full
   * another way, so its page takes no more. A session where the shopper typed an ID is left for staff. How many it closed.
   */
  async cancelAwaitingForOrder(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    keepWalletTry = false,
  ): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .update(paymentSessions)
      .set({ state: PaymentSessionState.Cancelled, updatedAt: new Date() })
      .where(
        and(
          eq(paymentSessions.tenantId, tenantId),
          eq(paymentSessions.orderId, orderId),
          eq(paymentSessions.state, PaymentSessionState.AwaitingPayment),
          // Asked to, a try at a wallet's checkout still open is left for its return or the minute pass, so money that
          // moves there is settled or sent to staff, never dropped (found at the Phase 5 close-out).
          keepWalletTry
            ? or(isNull(paymentSessions.gatewayPaymentId), isNotNull(paymentSessions.gatewayResult))
            : undefined,
        ),
      )
      .returning({ id: paymentSessions.id });
    return rows.length;
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
          eq(orderPayments.test, false),
          gte(orderPayments.verifiedAt, since),
        ),
      );
    const [open] = await tx
      .select({ total: sql<string>`coalesce(sum(${paymentSessions.amount}), 0)::text` })
      .from(paymentSessions)
      .where(
        and(
          eq(paymentSessions.tenantId, tenantId),
          inArray(paymentSessions.state, OPEN),
          // A test checkout's money never counts (VER-11), open or verified (found at the Phase 5 close-out).
          eq(paymentSessions.test, false),
        ),
      );
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

  /** PAY-05, PAY-24 (Slice 5.8's part 2): what the page's details name, and the order's tracking ID. */
  async orderSummaryOf(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<{
    trackingId: string;
    items: { name: string; attributes: string[]; quantity: string }[];
  }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [order] = await tx
      .select({ trackingId: orders.trackingId })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)));
    if (!order) throw new Error('a session names an order the shop does not have');
    const rows = await tx
      .select({
        name: orderLines.productName,
        attributes: orderLines.attributeValues,
        quantity: orderLines.quantity,
      })
      .from(orderLines)
      .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId)))
      .orderBy(asc(orderLines.position));
    return {
      trackingId: order.trackingId,
      items: rows.map((row) => ({
        name: row.name,
        attributes: row.attributes.map((attribute) => attribute.value),
        quantity: row.quantity,
      })),
    };
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
  /** WAL-11: whether a shopper's try at a wallet's checkout is still open on any of these accounts. */
  async walletTryOpenOn(
    tx: Transaction,
    tenantId: string,
    accountIds: readonly string[],
  ): Promise<boolean> {
    if (accountIds.length === 0) return false;
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ id: paymentSessions.id })
      .from(paymentSessions)
      .where(
        and(
          eq(paymentSessions.tenantId, tenantId),
          inArray(paymentSessions.gatewayAccountId, [...accountIds]),
          eq(paymentSessions.state, PaymentSessionState.AwaitingPayment),
          isNull(paymentSessions.gatewayResult),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  /**
   * WAL-18, D8-67 (Slice 8.7): the shop's payments still open, method by method -- a shopper who chose it and hasn't paid
   * yet, a transaction ID waiting to be checked, or one waiting for a person to decide -- which hold the method's type back
   * from being removed. A session whose shopper is still to choose names no method.
   */
  async openByMethod(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ method: PaymentMethod; open: number }[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ method: paymentSessions.method, open: sql<number>`count(*)::int` })
      .from(paymentSessions)
      .where(
        and(
          eq(paymentSessions.tenantId, tenantId),
          isNotNull(paymentSessions.method),
          inArray(paymentSessions.state, OPEN),
        ),
      )
      .groupBy(paymentSessions.method);
    return rows.flatMap((row) =>
      row.method === null ? [] : [{ method: row.method, open: row.open }],
    );
  }

  /**
   * The order's open sessions, held, so a caller about to hold the order takes them first: verifying, the minute pass and a
   * wallet's settling hold a session and then its order, and holding them the other way round could deadlock with them
   * (found at the Phase 5 close-out).
   */
  async lockOpenForOrder(tx: Transaction, tenantId: string, orderId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .select({ id: paymentSessions.id })
      .from(paymentSessions)
      .where(
        and(
          eq(paymentSessions.tenantId, tenantId),
          eq(paymentSessions.orderId, orderId),
          inArray(paymentSessions.state, OPEN),
        ),
      )
      .orderBy(asc(paymentSessions.id))
      .for('update');
  }

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

  /**
   * PAY-07 (Slice 5.4b, agreed 2026-11-02): the transaction ID corrected -- it counts one of the shopper's changes, and the
   * payment goes back to waiting.
   */
  async changeTyped(
    tx: Transaction,
    tenantId: string,
    id: string,
    values: { transactionId: string; senderNumber: string | null },
  ): Promise<SelectPaymentSession> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .update(paymentSessions)
      .set({
        ...values,
        state: PaymentSessionState.Checking,
        reviewReason: null,
        idChanges: sql`${paymentSessions.idChanges} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(paymentSessions.tenantId, tenantId), eq(paymentSessions.id, id)))
      .returning();
    if (!row) throw new Error('update returned no payment session');
    return row;
  }

  /**
   * VER-02, VER-04 (Slice 5.4b): the session a receipt with this transaction ID settles, held -- one still waiting on it
   * before one with staff, before one already closed; the newest of each. Null when nobody typed it.
   */
  async lockTyped(
    tx: Transaction,
    tenantId: string,
    transactionId: string,
  ): Promise<SelectPaymentSession | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(paymentSessions)
      .where(
        and(
          eq(paymentSessions.tenantId, tenantId),
          eq(paymentSessions.transactionId, transactionId),
        ),
      )
      .orderBy(
        sql`CASE ${paymentSessions.state} WHEN 'checking' THEN 0 WHEN 'needs_review' THEN 1 ELSE 2 END`,
        desc(paymentSessions.submittedAt),
      )
      .limit(1)
      .for('update');
    return row ?? null;
  }

  /** VER-02, WAL-21 (Slice 5.4b): the payment sent to staff, and why. */
  async toReview(
    tx: Transaction,
    tenantId: string,
    id: string,
    reason: PaymentReviewReason,
  ): Promise<SelectPaymentSession> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .update(paymentSessions)
      .set({ state: PaymentSessionState.NeedsReview, reviewReason: reason, updatedAt: new Date() })
      .where(and(eq(paymentSessions.tenantId, tenantId), eq(paymentSessions.id, id)))
      .returning();
    if (!row) throw new Error('update returned no payment session');
    return row;
  }

  /** VER-01, VER-07 (Slice 5.4b): staff have been told of this payment. */
  async markTold(tx: Transaction, tenantId: string, id: string, at: Date): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(paymentSessions)
      .set({ staffToldAt: at, updatedAt: new Date() })
      .where(and(eq(paymentSessions.tenantId, tenantId), eq(paymentSessions.id, id)));
  }

  /** VER-07 (Slice 5.4b): payments typed before `before`, still waiting, that staff have not been told of; held. */
  async lockUntold(
    tx: Transaction,
    tenantId: string,
    before: Date,
  ): Promise<SelectPaymentSession[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(paymentSessions)
      .where(
        and(
          eq(paymentSessions.tenantId, tenantId),
          eq(paymentSessions.state, PaymentSessionState.Checking),
          isNull(paymentSessions.staffToldAt),
          lte(paymentSessions.submittedAt, before),
        ),
      )
      .orderBy(asc(paymentSessions.submittedAt))
      .for('update', { skipLocked: true });
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
          // VER-09 (Slice 5.7): a checkout at a wallet is asked after first, by its own minute pass.
          isNull(paymentSessions.gatewayPaymentId),
        ),
      )
      .orderBy(asc(paymentSessions.expiresAt))
      .for('update', { skipLocked: true });
  }

  /** PAY-06, WAL-11, WAL-21 (Slice 5.7): a try at the wallet's own checkout begins, on this account, its fee held. */
  async beginGateway(
    tx: Transaction,
    tenantId: string,
    id: string,
    values: { method: PaymentMethod; accountId: string; feeHeld: string; test: boolean },
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(paymentSessions)
      .set({
        method: values.method,
        gatewayAccountId: values.accountId,
        feeHeld: values.feeHeld,
        test: values.test,
        gatewayResult: null,
        updatedAt: new Date(),
      })
      .where(and(eq(paymentSessions.tenantId, tenantId), eq(paymentSessions.id, id)));
  }

  /** PAY-06 (Slice 5.7): the wallet took the payment on: its reference, and where the shopper goes. */
  async gatewayStarted(
    tx: Transaction,
    tenantId: string,
    id: string,
    checkout: { paymentId: string; redirectUrl: string },
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(paymentSessions)
      .set({
        gatewayPaymentId: checkout.paymentId,
        gatewayUrl: checkout.redirectUrl,
        updatedAt: new Date(),
      })
      .where(and(eq(paymentSessions.tenantId, tenantId), eq(paymentSessions.id, id)));
  }

  /** VER-09, PAY-08, WAL-21 (Slice 5.7): this try is over: the hold ends, and the shopper may try again or pay by hand. */
  async endGateway(
    tx: Transaction,
    tenantId: string,
    id: string,
    result: GatewayResult,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(paymentSessions)
      .set({
        gatewayPaymentId: null,
        gatewayUrl: null,
        gatewayAccountId: null,
        feeHeld: '0',
        test: false,
        gatewayResult: result,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentSessions.tenantId, tenantId),
          eq(paymentSessions.id, id),
          eq(paymentSessions.state, PaymentSessionState.AwaitingPayment),
        ),
      );
  }

  /** VER-09 (Slice 5.7): the wallet says it is paid: the session carries its ID, as one typed would, and the fee is no longer held. */
  async gatewayPaid(
    tx: Transaction,
    tenantId: string,
    id: string,
    values: {
      transactionId: string;
      senderNumber: string | null;
      paidTo: PaidToSnapshot | null;
      at: Date;
    },
  ): Promise<SelectPaymentSession> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .update(paymentSessions)
      .set({
        transactionId: values.transactionId,
        senderNumber: values.senderNumber,
        paidTo: values.paidTo,
        submittedAt: values.at,
        state: PaymentSessionState.Checking,
        feeHeld: '0',
        staffToldAt: values.at,
        updatedAt: new Date(),
      })
      .where(and(eq(paymentSessions.tenantId, tenantId), eq(paymentSessions.id, id)))
      .returning();
    if (!row) throw new Error('update returned no payment session');
    return row;
  }

  /** VER-09 (Slice 5.7): checkouts at a wallet past their window, for the minute pass to ask after. */
  async gatewayDue(tx: Transaction, tenantId: string, now: Date): Promise<SelectPaymentSession[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(paymentSessions)
      .where(
        and(
          eq(paymentSessions.tenantId, tenantId),
          eq(paymentSessions.state, PaymentSessionState.AwaitingPayment),
          isNotNull(paymentSessions.gatewayPaymentId),
          lte(paymentSessions.expiresAt, now),
        ),
      )
      .orderBy(asc(paymentSessions.expiresAt));
  }

  /** WAL-21 (Slice 5.7): what the shop's balance holds for open checkouts; it ends by itself as each closes. */
  async feesHeld(tx: Transaction, tenantId: string): Promise<string> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ total: sql<string>`coalesce(sum(${paymentSessions.feeHeld}), 0)::text` })
      .from(paymentSessions)
      .where(
        and(
          eq(paymentSessions.tenantId, tenantId),
          eq(paymentSessions.state, PaymentSessionState.AwaitingPayment),
        ),
      );
    return Number(row?.total ?? 0).toFixed(2);
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
