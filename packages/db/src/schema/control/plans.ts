import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { PlanLimits } from '@lytronix/validators';
import { control, createdAt } from '../shared';

// The name of the free trial plan. Seeded by migration 0003; the tenancy repository finds it by this name.
export const TRIAL_PLAN_NAME = 'Trial';

// DATABASE-SCHEMA §2.3. Prices and billing terms are slice 2's own tables (plan-prices.ts, billing-terms.ts).
// Limits are data, never code.
export const plans = control.table(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'), // PLN-01
    rank: integer('rank').notNull(),
    forSale: boolean('for_sale').notNull().default(true),
    version: integer('version').notNull().default(1),
    limits: jsonb('limits').$type<PlanLimits>().notNull(),
    features: jsonb('features').$type<Record<string, boolean>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    // PLN-16: rank is unique among plans offered for sale.
    uniqueIndex('plans_rank_for_sale_idx')
      .on(t.rank)
      .where(sql`${t.forSale}`),
  ],
);

export type SelectPlan = typeof plans.$inferSelect;
export type InsertPlan = typeof plans.$inferInsert;
export type UpdatePlan = Partial<InsertPlan>;

// D2-3: a frozen copy of the plan row, inserted immediately before every update (PLN-02) -- not reconstructed
// from platform_audit_log's free-form summary field, since the editor needs to actually render a past version.
export const planVersions = control.table(
  'plan_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    version: integer('version').notNull(), // the version number this snapshot WAS, before the edit
    name: text('name').notNull(),
    description: text('description'),
    rank: integer('rank').notNull(),
    forSale: boolean('for_sale').notNull(),
    limits: jsonb('limits').$type<PlanLimits>().notNull(),
    features: jsonb('features').$type<Record<string, boolean>>().notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('plan_versions_plan_version_key').on(t.planId, t.version)],
);

export type SelectPlanVersion = typeof planVersions.$inferSelect;
export type InsertPlanVersion = typeof planVersions.$inferInsert;
