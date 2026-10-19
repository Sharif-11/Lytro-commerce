import { sql } from 'drizzle-orm';
import { check, numeric, uuid } from 'drizzle-orm/pg-core';
import { PaymentPolicy } from '@lytronix/validators';
import { tenant } from '../shared';
import { paymentPolicy } from './catalogue';

// DATABASE-SCHEMA §12.1. RAT-14: unlike every rate in control.rates, this one is per-tenant, not platform-wide.
// One row per tenant that has ever set it; a tenant with no row uses the default of 0.
export const shopSettings = tenant.table(
  'shop_settings',
  {
    tenantId: uuid('tenant_id').primaryKey(),
    extraDeliveryChargePerKg: numeric('extra_delivery_charge_per_kg', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    // PRD-08: the policy a product with none of its own follows, and the advance a partial-advance default asks.
    defaultPaymentPolicy: paymentPolicy('default_payment_policy')
      .notNull()
      .default(PaymentPolicy.None),
    defaultAdvanceAmount: numeric('default_advance_amount', { precision: 10, scale: 2 }),
  },
  (t) => [
    check(
      'shop_settings_advance_check',
      sql`CASE WHEN ${t.defaultPaymentPolicy} = 'partial_advance' THEN ${t.defaultAdvanceAmount} IS NOT NULL AND ${t.defaultAdvanceAmount} >= 0 ELSE ${t.defaultAdvanceAmount} IS NULL END`,
    ),
  ],
);

export type SelectShopSettings = typeof shopSettings.$inferSelect;
export type InsertShopSettings = typeof shopSettings.$inferInsert;
