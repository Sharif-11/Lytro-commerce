import { sql } from 'drizzle-orm';
import { integer, smallint, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { control } from '../shared';

// CUS-08, DATABASE-SCHEMA §2.5: the one canonical list of zillas and thanas every address form uses, identical for
// every tenant and never shaped by couriers. Platform data, seeded from packages/db/data/locations.json; ids are
// fixed by the seed, since tenants hold them by value (delivery zones, and orders from Phase 4).

// The 11 city areas, one per city corporation, with Dhaka North and South together as "dhaka".
export const cities = control.table('cities', {
  code: text('code').primaryKey(),
  nameEn: text('name_en').notNull(),
  nameBn: text('name_bn').notNull(),
  sortOrder: smallint('sort_order').notNull().default(0),
});

// The 64 zillas (districts).
export const zillas = control.table(
  'zillas',
  {
    id: smallint('id').primaryKey(),
    nameEn: text('name_en').notNull(),
    nameBn: text('name_bn').notNull(),
  },
  (t) => [uniqueIndex('zillas_name_en_idx').on(sql`lower(${t.nameEn})`)],
);

// Every thana: an upazila, or a police thana inside a city. A thana belongs to at most one city.
export const locations = control.table(
  'locations',
  {
    id: integer('id').primaryKey(),
    zillaId: smallint('zilla_id')
      .notNull()
      .references(() => zillas.id),
    nameEn: text('name_en').notNull(),
    nameBn: text('name_bn').notNull(),
    // Null outside every city area.
    cityCode: text('city_code').references(() => cities.code),
  },
  (t) => [uniqueIndex('locations_zilla_name_idx').on(t.zillaId, sql`lower(${t.nameEn})`)],
);

export type SelectCity = typeof cities.$inferSelect;
export type SelectZilla = typeof zillas.$inferSelect;
export type SelectLocation = typeof locations.$inferSelect;
