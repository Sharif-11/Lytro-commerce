import { sql } from 'drizzle-orm';
import { index, numeric, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import {
  enumTuple,
  LISTENER_SENDER_MAX_LENGTH,
  ListenerIgnoredReason,
  ListenerMessageStatus,
  PaymentReviewReason,
  TRANSACTION_ID_MAX_LENGTH,
} from '@lytronix/validators';
import { createdAt, tenant } from '../shared';
import { paymentMethod } from './orders';

export const listenerMessageStatus = tenant.enum(
  'listener_message_status',
  enumTuple(Object.values(ListenerMessageStatus)),
);
export const listenerIgnoredReason = tenant.enum(
  'listener_ignored_reason',
  enumTuple(Object.values(ListenerIgnoredReason)),
);
export const paymentReviewReason = tenant.enum(
  'payment_review_reason',
  enumTuple(Object.values(PaymentReviewReason)),
);

// VER-02 to VER-06, LSN-13 to LSN-17 (Phase 5 Slice 5.4b, read agreed 2026-11-02): what a shop's listener phones forwarded.
// A receipt keeps its text until it is redacted at [90] days; a message that verifies nothing never keeps any (VER-06,
// LSN-16). One row holds each transaction ID for the shop -- the first to arrive; another phone's copy is a `duplicate`,
// and a phone sending its own again adds nothing. Its phone may be purged before it (LSN-05), so no foreign key across
// schemas. RLS like every tenant table.
export const listenerMessages = tenant.table(
  'listener_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    deviceId: uuid('device_id').notNull(),
    sender: varchar('sender', { length: LISTENER_SENDER_MAX_LENGTH }).notNull(),
    // What the parser read; null for a message it could not.
    method: paymentMethod('method'),
    transactionId: varchar('transaction_id', { length: TRANSACTION_ID_MAX_LENGTH }),
    amount: numeric('amount', { precision: 12, scale: 2 }),
    senderNumber: varchar('sender_number', { length: 11 }),
    rawText: text('raw_text'),
    status: listenerMessageStatus('status').notNull(),
    ignoredReason: listenerIgnoredReason('ignored_reason'),
    reviewReason: paymentReviewReason('review_reason'),
    // The session it claims or settled, and the payment it became.
    sessionId: uuid('session_id'),
    paymentId: uuid('payment_id'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // VER-03: the one row that holds a transaction ID for the shop.
    uniqueIndex('listener_messages_holder_key')
      .on(t.tenantId, t.transactionId)
      .where(sql`${t.status} IN ('matched', 'unmatched', 'needs_review')`),
    // A phone sending the same receipt again adds nothing.
    uniqueIndex('listener_messages_phone_key')
      .on(t.tenantId, t.deviceId, t.transactionId)
      .where(sql`${t.status} <> 'ignored'`),
    // The app's recent receipts, a phone's own.
    index('listener_messages_device_idx').on(t.tenantId, t.deviceId, t.receivedAt),
    // Staff's list.
    index('listener_messages_status_idx').on(t.tenantId, t.status, t.receivedAt),
    index('listener_messages_session_idx')
      .on(t.tenantId, t.sessionId)
      .where(sql`${t.sessionId} IS NOT NULL`),
    index('listener_messages_payment_idx')
      .on(t.tenantId, t.paymentId)
      .where(sql`${t.paymentId} IS NOT NULL`),
    // LSN-17: text still to be redacted.
    index('listener_messages_text_idx')
      .on(t.tenantId, t.receivedAt)
      .where(sql`${t.rawText} IS NOT NULL`),
  ],
);

export type SelectListenerMessage = typeof listenerMessages.$inferSelect;
export type InsertListenerMessage = typeof listenerMessages.$inferInsert;
