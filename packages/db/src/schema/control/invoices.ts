import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  integer,
  jsonb,
  numeric,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  InvoiceKind,
  InvoiceLineKind,
  type PlanLimits,
  type PlanPaymentMethod,
} from '@lytronix/validators';
import { control } from '../shared';
import { tenants } from './tenancy';

// DAT-07/BIL-12: a single platform-wide counter row, locked (`SELECT ... FOR UPDATE`) in the same transaction
// as the control.invoices insert that consumes it. A native sequence is deliberately not used -- DAT-07
// requires gap-free numbers, and a sequence would leave a gap on a rolled-back purchase.
export const invoiceCounters = control.table('invoice_counters', {
  id: smallint('id').primaryKey().default(1),
  // mode: 'number' -- invoice counts never approach Number.MAX_SAFE_INTEGER, and drizzle-kit cannot serialize
  // a BigInt default; the seed row (next_number = 1) is inserted by hand-written migration SQL instead.
  nextNumber: bigint('next_number', { mode: 'number' }).notNull(),
});

// BIL-12: one invoice per confirmed payment. plan_snapshot is a copy of the limits the tenant actually bought,
// not a live read of control.plans -- a later plan edit never changes what a past invoice shows.
export const invoices = control.table(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    number: bigint('number', { mode: 'number' }).notNull().unique(),
    kind: text('kind').$type<InvoiceKind>().notNull(),
    // Null on an add-on's own invoice (PLN-14), which names no plan.
    planSnapshot: jsonb('plan_snapshot').$type<PlanLimits>(),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    // UPG-03/UPG-15: the credit line on an upgrade invoice; zero for a purchase/renewal.
    creditAmount: numeric('credit_amount', { precision: 10, scale: 2 }).notNull().default('0'),
    billingTermLabel: text('billing_term_label'),
    // BIL-12: the rest of what the invoice states, copied at issue so a later rename, plan edit or deletion
    // never changes a past invoice (TRM-15's rule for the term label, applied to every field). Null only on
    // invoices issued before these columns existed.
    shopName: text('shop_name'),
    ownerName: text('owner_name'),
    planName: text('plan_name'),
    planVersion: integer('plan_version'),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    // TRM-12: the saving against the plan's shortest visible term, before any upgrade credit.
    discountAmount: numeric('discount_amount', { precision: 10, scale: 2 }).notNull().default('0'),
    paymentMethod: text('payment_method').$type<PlanPaymentMethod>(),
    // The wallet transaction ID; null for a payment from the balance.
    paymentReference: text('payment_reference'),
    // BIL-19: the payment this invoice is the receipt of, copied at issue like the rest -- a plain id, not a foreign key
    // (decided 2026-10-23), one invoice per payment. Null on invoices issued before it was recorded that no transaction
    // ID matched.
    planPaymentId: uuid('plan_payment_id'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'invoices_kind_check',
      sql`${t.kind} in (${sql.raw(
        Object.values(InvoiceKind)
          .map((v) => `'${v}'`)
          .join(','),
      )})`,
    ),
    uniqueIndex('invoices_plan_payment_id_idx')
      .on(t.planPaymentId)
      .where(sql`${t.planPaymentId} IS NOT NULL`),
  ],
);

// BIL-12, PLN-14: what an invoice is for, line by line -- the plan, each add-on, an upgrade's credit (negative) --
// copied at issue like the rest. Invoices issued before lines existed have none; their header says it all.
export const invoiceLines = control.table(
  'invoice_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    position: integer('position').notNull(),
    kind: text('kind').$type<InvoiceLineKind>().notNull(),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull().default(1),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  },
  (t) => [
    unique('invoice_lines_position_key').on(t.invoiceId, t.position),
    check(
      'invoice_lines_kind_check',
      sql`${t.kind} in (${sql.raw(
        Object.values(InvoiceLineKind)
          .map((v) => `'${v}'`)
          .join(','),
      )})`,
    ),
  ],
);

export type SelectInvoiceCounter = typeof invoiceCounters.$inferSelect;

export type SelectInvoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;
