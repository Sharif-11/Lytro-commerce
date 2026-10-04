import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../client';
import type { Executor } from '../../transactions';
import { smsOutbox } from '../../schema';

// SMS-18, D6: the outbox. A message is recorded in the same transaction as the change that caused it, then sent.
// Delivery status lets a failed send be retried without failing the request that caused it.

export interface NewSmsMessage {
  toPhone: string;
  kind: 'otp' | 'shop_ready';
  /** Null for otp: the code is never stored (AUTH-05). */
  body: string | null;
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

  async markSent(db: Executor, id: number, at: Date): Promise<void> {
    await db
      .update(smsOutbox)
      .set({ status: 'sent', sentAt: at, lastError: null })
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
        status: input.nextAttemptAt ? 'pending' : 'failed',
        attempts: input.attempts,
        lastError: input.error.slice(0, 500),
        nextAttemptAt: input.nextAttemptAt ?? new Date(),
      })
      .where(eq(smsOutbox.id, id));
  }
}
