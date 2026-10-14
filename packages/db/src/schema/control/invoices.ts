import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  jsonb,
  numeric,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { InvoiceKind, type PlanLimits } from '@lytronix/validators';
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
    planSnapshot: jsonb('plan_snapshot').$type<PlanLimits>().notNull(),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    // UPG-03/UPG-15: the credit line on an upgrade invoice; zero for a purchase/renewal.
    creditAmount: numeric('credit_amount', { precision: 10, scale: 2 }).notNull().default('0'),
    billingTermLabel: text('billing_term_label').notNull(),
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
  ],
);

export type SelectInvoiceCounter = typeof invoiceCounters.$inferSelect;

export type SelectInvoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;
