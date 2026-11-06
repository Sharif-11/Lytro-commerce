import { index, integer, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { CourierAreaMatch, CourierKey } from '@lytronix/validators';
import { control, createdAt } from '../shared';

// CUS-10, CUS-12 (Phase 6 Slice 6.4, read agreed 2026-11-06): a courier's own areas, for a courier that needs one on every booking.
// Platform-wide reference data, one list for every shop, read from the courier's API once a week and on the operator's word. Each area
// sits in at most one of Lytro's thanas (`thana_id`, a control.locations id) once it counts; `suggested_thana_id` is a match the
// operator hasn't confirmed. `zilla_id` comes from the courier's own district name, so an area is always findable in its zilla.
// An area the courier stops listing is retired, not deleted, so a parcel that holds its code can still show its name.
export const courierAreas = control.table(
  'courier_areas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courierKey: text('courier_key').$type<CourierKey>().notNull(),
    areaCode: text('area_code').notNull(),
    name: text('name').notNull(),
    districtName: text('district_name').notNull(),
    postCode: text('post_code'),
    zillaId: smallint('zilla_id'),
    thanaId: integer('thana_id'),
    suggestedThanaId: integer('suggested_thana_id'),
    match: text('match').$type<CourierAreaMatch>().notNull(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    refreshedAt: timestamp('refreshed_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('courier_areas_code').on(t.courierKey, t.areaCode),
    index('courier_areas_thana_idx').on(t.courierKey, t.thanaId),
    index('courier_areas_zilla_idx').on(t.courierKey, t.zillaId),
  ],
);

export type SelectCourierArea = typeof courierAreas.$inferSelect;
export type NewCourierArea = typeof courierAreas.$inferInsert;
