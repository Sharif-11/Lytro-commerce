import { index, integer, text, uuid } from 'drizzle-orm/pg-core';
import { SmsKind } from '@lytronix/validators';
import { control, createdAt } from '../shared';
import { tenants } from './tenancy';

// AUTH-21, SMS-04: one row per SMS the free essential allowance paid for -- the shop's own sign-in codes and staff reset
// codes, as far as the allowance reaches (Slice 7.1, read agreed 2026-11-06). Sign-up codes, the shop-ready text and
// notices to a lapsed shop are platform cost and never write here (the LIF-10 carve-out). Counted in SMS-09's units,
// the same as charging (D7-13). Read live via SUM, never a denormalised running counter that would need its own
// monthly-reset job -- SMS volume per tenant is small at this platform's declared scale.
export const essentialSmsUsage = control.table(
  'essential_sms_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    kind: text('kind').$type<SmsKind>().notNull(),
    units: integer('units').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('essential_sms_usage_tenant_idx').on(t.tenantId, t.createdAt)],
);

export type SelectEssentialSmsUsage = typeof essentialSmsUsage.$inferSelect;
export type InsertEssentialSmsUsage = typeof essentialSmsUsage.$inferInsert;
