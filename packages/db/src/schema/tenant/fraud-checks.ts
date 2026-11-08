import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { FraudCheckTrigger, FraudSkipReason, FraudSourceState } from '@lytronix/validators';
import { createdAt, tenant } from '../shared';
import { orders } from './orders';

function listed(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(',');
}

// FRD-01 to FRD-04, FRD-11 (Phase 7 Slice 7.5, read agreed 2026-11-07): one row for each check of a phone, by staff or
// on a new cash-on-delivery order. Figures only (D7-48): Steadfast's percentages, the size of its record and merchants'
// reports, and the shop's own counts -- never Steadfast's raw answer (FRD-04). A Steadfast answer is reused for three
// days (FRD-04): a check within them copies the figures and names the check it took them from.
export const fraudChecks = tenant.table(
  'fraud_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    // The local form, 01XXXXXXXXX (FRD-01).
    phone: varchar('phone', { length: 11 }).notNull(),
    trigger: text('trigger').$type<FraudCheckTrigger>().notNull(),
    // FRD-05: the order a check ran for; null for a check staff ran. An order deleted (ORD-12) leaves its
    // check with no order.
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    // The staff member who ran it; null for the owner's own session (AUD-02) and for a check on a new order.
    userId: uuid('user_id'),
    // FRD-11: what Steadfast did for this check.
    steadfastState: text('steadfast_state').$type<FraudSourceState>().notNull(),
    // FRD-04: the check whose Steadfast figures this one reused, within three days; null for one that asked.
    steadfastFrom: uuid('steadfast_from'),
    // D7-52: Steadfast gives whole percentages, not counts; null where it has no record.
    steadfastDeliveredPercent: smallint('steadfast_delivered_percent'),
    steadfastCancelledPercent: smallint('steadfast_cancelled_percent'),
    steadfastReturnedPercent: smallint('steadfast_returned_percent'),
    // Steadfast's own size of the record (none, low, medium, ...) and the figure it gives with it, as given.
    steadfastVolumeBand: varchar('steadfast_volume_band', { length: 20 }),
    steadfastVolumeRange: varchar('steadfast_volume_range', { length: 20 }),
    // Merchants' fraud reports of this phone at Steadfast.
    steadfastReports: integer('steadfast_reports'),
    steadfastDoubtful: boolean('steadfast_doubtful'),
    steadfastCategories: jsonb('steadfast_categories').$type<string[]>(),
    // D7-49: the shop's own finished orders with this phone, when the check ran.
    ownDelivered: integer('own_delivered').notNull(),
    ownReturned: integer('own_returned').notNull(),
    ownCancelled: integer('own_cancelled').notNull(),
    // FRD-03, D7-7: what the balance paid, at the fraud-check rate (zero at launch).
    cost: numeric('cost', { precision: 10, scale: 2 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('fraud_checks_phone_idx').on(t.tenantId, t.phone, t.createdAt),
    index('fraud_checks_order_idx').on(t.orderId),
    check('fraud_checks_phone_check', sql`${t.phone} ~ '^01[3-9][0-9]{8}$'`),
    check(
      'fraud_checks_trigger_check',
      sql`${t.trigger} in (${sql.raw(listed(Object.values(FraudCheckTrigger)))})`,
    ),
    check(
      'fraud_checks_steadfast_state_check',
      sql`${t.steadfastState} in (${sql.raw(listed(Object.values(FraudSourceState)))})`,
    ),
    check(
      'fraud_checks_counts_check',
      sql`${t.ownDelivered} >= 0 AND ${t.ownReturned} >= 0 AND ${t.ownCancelled} >= 0 AND ${t.cost} >= 0`,
    ),
    // Only an answer has figures, and only an answer can be reused.
    check(
      'fraud_checks_answered_check',
      sql`(${t.steadfastState} = 'answered') = (${t.steadfastReports} IS NOT NULL)
        AND (${t.steadfastFrom} IS NULL OR ${t.steadfastState} = 'answered')`,
    ),
  ],
);

export type SelectFraudCheck = typeof fraudChecks.$inferSelect;
export type InsertFraudCheck = typeof fraudChecks.$inferInsert;

// FRD-05, D7-50 (Slice 7.5's read, 2026-11-07): a shop's automatic check, a row once the owner changes it. Without one,
// every new cash-on-delivery order is checked, whatever its amount.
export const fraudRules = tenant.table(
  'fraud_rules',
  {
    tenantId: uuid('tenant_id').primaryKey(),
    codOrders: boolean('cod_orders').notNull(),
    // Only orders collecting at least this much on delivery are checked; null for every one.
    minAmount: numeric('min_amount', { precision: 12, scale: 2 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('fraud_rules_amount_check', sql`${t.minAmount} IS NULL OR ${t.minAmount} >= 0`)],
);

export type SelectFraudRule = typeof fraudRules.$inferSelect;

// FRD-05 (Phase 7 Slice 7.7): a new order's automatic check that didn't run, and why, written when its job ran, so the
// order's page says so as it was -- the smallest amount as the rule had it then, and a refusal's own words. One per
// order; an order with neither a check nor a skip is still being checked.
export const fraudCheckSkips = tenant.table(
  'fraud_check_skips',
  {
    tenantId: uuid('tenant_id').notNull(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    reason: text('reason').$type<FraudSkipReason>().notNull(),
    // The rule's smallest amount when the order was under it.
    minAmount: numeric('min_amount', { precision: 12, scale: 2 }),
    // A refusal's message key, worded in the reader's language when the page reads it.
    messageKey: text('message_key'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.orderId] }),
    check(
      'fraud_check_skips_reason_check',
      sql`${t.reason} in (${sql.raw(listed(Object.values(FraudSkipReason)))})`,
    ),
  ],
);

export type SelectFraudCheckSkip = typeof fraudCheckSkips.$inferSelect;
