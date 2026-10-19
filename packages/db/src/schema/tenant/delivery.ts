import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { DELIVERY_ZONE_NAME_MAX_LENGTH } from '@lytronix/validators';
import { createdAt, tenant } from '../shared';
import { products } from './catalogue';

// DATABASE-SCHEMA §3.2 (delivery zones, DLV). Every table carries tenant_id behind the tenant_isolation policy.

// DLV-01: a zone, its charge and whether it delivers at all (DLV-06). Every shop has exactly one home zone ("Inside
// <home area>") and one fallback ("Outside <home area>", everything no other zone names); neither is ever deleted.
// A null name means the zone follows its home area's name, which only those two do.
export const deliveryZones = tenant.table(
  'delivery_zones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    name: varchar('name', { length: DELIVERY_ZONE_NAME_MAX_LENGTH }),
    charge: numeric('charge', { precision: 10, scale: 2 }).notNull(),
    isHome: boolean('is_home').notNull().default(false),
    isFallback: boolean('is_fallback').notNull().default(false),
    noDelivery: boolean('no_delivery').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('delivery_zones_tenant_id_key').on(t.tenantId, t.id),
    uniqueIndex('delivery_zones_one_home_idx')
      .on(t.tenantId)
      .where(sql`${t.isHome}`),
    uniqueIndex('delivery_zones_one_fallback_idx')
      .on(t.tenantId)
      .where(sql`${t.isFallback}`),
    check('delivery_zones_charge_check', sql`${t.charge} >= 0`),
    check('delivery_zones_kind_check', sql`NOT (${t.isHome} AND ${t.isFallback})`),
    check(
      'delivery_zones_name_check',
      sql`${t.name} IS NOT NULL OR ${t.isHome} OR ${t.isFallback}`,
    ),
  ],
);

// DLV-01, DLV-02: the CUS-08 areas a zone covers, one per row: a whole zilla, a whole city, or one thana, each held
// by value (control.zillas, control.cities, control.locations). No area sits in two zones of a shop.
export const deliveryZoneAreas = tenant.table(
  'delivery_zone_areas',
  {
    tenantId: uuid('tenant_id').notNull(),
    zoneId: uuid('zone_id').notNull(),
    zillaId: smallint('zilla_id'),
    cityCode: text('city_code'),
    locationId: integer('location_id'),
  },
  (t) => [
    foreignKey({
      name: 'delivery_zone_areas_zone_fk',
      columns: [t.tenantId, t.zoneId],
      foreignColumns: [deliveryZones.tenantId, deliveryZones.id],
    }).onDelete('cascade'),
    check(
      'delivery_zone_areas_one_check',
      sql`num_nonnulls(${t.zillaId}, ${t.cityCode}, ${t.locationId}) = 1`,
    ),
    uniqueIndex('delivery_zone_areas_zilla_idx')
      .on(t.tenantId, t.zillaId)
      .where(sql`${t.zillaId} IS NOT NULL`),
    uniqueIndex('delivery_zone_areas_city_idx')
      .on(t.tenantId, t.cityCode)
      .where(sql`${t.cityCode} IS NOT NULL`),
    uniqueIndex('delivery_zone_areas_location_idx')
      .on(t.tenantId, t.locationId)
      .where(sql`${t.locationId} IS NOT NULL`),
    index('delivery_zone_areas_zone_idx').on(t.tenantId, t.zoneId),
  ],
);

// DLV-07: the zones a product may be delivered to; no rows means wherever the shop delivers. A zone a product names
// cannot be deleted (no cascade) until the product stops naming it.
export const productDeliveryZones = tenant.table(
  'product_delivery_zones',
  {
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    zoneId: uuid('zone_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.productId, t.zoneId] }),
    foreignKey({
      name: 'product_delivery_zones_product_fk',
      columns: [t.tenantId, t.productId],
      foreignColumns: [products.tenantId, products.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'product_delivery_zones_zone_fk',
      columns: [t.tenantId, t.zoneId],
      foreignColumns: [deliveryZones.tenantId, deliveryZones.id],
    }),
    index('product_delivery_zones_zone_idx').on(t.tenantId, t.zoneId),
  ],
);

export type SelectDeliveryZone = typeof deliveryZones.$inferSelect;
export type SelectDeliveryZoneArea = typeof deliveryZoneAreas.$inferSelect;
