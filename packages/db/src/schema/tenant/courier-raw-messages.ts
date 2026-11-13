import { sql } from 'drizzle-orm';
import { index, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { RawMessageOutcome, type CourierKey } from '@lytronix/validators';
import { tenant } from '../shared';

// DAT-51, D9-16 (Phase 9 Slice 9.5): every verified courier message kept as it arrived, before it is read, so a message
// lost to a failover or a reading Lytro couldn't make is still there to read again. Only the headers a courier's message
// is read by are kept, never a token or signature. An unverified message keeps no body (CRR-11's count of bad
// signatures is all of it). Removed at [90] days (RAW_MESSAGE_KEPT_DAYS); a shop's go with its data (LIF-19).
export const courierRawMessages = tenant.table(
  'courier_raw_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    courierKey: text('courier_key').$type<CourierKey>().notNull(),
    body: text('body').notNull(),
    headers: jsonb('headers').$type<Record<string, string>>().notNull().default({}),
    outcome: text('outcome')
      .$type<RawMessageOutcome>()
      .notNull()
      .default(RawMessageOutcome.Received),
    // The news it gave, once read; none when it repeated news already held, or couldn't be read.
    eventId: uuid('event_id'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('courier_raw_messages_tenant_received_idx').on(t.tenantId, t.receivedAt),
    // DAT-52: the reconciliation's look at messages that couldn't be read.
    index('courier_raw_messages_unread_idx')
      .on(t.tenantId, t.receivedAt)
      .where(sql`${t.outcome} <> 'read'`),
  ],
);

export type SelectCourierRawMessage = typeof courierRawMessages.$inferSelect;
export type InsertCourierRawMessage = typeof courierRawMessages.$inferInsert;
