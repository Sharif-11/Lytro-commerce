import { sql } from 'drizzle-orm';
import { boolean, integer, jsonb, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { PlanLimits } from '@lytronix/validators';
import { control, createdAt } from '../shared';

// The name of the free trial plan. Seeded by migration 0003; the tenancy repository finds it by this name.
export const TRIAL_PLAN_NAME = 'Trial';

// DATABASE-SCHEMA §2.3, minimal per decision D3. Prices and billing terms arrive in Phase 2.
// Limits are data, never code.
export const plans = control.table(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    rank: integer('rank').notNull(),
    forSale: boolean('for_sale').notNull().default(true),
    version: integer('version').notNull().default(1),
    limits: jsonb('limits').$type<PlanLimits>().notNull(),
    features: jsonb('features').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    // PLN-16: rank is unique among plans offered for sale.
    uniqueIndex('plans_rank_for_sale_idx')
      .on(t.rank)
      .where(sql`${t.forSale}`),
  ],
);
