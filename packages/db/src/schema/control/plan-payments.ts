import { sql } from 'drizzle-orm';
import { index, numeric, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { PlanPaymentKind, PlanPaymentStatus } from '@lytronix/validators';
import { control, createdAt } from '../shared';
import { billingTerms } from './billing-terms';
import { plans } from './plans';
import { tenants } from './tenancy';

// D2-1: a plan purchase, renewal, upgrade or balance top-up's confirmation row. Deliberately control-schema,
// not the tenant-schema tenant.payment_sessions/payments Phase 5 builds against tenant.orders -- a plan
// payment is the tenant paying the platform, not a shopper's checkout. Today's verified/rejected transition
// is an operator action (the /operator/payment-queue approve/reject pair) standing in for Phase 5's real
// hosted-page/gateway verification; only the confirmation trigger changes later, not this table's shape.
export const planPayments = control.table(
  'plan_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    kind: text('kind').$type<PlanPaymentKind>().notNull(),
    planId: uuid('plan_id').references(() => plans.id), // null for a top_up
    billingTermId: uuid('billing_term_id').references(() => billingTerms.id), // null for a top_up
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(), // BIL-09: the quoted price, held 30 min
    creditAmount: numeric('credit_amount', { precision: 10, scale: 2 }).notNull().default('0'),
    quotedAt: timestamp('quoted_at', { withTimezone: true }).notNull().defaultNow(),
    status: text('status').$type<PlanPaymentStatus>().notNull().default(PlanPaymentStatus.Pending),
    senderNumber: text('sender_number'),
    transactionId: text('transaction_id'),
    verifiedBy: uuid('verified_by'), // operator account id
    // When it was decided: approved, paid from the balance, or rejected (BIL-19 reads it as the decision's time).
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    // BIL-19: when the shop submitted its transaction ID, and the operator's note on a rejection (ADM-06).
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('plan_payments_transaction_id_idx')
      .on(t.transactionId)
      .where(sql`${t.transactionId} is not null`),
    // BIL-19: a shop's payments, newest first.
    index('plan_payments_tenant_quoted_idx').on(t.tenantId, t.quotedAt),
  ],
);

export type SelectPlanPayment = typeof planPayments.$inferSelect;
export type InsertPlanPayment = typeof planPayments.$inferInsert;

// BIL-07/BAL-05/PAY-16: a transaction ID, once used anywhere on the platform, is unusable forever -- even
// after the tenant that first used it is hard-deleted (LIF-19), so this table is append-only and excluded
// from tenant deletion (DAT-15). tenant_id is kept for audit only, deliberately not a foreign key.
export const usedTransactionIds = control.table('used_transaction_ids', {
  transactionId: text('transaction_id').primaryKey(),
  firstUsedAt: timestamp('first_used_at', { withTimezone: true }).notNull().defaultNow(),
  tenantId: uuid('tenant_id').notNull(),
});

export type SelectUsedTransactionId = typeof usedTransactionIds.$inferSelect;
export type InsertUsedTransactionId = typeof usedTransactionIds.$inferInsert;
