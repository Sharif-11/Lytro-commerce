import { bigint, date, numeric, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { control } from '../shared';

// MED-12, D8-57 (Phase 8 Slice 8.6, read agreed 2026-11-10): each UTC day of Cloudflare's own R2 figures, one row a
// bucket, read hourly from its analytics, which keep only about 31 days. A day read again replaces its rows. Every
// bucket on the account is here, since the budget is held against the whole bill (D8-59).
export const mediaCostDays = control.table(
  'media_cost_days',
  {
    day: date('day', { mode: 'string' }).notNull(),
    bucket: text('bucket').notNull(),
    // R2's operations that day by price class (D8-62); an operation Cloudflare doesn't list counts as Class A.
    classA: bigint('class_a', { mode: 'number' }).notNull().default(0),
    classB: bigint('class_b', { mode: 'number' }).notNull().default(0),
    freeOps: bigint('free_ops', { mode: 'number' }).notNull().default(0),
    // The day's peak storage, objects and their metadata, in bytes: a GB-month averages these over 30 days.
    peakBytes: bigint('peak_bytes', { mode: 'number' }).notNull().default(0),
    objects: bigint('objects', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: 'media_cost_days_pkey', columns: [t.day, t.bucket] })],
);

// MED-12, D8-63: the budget's alert, sent once a billing period, to the one address set for it (D8-61). Kept so the
// hour after never sends it again and the console can say when it went.
export const mediaCostAlerts = control.table('media_cost_alerts', {
  // The first day of the billing period, in UTC.
  periodStart: date('period_start', { mode: 'string' }).primaryKey(),
  sentTo: text('sent_to').notNull(),
  // What the period's estimate and the budget were when it was sent, in US dollars.
  estimate: numeric('estimate', { precision: 12, scale: 2 }).notNull(),
  budget: numeric('budget', { precision: 12, scale: 2 }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SelectMediaCostDay = typeof mediaCostDays.$inferSelect;
export type SelectMediaCostAlert = typeof mediaCostAlerts.$inferSelect;
