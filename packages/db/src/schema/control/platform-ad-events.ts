import { primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { control } from '../shared';
import { tenants } from './tenancy';

// MKT-04 (the owner, 2026-11-24): Lytro's own once-per-shop ad events -- the shop's activation and its first paid
// plan -- each recorded the first time it is queued for Meta, so a shop is told of once, whatever its orders or
// payments do later (an order can be deleted, ORD-12). Lytro's own table, outside any shop's row-level security.
export const platformAdEvents = control.table(
  'platform_ad_events',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    eventName: text('event_name').notNull(),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: 'platform_ad_events_pkey', columns: [t.tenantId, t.eventName] })],
);

export type SelectPlatformAdEvent = typeof platformAdEvents.$inferSelect;
