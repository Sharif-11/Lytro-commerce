import { numeric, uuid } from 'drizzle-orm/pg-core';
import { tenant } from '../shared';

// DATABASE-SCHEMA §12.1. RAT-14: unlike every rate in control.rates, this one is per-tenant, not platform-wide.
// One row per tenant that has ever set it; a tenant with no row uses the default of 0.
export const shopSettings = tenant.table('shop_settings', {
  tenantId: uuid('tenant_id').primaryKey(),
  extraDeliveryChargePerKg: numeric('extra_delivery_charge_per_kg', { precision: 10, scale: 2 })
    .notNull()
    .default('0'),
});

export type SelectShopSettings = typeof shopSettings.$inferSelect;
export type InsertShopSettings = typeof shopSettings.$inferInsert;
