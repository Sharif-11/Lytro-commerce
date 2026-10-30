import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, numeric, timestamp, uuid } from 'drizzle-orm/pg-core';
import { PaymentPolicy } from '@lytronix/validators';
import { tenant } from '../shared';
import { paymentPolicy, taxClasses } from './catalogue';

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
    // TEN-16: the shop's logo, a ready image of its own; without one the shop shows its monogram. Deleting the image
    // clears it.
    logoMediaId: uuid('logo_media_id'),
    // SUP-01: when a shop or product link was first copied or shared from the dashboard, which ticks the set-up
    // checklist's "share the shop link" on every device.
    linkSharedAt: timestamp('link_shared_at', { withTimezone: true }),
    // SFT-16: the shared storefront is on; switched off, its pages answer not-found while landing pages and the API
    // keep working.
    storefrontEnabled: boolean('storefront_enabled').notNull().default(true),
    // Slice 4.6a (agreed 2026-10-30): the tax class each new product starts with; null for none.
    defaultTaxClassId: uuid('default_tax_class_id'),
  },
  (t) => [
    foreignKey({
      name: 'shop_settings_default_tax_class_fk',
      columns: [t.tenantId, t.defaultTaxClassId],
      foreignColumns: [taxClasses.tenantId, taxClasses.id],
    }),
    check(
      'shop_settings_advance_check',
      sql`CASE WHEN ${t.defaultPaymentPolicy} = 'partial_advance' THEN ${t.defaultAdvanceAmount} IS NOT NULL AND ${t.defaultAdvanceAmount} >= 0 ELSE ${t.defaultAdvanceAmount} IS NULL END`,
    ),
  ],
);

export type SelectShopSettings = typeof shopSettings.$inferSelect;
export type InsertShopSettings = typeof shopSettings.$inferInsert;
