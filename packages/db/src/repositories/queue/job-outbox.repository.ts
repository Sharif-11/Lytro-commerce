import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../client';
import { jobOutbox } from '../../schema';
import type { Executor, Transaction } from '../../transactions';

export interface ClaimedOutboxRow {
  id: number;
  queueName: string;
  payload: unknown;
  singletonKey: string | null;
}

// SCL-08, D25: the enqueue step's own atomicity boundary (see schema/control/queue.ts). A separate relay reads
// pending rows and hands them to pg-boss; this repository never talks to pg-boss itself.
export class JobOutboxRepository {
  async insert(
    tx: Transaction,
    values: { queueName: string; payload: unknown; singletonKey?: string },
  ): Promise<void> {
    await tx.insert(jobOutbox).values({
      queueName: values.queueName,
      payload: values.payload,
      singletonKey: values.singletonKey,
    });
  }

  /**
   * Leases rows that are due and not yet sent. One statement: rows another relay has locked are skipped
   * (SKIP LOCKED), so two relays never claim the same row. A crashed relay's claim is reclaimed once the lease
   * passes, since the row is still `sending`, not `sent` (same shape as the SMS outbox's own claimDue).
   */
  async claimDue(
    db: Database,
    input: { now: Date; leaseUntil: Date; limit: number },
  ): Promise<ClaimedOutboxRow[]> {
    // bigserial comes back from the pg driver as a string, so the raw row is typed that way and converted below.
    const result = await db.execute<{
      id: string;
      queue_name: string;
      payload: unknown;
      singleton_key: string | null;
    }>(sql`
      UPDATE control.job_outbox
      SET status = 'sending', lease_until = ${input.leaseUntil}
      WHERE id IN (
        SELECT id FROM control.job_outbox
        WHERE status = 'pending'
           OR (status = 'sending' AND (lease_until IS NULL OR lease_until <= ${input.now}))
        ORDER BY id
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, queue_name, payload, singleton_key
    `);
    return result.rows.map((row) => ({
      id: Number(row.id),
      queueName: row.queue_name,
      payload: row.payload,
      singletonKey: row.singleton_key,
    }));
  }

  async markSent(db: Executor, id: number, jobId: string | null): Promise<void> {
    await db
      .update(jobOutbox)
      .set({ status: 'sent', jobId, sentAt: new Date() })
      .where(eq(jobOutbox.id, id));
  }
}
