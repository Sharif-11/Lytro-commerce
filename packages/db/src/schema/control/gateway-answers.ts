import { index, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { GATEWAY_PAYMENT_ID_MAX_LENGTH, type GatewayAnswerAction } from '@lytronix/validators';
import { control } from '../shared';

// DAT-51, D9-16 (Phase 9 Slice 9.5): a wallet gateway sends Lytro no message of its own -- the shopper's return proves
// nothing (VER-08) -- so what stands for "the callback as received" is the gateway's own answer to each execute and query,
// kept as it arrived before anything is done with it. A shop's checkouts name the shop; Lytro's own name none, their
// payment being control.plan_payments' row. Removed at [90] days (RAW_MESSAGE_KEPT_DAYS); a shop's go with its data.
export const gatewayAnswers = control.table(
  'gateway_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The shop whose checkout it was; null for Lytro's own account.
    tenantId: uuid('tenant_id'),
    method: text('method').notNull(),
    action: text('action').$type<GatewayAnswerAction>().notNull(),
    // The payment it was asked about: a shop's payment session, or Lytro's plan payment.
    sessionId: uuid('session_id'),
    paymentId: varchar('payment_id', { length: GATEWAY_PAYMENT_ID_MAX_LENGTH }).notNull(),
    answer: text('answer').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    // DAT-52: the gateway's word on it, read once here so the reconciliation needn't read every answer: "Completed" or not.
    transactionStatus: varchar('transaction_status', { length: 40 }),
  },
  (t) => [
    index('gateway_answers_received_idx').on(t.receivedAt),
    index('gateway_answers_session_idx').on(t.sessionId, t.receivedAt),
    index('gateway_answers_tenant_idx').on(t.tenantId),
  ],
);

export type SelectGatewayAnswer = typeof gatewayAnswers.$inferSelect;
export type InsertGatewayAnswer = typeof gatewayAnswers.$inferInsert;
