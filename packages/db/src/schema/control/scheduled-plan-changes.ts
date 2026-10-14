import { text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { ScheduledPlanChangeKind } from '@lytronix/validators';
import { control, createdAt } from '../shared';
import { plans } from './plans';
import { tenants } from './tenancy';

// DWN-01/UPG-08's pattern: a downgrade the owner has committed to, taking effect at the end of the current
// paid period (`effective_at`). No price, no billing term -- a downgrade schedules a *plan*, not a priced
// purchase; the term is chosen later, the normal way, at whatever renewal actually happens after the switch.
// `kind` already anticipates PYG-10's later reuse (switching to pay-as-you-go follows the same timing rule),
// so no second migration is needed when that lands. One row per tenant -- a second `schedule()` call upserts
// rather than requiring an explicit cancel first.
export const scheduledPlanChanges = control.table('scheduled_plan_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .unique()
    .references(() => tenants.id),
  kind: text('kind').$type<ScheduledPlanChangeKind>().notNull(),
  targetPlanId: uuid('target_plan_id').references(() => plans.id),
  effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export type SelectScheduledPlanChange = typeof scheduledPlanChanges.$inferSelect;
export type InsertScheduledPlanChange = typeof scheduledPlanChanges.$inferInsert;
