import { index, integer, text, uuid } from 'drizzle-orm/pg-core';
import { SmsKind } from '@lytronix/validators';
import { control, createdAt } from '../shared';
import { tenants } from './tenancy';

// AUTH-21: one row per SMS actually counted against a tenant's free essential allowance -- today only
// SMS-18's shop-ready text (SmsKind.ShopReady). Sign-up/sign-in codes and lifecycle notices (SmsKind.Otp /
// SmsKind.LifecycleNotice) are platform cost and never write here (the LIF-10 carve-out). Read live via
// COUNT/SUM, never a denormalised running counter that would need its own monthly-reset job -- SMS volume
// per tenant is small at this platform's declared scale (ENGINEERING-STANDARDS.md §0: 500 tenants, one VPS).
export const essentialSmsUsage = control.table(
  'essential_sms_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    kind: text('kind').$type<SmsKind>().notNull(),
    parts: integer('parts').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('essential_sms_usage_tenant_idx').on(t.tenantId, t.createdAt)],
);

export type SelectEssentialSmsUsage = typeof essentialSmsUsage.$inferSelect;
export type InsertEssentialSmsUsage = typeof essentialSmsUsage.$inferInsert;
