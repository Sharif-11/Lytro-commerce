import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { Database } from '../../client';
import type { Executor } from '../../transactions';
import { smsOutbox } from '../../schema';
import { SmsKind, SmsStatus } from '@lytronix/validators';

// SMS-18, D6: the outbox. A message is recorded in the same transaction as the change that caused it, then sent.
// Delivery status lets a failed send be retried without failing the request that caused it.

export interface NewSmsMessage {
  toPhone: string;
  kind: SmsKind;
  /** Null for otp: the code is never stored (AUTH-05). */
  body: string | null;
  /** D8-30: the shop the message is for, when it names one. */
  tenantId?: string | null;
}

/** ADM-03, D8-30: which of Lytro's messages are a shop's: those naming it, and the sign-in codes to its team's phones. */
export interface ShopMessages {
  tenantId: string;
  phones: readonly string[];
}

/** ADM-03: one of Lytro's own messages that never went, as the operator's shop page lists it. */
export interface FailedSmsRow {
  id: number;
  kind: string;
  toPhone: string;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
}

export interface ClaimedSmsMessage {
  id: number;
  toPhone: string;
  kind: string;
  body: string;
  attempts: number;
}

export class SmsRepository {
  async insert(db: Executor, message: NewSmsMessage): Promise<number> {
    const [row] = await db.insert(smsOutbox).values(message).returning({ id: smsOutbox.id });
    if (!row) throw new Error('insert returned no outbox row');
    return row.id;
  }

  /**
   * Leases messages that are due and not yet sent. One statement: rows another sender has locked are skipped
   * (SKIP LOCKED), so two senders never claim the same message. `onlyId` claims one specific message.
   */
  async claimDue(
    db: Database,
    input: { now: Date; leaseUntil: Date; limit: number; onlyId?: number },
  ): Promise<ClaimedSmsMessage[]> {
    const onlyId = input.onlyId ?? null;
    // bigserial comes back from the pg driver as a string, so the raw row is typed that way and converted below.
    const result = await db.execute<{
      id: string;
      to_phone: string;
      kind: string;
      body: string;
      attempts: number;
    }>(sql`
      UPDATE control.sms_outbox
      SET status = 'sending', next_attempt_at = ${input.leaseUntil}
      WHERE id IN (
        SELECT id FROM control.sms_outbox
        WHERE status IN ('pending', 'sending')
          AND body IS NOT NULL
          AND next_attempt_at <= ${input.now}
          AND (${onlyId}::bigint IS NULL OR id = ${onlyId})
        ORDER BY id
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, to_phone, kind, body, attempts
    `);
    return result.rows.map((row) => ({
      id: Number(row.id),
      toPhone: row.to_phone,
      kind: row.kind,
      body: row.body,
      attempts: row.attempts,
    }));
  }

  /** ADM-03, D8-30: how many of the shop's messages failed for good since `since`. */
  async countFailedForShop(db: Executor, shop: ShopMessages, since: Date): Promise<number> {
    const [row] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(smsOutbox)
      .where(and(this.failedFor(shop), gte(smsOutbox.createdAt, since)));
    return row?.value ?? 0;
  }

  /** ADM-03, D8-30: the shop's messages that failed for good, newest first, after `beforeId` when given. */
  async failedForShop(
    db: Executor,
    shop: ShopMessages,
    beforeId: number | null,
    limit: number,
  ): Promise<FailedSmsRow[]> {
    return db
      .select({
        id: smsOutbox.id,
        kind: smsOutbox.kind,
        toPhone: smsOutbox.toPhone,
        attempts: smsOutbox.attempts,
        lastError: smsOutbox.lastError,
        createdAt: smsOutbox.createdAt,
      })
      .from(smsOutbox)
      .where(and(this.failedFor(shop), beforeId === null ? undefined : lt(smsOutbox.id, beforeId)))
      .orderBy(desc(smsOutbox.id))
      .limit(limit);
  }

  private failedFor(shop: ShopMessages) {
    return and(
      eq(smsOutbox.status, SmsStatus.Failed),
      or(
        eq(smsOutbox.tenantId, shop.tenantId),
        shop.phones.length === 0
          ? undefined
          : and(
              isNull(smsOutbox.tenantId),
              eq(smsOutbox.kind, SmsKind.Otp),
              inArray(smsOutbox.toPhone, [...shop.phones]),
            ),
      ),
    );
  }

  async markSent(db: Executor, id: number, at: Date): Promise<void> {
    await db
      .update(smsOutbox)
      .set({ status: SmsStatus.Sent, sentAt: at, lastError: null })
      .where(eq(smsOutbox.id, id));
  }

  /** A failed attempt. With a retry time the message waits; without one it is final and marked failed. */
  async markFailed(
    db: Executor,
    id: number,
    input: { error: string; attempts: number; nextAttemptAt: Date | null },
  ): Promise<void> {
    await db
      .update(smsOutbox)
      .set({
        status: input.nextAttemptAt ? SmsStatus.Pending : SmsStatus.Failed,
        attempts: input.attempts,
        lastError: input.error.slice(0, 500),
        nextAttemptAt: input.nextAttemptAt ?? new Date(),
      })
      .where(eq(smsOutbox.id, id));
  }
}
