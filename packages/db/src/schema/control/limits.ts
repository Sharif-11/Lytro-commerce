import { index, text, timestamp } from 'drizzle-orm/pg-core';
import { control } from '../shared';

// RED-11, D9-15 (Slice 9.4): the exact limits -- a shopper's sign-in codes per address, orders, payment sessions and
// listener pairing -- counted in PostgreSQL, so every API copy and every server together allow exactly the limit. One
// row per request a limit let through, taken under an advisory lock on its bucket; a bucket's rows older than its
// window are deleted as it's checked, so the table holds only the last window's.
export const limitEvents = control.table(
  'limit_events',
  {
    bucket: text('bucket').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (t) => [index('limit_events_bucket_at_idx').on(t.bucket, t.at)],
);

// §107, §119, D9-15 (Slice 9.4): a short claim on a name, for what one API copy alone used to guard in its memory: a
// payment's start while a second tap waits, a gateway token while one copy fetches it, a once-a-day notice. Whoever
// inserts the row, or finds it lapsed, holds it until `until`; a lapsed one may be taken over, so a crashed holder
// never blocks for longer than its lease.
export const leases = control.table(
  'leases',
  {
    key: text('key').primaryKey(),
    holder: text('holder').notNull(),
    until: timestamp('until', { withTimezone: true }).notNull(),
  },
  (t) => [index('leases_until_idx').on(t.until)],
);

// RED-05 (Slice 9.4): whether a shared service (Redis) is down, as the servers together see it, so its outage gives the
// operators one email when it starts and one when it ends, never one per server.
export const serviceStates = control.table('service_states', {
  service: text('service').primaryKey(),
  downSince: timestamp('down_since', { withTimezone: true }),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SelectLease = typeof leases.$inferSelect;
export type SelectServiceState = typeof serviceStates.$inferSelect;
