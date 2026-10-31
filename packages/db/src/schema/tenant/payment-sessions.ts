import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  enumTuple,
  PAYMENT_NOTE_MAX_LENGTH,
  PAYMENT_RETURN_URL_MAX_LENGTH,
  PaymentRejectReason,
  PaymentSessionSource,
  PaymentSessionState,
  TRANSACTION_ID_MAX_LENGTH,
} from '@lytronix/validators';
import { createdAt, tenant } from '../shared';
import { orders, paymentMethod } from './orders';

export const paymentSessionState = tenant.enum(
  'payment_session_state',
  enumTuple(Object.values(PaymentSessionState)),
);
export const paymentSessionSource = tenant.enum(
  'payment_session_source',
  enumTuple(Object.values(PaymentSessionSource)),
);
export const paymentRejectReason = tenant.enum(
  'payment_reject_reason',
  enumTuple(Object.values(PaymentRejectReason)),
);

/** PAY-05: the account a shopper says they paid into, as it stood when they typed the transaction ID. */
export interface PaidToSnapshot {
  accountId: string;
  accountName: string;
  number: string | null;
  bankName: string | null;
  accountNumber: string | null;
}

// PAY-01 to PAY-08 (Phase 5 Slice 5.2, agreed 2026-10-31): one attempt to pay an order on the payment page, always for
// a Lytro order, its amount set by the server -- the advance at checkout, what is due for a staff link. Made awaiting
// payment for the session's lifetime (PAY-03); a transaction ID typed in time moves it to checking, where it waits for
// verification (D5-5). An order has at most one open session. Its reference is the page's address
// (control.payment_session_refs). RLS like every tenant table.
export const paymentSessions = tenant.table(
  'payment_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    ref: varchar('ref', { length: 32 }).notNull(),
    orderId: uuid('order_id').notNull(),
    source: paymentSessionSource('source').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    // The method chosen at checkout, then the one paid by; null while the shopper is still to choose.
    method: paymentMethod('method'),
    returnUrl: varchar('return_url', { length: PAYMENT_RETURN_URL_MAX_LENGTH }),
    cancelUrl: varchar('cancel_url', { length: PAYMENT_RETURN_URL_MAX_LENGTH }),
    state: paymentSessionState('state').notNull().default(PaymentSessionState.AwaitingPayment),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // PAY-07: what the shopper typed, the transaction ID in capitals.
    transactionId: varchar('transaction_id', { length: TRANSACTION_ID_MAX_LENGTH }),
    senderNumber: varchar('sender_number', { length: 11 }),
    paidTo: jsonb('paid_to').$type<PaidToSnapshot>(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    // VER-01, PAY-14 (Slice 5.3): who verified or rejected it, and when; a rejection's reason, shown to the shopper.
    decidedBy: uuid('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    rejectReason: paymentRejectReason('reject_reason'),
    rejectNote: varchar('reject_note', { length: PAYMENT_NOTE_MAX_LENGTH }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('payment_sessions_tenant_id_key').on(t.tenantId, t.id),
    uniqueIndex('payment_sessions_ref_key').on(t.ref),
    // One open session an order: a new one waits until the last is paid, expired or cancelled.
    uniqueIndex('payment_sessions_open_key')
      .on(t.tenantId, t.orderId)
      .where(sql`${t.state} IN ('awaiting_payment', 'checking', 'needs_review')`),
    // The minute pass: sessions still awaiting payment, by when they run out.
    index('payment_sessions_expiry_idx')
      .on(t.tenantId, t.expiresAt)
      .where(sql`${t.state} = 'awaiting_payment'`),
    foreignKey({
      name: 'payment_sessions_order_fk',
      columns: [t.tenantId, t.orderId],
      foreignColumns: [orders.tenantId, orders.id],
    }).onDelete('cascade'),
    check('payment_sessions_amount_check', sql`${t.amount} > 0`),
    check(
      'payment_sessions_submitted_check',
      sql`(${t.transactionId} IS NULL) = (${t.submittedAt} IS NULL)
        AND (${t.state} <> 'checking' OR ${t.transactionId} IS NOT NULL)`,
    ),
  ],
);

export type SelectPaymentSession = typeof paymentSessions.$inferSelect;
export type InsertPaymentSession = typeof paymentSessions.$inferInsert;
