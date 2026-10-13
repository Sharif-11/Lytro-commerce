import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  numeric,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { control, createdAt } from '../shared';
import { plans } from './plans';
import { tenants } from './tenancy';

// DATABASE-SCHEMA §2.3. TRM-01: a billing term is a record, not code, so durations can be added or removed
// without a deploy.
export const billingTerms = control.table(
  'billing_terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    labelBn: text('label_bn').notNull(),
    labelEn: text('label_en').notNull(),
    months: integer('months').notNull(),
    visible: boolean('visible').notNull().default(true),
    displayOrder: integer('display_order').notNull().default(0),
    defaultDiscountPct: numeric('default_discount_pct', { precision: 5, scale: 2 }),
    // TRM-14: null = platform-wide (the normal case); set = visible to exactly one tenant.
    tenantId: uuid('tenant_id').references(() => tenants.id),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check('billing_terms_months_check', sql`${t.months} BETWEEN 1 AND 60`)], // TRM-01
);

export type SelectBillingTerm = typeof billingTerms.$inferSelect;
export type InsertBillingTerm = typeof billingTerms.$inferInsert;
export type UpdateBillingTerm = Partial<InsertBillingTerm>;

// TRM-03: the price of each plan for each term, stored explicitly -- a term's discount percent only pre-fills
// this in the editor and never overrides an edited price.
export const planPrices = control.table(
  'plan_prices',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    billingTermId: uuid('billing_term_id')
      .notNull()
      .references(() => billingTerms.id),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.planId, t.billingTermId] })],
);

export type SelectPlanPrice = typeof planPrices.$inferSelect;
export type InsertPlanPrice = typeof planPrices.$inferInsert;
