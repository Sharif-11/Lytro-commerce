import { text, timestamp } from 'drizzle-orm/pg-core';
import { RetireState, type CourierKey } from '@lytronix/validators';
import { control } from '../shared';

// CRR-23 to CRR-25 (Phase 6 Slice 6.6, read agreed 2026-11-06): how the platform holds each courier. A courier with no row is active.
// Retiring keeps every shop already connected working, lets no new shop connect, and names the one courier shops are told to use
// instead; removed is for good, once no order waits on it, and its code goes in a later change. Platform-wide, so no RLS.
export const courierAdapters = control.table('courier_adapters', {
  courierKey: text('courier_key').$type<CourierKey>().primaryKey(),
  state: text('state').$type<RetireState>().notNull().default(RetireState.Active),
  suggestedKey: text('suggested_key').$type<CourierKey>(),
  retiringSince: timestamp('retiring_since', { withTimezone: true }),
  removedAt: timestamp('removed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SelectCourierAdapter = typeof courierAdapters.$inferSelect;
