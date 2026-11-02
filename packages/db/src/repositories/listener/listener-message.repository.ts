import { and, count, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import {
  ListenerMessageStatus,
  type ListenerIgnoredReason,
  type PaymentMethod,
  type PaymentReviewReason,
} from '@lytronix/validators';
import {
  listenerMessages,
  orderPayments,
  orders,
  paymentSessions,
  type SelectListenerMessage,
} from '../../schema';
import type { Executor, Transaction, TransactionRunner } from '../../transactions';
import { escapeLike } from '../like';

/** VER-02 to VER-06: a message a phone forwarded, as it is kept. */
export interface NewListenerMessage {
  deviceId: string;
  sender: string;
  method: PaymentMethod | null;
  transactionId: string | null;
  amount: string | null;
  senderNumber: string | null;
  rawText: string | null;
  status: ListenerMessageStatus;
  ignoredReason: ListenerIgnoredReason | null;
  receivedAt: Date;
}

/** VER-02, PAY-15: where a receipt came to stand. */
export interface ListenerMessageOutcome {
  status: ListenerMessageStatus;
  reviewReason: PaymentReviewReason | null;
  sessionId: string | null;
  paymentId: string | null;
}

/** A receipt as staff and the app read it, with the order it settled or claims. */
export type ListenerMessageRow = SelectListenerMessage & {
  order: { id: string; orderNumber: string } | null;
};

/** Today's receipts on a phone's home screen. */
export interface ListenerMessageCounts {
  verified: number;
  waiting: number;
  toCheck: number;
}

/** What staff's list of receipts may be narrowed to. */
export interface ListenerMessageFilter {
  status?: ListenerMessageStatus;
  search: string | null;
}

// The one row that holds a transaction ID for the shop stands in one of these.
const HOLDING = [
  ListenerMessageStatus.Matched,
  ListenerMessageStatus.Unmatched,
  ListenerMessageStatus.NeedsReview,
];

// VER-02 to VER-06, LSN-13 to LSN-17 (Phase 5 Slice 5.4b, read agreed 2026-11-02): what a shop's listener phones forwarded.
// Every method sets its tenant context, so a receipt can only ever meet its own shop's payments (VER-05).
export class ListenerMessageRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  /**
   * VER-03, VER-04: the shop's transaction ID held until the transaction ends, so a receipt arriving and a shopper typing
   * the same ID at the same moment take turns, and each sees the other.
   */
  async holdTransactionId(tx: Transaction, tenantId: string, transactionId: string): Promise<void> {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`listener:${tenantId}:${transactionId}`}, 0))`,
    );
  }

  /** VER-03: the row that holds this transaction ID for the shop; null for none. */
  async holderOf(
    tx: Transaction,
    tenantId: string,
    transactionId: string,
  ): Promise<SelectListenerMessage | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(listenerMessages)
      .where(
        and(
          eq(listenerMessages.tenantId, tenantId),
          eq(listenerMessages.transactionId, transactionId),
          inArray(listenerMessages.status, HOLDING),
        ),
      );
    return row ?? null;
  }

  /** What this phone already sent of this transaction ID; null for nothing. */
  async ofPhone(
    tx: Transaction,
    tenantId: string,
    deviceId: string,
    transactionId: string,
  ): Promise<SelectListenerMessage | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(listenerMessages)
      .where(
        and(
          eq(listenerMessages.tenantId, tenantId),
          eq(listenerMessages.deviceId, deviceId),
          eq(listenerMessages.transactionId, transactionId),
          sql`${listenerMessages.status} <> ${ListenerMessageStatus.Ignored}`,
        ),
      );
    return row ?? null;
  }

  async insert(
    tx: Transaction,
    tenantId: string,
    values: NewListenerMessage,
  ): Promise<SelectListenerMessage> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(listenerMessages)
      .values({ tenantId, ...values })
      .returning();
    if (!row) throw new Error('insert returned no listener message');
    return row;
  }

  async settle(
    tx: Transaction,
    tenantId: string,
    id: string,
    outcome: ListenerMessageOutcome,
  ): Promise<SelectListenerMessage> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .update(listenerMessages)
      .set({ ...outcome, updatedAt: new Date() })
      .where(and(eq(listenerMessages.tenantId, tenantId), eq(listenerMessages.id, id)))
      .returning();
    if (!row) throw new Error('update returned no listener message');
    return row;
  }

  /** Agreed 2026-11-02: however a payment came to carry this transaction ID, its receipt is used. */
  async markUsed(
    tx: Transaction,
    tenantId: string,
    transactionId: string,
    paymentId: string,
    sessionId: string | null,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(listenerMessages)
      .set({
        status: ListenerMessageStatus.Matched,
        reviewReason: null,
        paymentId,
        sessionId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(listenerMessages.tenantId, tenantId),
          eq(listenerMessages.transactionId, transactionId),
          inArray(listenerMessages.status, HOLDING),
        ),
      );
  }

  /** PAY-14, PAY-07: a receipt that claimed this session is unclaimed again -- staff rejected it, or the ID was corrected. */
  async releaseOfSession(tx: Transaction, tenantId: string, sessionId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(listenerMessages)
      .set({
        status: ListenerMessageStatus.Unmatched,
        reviewReason: null,
        sessionId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(listenerMessages.tenantId, tenantId),
          eq(listenerMessages.sessionId, sessionId),
          eq(listenerMessages.status, ListenerMessageStatus.NeedsReview),
        ),
      );
  }

  /** Slice 4.3b: a voided payment's receipt is unclaimed again, as its transaction ID is free to record again. */
  async releaseOfPayment(tx: Transaction, tenantId: string, paymentId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(listenerMessages)
      .set({
        status: ListenerMessageStatus.Unmatched,
        reviewReason: null,
        sessionId: null,
        paymentId: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(listenerMessages.tenantId, tenantId), eq(listenerMessages.paymentId, paymentId)),
      );
  }

  /** The live payment already carrying this transaction ID, if staff got there first. */
  async paymentCarrying(
    tx: Transaction,
    tenantId: string,
    transactionId: string,
  ): Promise<{ id: string; sessionId: string | null } | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ id: orderPayments.id, sessionId: orderPayments.sessionId })
      .from(orderPayments)
      .where(
        and(
          eq(orderPayments.tenantId, tenantId),
          eq(orderPayments.transactionId, transactionId),
          sql`${orderPayments.voidedAt} IS NULL`,
        ),
      );
    return row ?? null;
  }

  /** The app's home screen: this phone's newest messages -- receipts, and what test mode read. */
  async recent(
    tx: Transaction,
    tenantId: string,
    deviceId: string,
    limit: number,
  ): Promise<ListenerMessageRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return this.rows(
      tx,
      and(
        eq(listenerMessages.tenantId, tenantId),
        eq(listenerMessages.deviceId, deviceId),
        sql`(${listenerMessages.status} <> ${ListenerMessageStatus.Ignored}
             OR ${listenerMessages.ignoredReason} = 'test_mode')`,
      ),
      limit,
      0,
    );
  }

  /** The app's home screen: how today's receipts stand on this phone. */
  async counts(
    tx: Transaction,
    tenantId: string,
    deviceId: string,
    since: Date,
  ): Promise<ListenerMessageCounts> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ status: listenerMessages.status, total: count() })
      .from(listenerMessages)
      .where(
        and(
          eq(listenerMessages.tenantId, tenantId),
          eq(listenerMessages.deviceId, deviceId),
          gte(listenerMessages.receivedAt, since),
        ),
      )
      .groupBy(listenerMessages.status);
    const of = (status: ListenerMessageStatus): number =>
      rows.find((row) => row.status === status)?.total ?? 0;
    return {
      verified: of(ListenerMessageStatus.Matched),
      waiting: of(ListenerMessageStatus.Unmatched),
      toCheck: of(ListenerMessageStatus.NeedsReview),
    };
  }

  /** Agreed 2026-11-02: the receipts staff can list and search, newest first; what verifies nothing stays out. */
  async list(
    tx: Transaction,
    tenantId: string,
    filter: ListenerMessageFilter,
    page: { offset: number; limit: number },
  ): Promise<{ rows: ListenerMessageRow[]; total: number }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const start = filter.search === null ? null : `${escapeLike(filter.search)}%`;
    const where = and(
      eq(listenerMessages.tenantId, tenantId),
      filter.status !== undefined
        ? eq(listenerMessages.status, filter.status)
        : inArray(listenerMessages.status, HOLDING),
      start === null
        ? undefined
        : sql`(${listenerMessages.transactionId} ILIKE ${start}
               OR ${listenerMessages.senderNumber} ILIKE ${start}
               OR ${listenerMessages.amount}::text ILIKE ${start})`,
    );
    const [totals] = await tx.select({ total: count() }).from(listenerMessages).where(where);
    return {
      rows: await this.rows(tx, where, page.limit, page.offset),
      total: totals?.total ?? 0,
    };
  }

  /** LSN-17: text past its days redacted, the rest of the row kept; what verifies nothing has no use past them. */
  async redact(
    tx: Transaction,
    tenantId: string,
    before: Date,
  ): Promise<{ redacted: number; removed: number }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const redacted = await tx
      .update(listenerMessages)
      .set({ rawText: null, updatedAt: new Date() })
      .where(
        and(
          eq(listenerMessages.tenantId, tenantId),
          isNotNull(listenerMessages.rawText),
          lt(listenerMessages.receivedAt, before),
        ),
      )
      .returning({ id: listenerMessages.id });
    const removed = await tx
      .delete(listenerMessages)
      .where(
        and(
          eq(listenerMessages.tenantId, tenantId),
          inArray(listenerMessages.status, [
            ListenerMessageStatus.Ignored,
            ListenerMessageStatus.Duplicate,
          ]),
          lt(listenerMessages.receivedAt, before),
        ),
      )
      .returning({ id: listenerMessages.id });
    return { redacted: redacted.length, removed: removed.length };
  }

  /** LSN-23, LIF-19: every message of the shop, at day 60. */
  async deleteForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(listenerMessages).where(eq(listenerMessages.tenantId, tenantId));
  }

  private async rows(
    db: Executor,
    where: ReturnType<typeof and>,
    limit: number,
    offset: number,
  ): Promise<ListenerMessageRow[]> {
    const rows = await db
      .select({
        message: listenerMessages,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
      })
      .from(listenerMessages)
      .leftJoin(
        paymentSessions,
        and(
          eq(paymentSessions.tenantId, listenerMessages.tenantId),
          eq(paymentSessions.id, listenerMessages.sessionId),
        ),
      )
      .leftJoin(
        orderPayments,
        and(
          eq(orderPayments.tenantId, listenerMessages.tenantId),
          eq(orderPayments.id, listenerMessages.paymentId),
        ),
      )
      .leftJoin(
        orders,
        and(
          eq(orders.tenantId, listenerMessages.tenantId),
          sql`${orders.id} = coalesce(${orderPayments.orderId}, ${paymentSessions.orderId})`,
        ),
      )
      .where(where)
      .orderBy(desc(listenerMessages.receivedAt), desc(listenerMessages.id))
      .limit(limit)
      .offset(offset);
    return rows.map((row) => ({
      ...row.message,
      order:
        row.orderId !== null && row.orderNumber !== null
          ? { id: row.orderId, orderNumber: row.orderNumber }
          : null,
    }));
  }
}
