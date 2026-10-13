import { text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { control } from '../shared';
import { plans } from './plans';
import { tenants } from './tenancy';

// PLN-10/17/18: not-for-sale plans are ordinary rows in control.plans with for_sale = false, filtered
// server-side in every tenant-facing query; this table just records why/how one was assigned.
export const planAssignments = control.table('plan_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id),
  expiry: timestamp('expiry', { withTimezone: true }), // null = no expiry (PLN-18)
  reason: text('reason').notNull(),
  assignedBy: uuid('assigned_by').notNull(), // operator account id
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SelectPlanAssignment = typeof planAssignments.$inferSelect;
export type InsertPlanAssignment = typeof planAssignments.$inferInsert;
