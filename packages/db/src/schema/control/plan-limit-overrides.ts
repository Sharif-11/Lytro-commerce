import { jsonb, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { control } from '../shared';
import { tenants } from './tenancy';

// PLN-11: a per-tenant override of one limit key, with a required reason. Applied over the tenant's
// plan_snapshot when the app reads a limit; removing the row restores the snapshot value.
export const planLimitOverrides = control.table(
  'plan_limit_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    limitKey: text('limit_key').notNull(), // a key from PlanLimits, e.g. 'essential_sms_total'
    value: jsonb('value').notNull(),
    reason: text('reason').notNull(),
    setBy: uuid('set_by').notNull(), // operator account id
    setAt: timestamp('set_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('plan_limit_overrides_tenant_key_key').on(t.tenantId, t.limitKey)],
);

export type SelectPlanLimitOverride = typeof planLimitOverrides.$inferSelect;
export type InsertPlanLimitOverride = typeof planLimitOverrides.$inferInsert;
