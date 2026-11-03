import { and, count, desc, eq, gte, inArray, isNotNull, lt, sql, type SQL } from 'drizzle-orm';
import {
  ListenerMessageStatus,
  type ListenerIgnoredReason,
  type PaymentMethod,
  type PaymentReviewReason,
} from '@lytronix/validators';
import { lytroListenerMessages, type SelectLytroListenerMessage } from '../../schema';
import type { Executor, Transaction } from '../../transactions';
import { escapeLike } from '../like';

/** PAY-21: a message Lytro's own phone forwarded, as it is kept. */
export interface NewLytroMessage {
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

// The one row that holds a transaction ID stands in one of these.
const HOLDING = [
  ListenerMessageStatus.Matched,
  ListenerMessageStatus.Unmatched,
  ListenerMessageStatus.NeedsReview,
];

// PAY-21, D5-3 (Phase 5 Slice 5.6, read agreed 2026-11-03): what Lytro's own phones forwarded, in control, as sellers' payments
// to Lytro are. Each method works as tenant.listener_messages' does for a shop.
export class LytroMessageRepository {
  /** VER-03, VER-04: the ID held until the transaction ends, so a receipt and a seller typing it take turns. */
  async holdTransactionId(tx: Transaction, transactionId: string): Promise<void> {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`lytro-listener:${transactionId}`}, 0))`,
    );
  }

  async holderOf(
    tx: Transaction,
    transactionId: string,
  ): Promise<SelectLytroListenerMessage | null> {
    const [row] = await tx
      .select()
      .from(lytroListenerMessages)
      .where(
        and(
          eq(lytroListenerMessages.transactionId, transactionId),
          inArray(lytroListenerMessages.status, HOLDING),
        ),
      );
    return row ?? null;
  }

  async ofPhone(
    tx: Transaction,
    deviceId: string,
    transactionId: string,
  ): Promise<SelectLytroListenerMessage | null> {
    const [row] = await tx
      .select()
      .from(lytroListenerMessages)
      .where(
        and(
          eq(lytroListenerMessages.deviceId, deviceId),
          eq(lytroListenerMessages.transactionId, transactionId),
          sql`${lytroListenerMessages.status} <> ${ListenerMessageStatus.Ignored}`,
        ),
      );
    return row ?? null;
  }

  async insert(db: Executor, values: NewLytroMessage): Promise<SelectLytroListenerMessage> {
    const [row] = await db.insert(lytroListenerMessages).values(values).returning();
    if (!row) throw new Error('insert returned no listener message');
    return row;
  }

  async settle(
    tx: Transaction,
    id: string,
    outcome: {
      status: ListenerMessageStatus;
      reviewReason: PaymentReviewReason | null;
      planPaymentId: string | null;
    },
  ): Promise<SelectLytroListenerMessage> {
    const [row] = await tx
      .update(lytroListenerMessages)
      .set({ ...outcome, updatedAt: new Date() })
      .where(eq(lytroListenerMessages.id, id))
      .returning();
    if (!row) throw new Error('update returned no listener message');
    return row;
  }

  /** ADM-06 (Slice 5.6): however a seller's payment came to be verified, the receipt holding its ID is used. */
  async markUsed(db: Executor, transactionId: string, planPaymentId: string): Promise<void> {
    await db
      .update(lytroListenerMessages)
      .set({
        status: ListenerMessageStatus.Matched,
        reviewReason: null,
        planPaymentId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lytroListenerMessages.transactionId, transactionId),
          inArray(lytroListenerMessages.status, HOLDING),
        ),
      );
  }

  /** ADM-06 (Slice 5.6): the operator turned the payment down, so the receipt that claimed it is unclaimed again. */
  async releaseOfPayment(db: Executor, planPaymentId: string): Promise<void> {
    await db
      .update(lytroListenerMessages)
      .set({
        status: ListenerMessageStatus.Unmatched,
        reviewReason: null,
        planPaymentId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lytroListenerMessages.planPaymentId, planPaymentId),
          eq(lytroListenerMessages.status, ListenerMessageStatus.NeedsReview),
        ),
      );
  }

  /** The app's home screen: this phone's newest messages -- receipts, and what test mode read. */
  async recent(
    db: Executor,
    deviceId: string,
    limit: number,
  ): Promise<SelectLytroListenerMessage[]> {
    return db
      .select()
      .from(lytroListenerMessages)
      .where(
        and(
          eq(lytroListenerMessages.deviceId, deviceId),
          sql`(${lytroListenerMessages.status} <> ${ListenerMessageStatus.Ignored}
               OR ${lytroListenerMessages.ignoredReason} = 'test_mode')`,
        ),
      )
      .orderBy(desc(lytroListenerMessages.receivedAt), desc(lytroListenerMessages.id))
      .limit(limit);
  }

  async counts(
    db: Executor,
    deviceId: string,
    since: Date,
  ): Promise<{ verified: number; waiting: number; toCheck: number }> {
    const rows = await db
      .select({ status: lytroListenerMessages.status, total: count() })
      .from(lytroListenerMessages)
      .where(
        and(
          eq(lytroListenerMessages.deviceId, deviceId),
          gte(lytroListenerMessages.receivedAt, since),
        ),
      )
      .groupBy(lytroListenerMessages.status);
    const of = (status: ListenerMessageStatus): number =>
      rows.find((row) => row.status === status)?.total ?? 0;
    return {
      verified: of(ListenerMessageStatus.Matched),
      waiting: of(ListenerMessageStatus.Unmatched),
      toCheck: of(ListenerMessageStatus.NeedsReview),
    };
  }

  /** The receipts the operator reads and searches, newest first; what verifies nothing stays out. */
  async list(
    db: Executor,
    filter: { status?: ListenerMessageStatus; search: string | null },
    page: { offset: number; limit: number },
  ): Promise<{ rows: SelectLytroListenerMessage[]; total: number }> {
    const start = filter.search === null ? null : `${escapeLike(filter.search)}%`;
    const where: SQL | undefined = and(
      filter.status !== undefined
        ? eq(lytroListenerMessages.status, filter.status)
        : inArray(lytroListenerMessages.status, HOLDING),
      start === null
        ? undefined
        : sql`(${lytroListenerMessages.transactionId} ILIKE ${start}
               OR ${lytroListenerMessages.senderNumber} ILIKE ${start}
               OR ${lytroListenerMessages.amount}::text ILIKE ${start})`,
    );
    const [totals] = await db.select({ total: count() }).from(lytroListenerMessages).where(where);
    const rows = await db
      .select()
      .from(lytroListenerMessages)
      .where(where)
      .orderBy(desc(lytroListenerMessages.receivedAt), desc(lytroListenerMessages.id))
      .limit(page.limit)
      .offset(page.offset);
    return { rows, total: totals?.total ?? 0 };
  }

  /** LSN-17: text past its days redacted, the rest of the row kept; what verifies nothing has no use past them. */
  async redact(db: Executor, before: Date): Promise<{ redacted: number; removed: number }> {
    const redacted = await db
      .update(lytroListenerMessages)
      .set({ rawText: null, updatedAt: new Date() })
      .where(
        and(isNotNull(lytroListenerMessages.rawText), lt(lytroListenerMessages.receivedAt, before)),
      )
      .returning({ id: lytroListenerMessages.id });
    const removed = await db
      .delete(lytroListenerMessages)
      .where(
        and(
          inArray(lytroListenerMessages.status, [
            ListenerMessageStatus.Ignored,
            ListenerMessageStatus.Duplicate,
          ]),
          lt(lytroListenerMessages.receivedAt, before),
        ),
      )
      .returning({ id: lytroListenerMessages.id });
    return { redacted: redacted.length, removed: removed.length };
  }
}
