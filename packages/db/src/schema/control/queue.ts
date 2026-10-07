import { bigserial, integer, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { control, createdAt } from '../shared';

/**
 * SCL-08, D25: the enqueue step's atomicity boundary. A row here commits in the same transaction as the business
 * write that caused it (ordinary Drizzle, no private driver access needed). A relay then calls pg-boss's `send()`
 * for each new row — pg-boss owns everything from there (retries, policy, dead-letter). This table is not the
 * queue itself; it only bridges "enqueue this" into pg-boss's own schema, which this codebase never reads or
 * writes directly outside the relay (SCL-08's "one queue interface").
 */
export const jobOutbox = control.table('job_outbox', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  queueName: text('queue_name').notNull(),
  payload: jsonb('payload').notNull(),
  // De-dupes a relay retry against pg-boss's own singletonKey; null when the job allows duplicates.
  singletonKey: uuid('singleton_key'),
  // Per-job pg-boss send() options the relay forwards as-is; null keeps pg-boss's own queue-level defaults
  // (D27: an OTP retry bounds expireInSeconds to what's left of the code's TTL, which varies per job).
  expireInSeconds: integer('expire_in_seconds'),
  retryLimit: integer('retry_limit'),
  retryDelay: integer('retry_delay'),
  status: text('status').notNull().default('pending'), // pending | sending | sent
  // Set when a relay claims the row, so a crashed relay's claim is reclaimed once the lease passes.
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  jobId: text('job_id'), // pg-boss's id, set once send() succeeds
  createdAt: createdAt(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});

export type SelectJobOutbox = typeof jobOutbox.$inferSelect;
export type InsertJobOutbox = typeof jobOutbox.$inferInsert;
export type UpdateJobOutbox = Partial<InsertJobOutbox>;
