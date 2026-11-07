import { bigserial, numeric, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { RateKey } from '@lytronix/validators';
import { control } from '../shared';

// DATABASE-SCHEMA §2.3. RAT-01: platform-wide, per-use rates; a charge always reads this at the moment it is
// recorded (RAT-04). Never consulted for a rate's own history, only the current value.
export const rates = control.table('rates', {
  key: text('key').$type<RateKey>().primaryKey(),
  value: numeric('value', { precision: 12, scale: 4 }).notNull(),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
});

// RAT-05: every rate change, in order, for the operator's audit screen. Append-only in practice (nothing in this
// slice ever updates or deletes a row), but not enforced by a trigger the way tenant.balance_ledger is — this
// table lives in `control`, which has no row-level-security/insert-only convention today.
export const rateHistory = control.table('rate_history', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  key: text('key').$type<RateKey>().notNull(),
  oldValue: numeric('old_value', { precision: 12, scale: 4 }),
  newValue: numeric('new_value', { precision: 12, scale: 4 }).notNull(),
  changedBy: uuid('changed_by'), // operator account id
  // RAT-09, NTC-13: null = no notice was published for this change; publishing a notice that names the change sets it
  // (Slice 7.4). Not a foreign key: it was written unchecked before control.notices existed (decided 2026-10-13), so a
  // value from then may name no notice; control.notices.rate_change_id is the checked link the other way.
  noticeId: uuid('notice_id'),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SelectRate = typeof rates.$inferSelect;
export type InsertRate = typeof rates.$inferInsert;

export type SelectRateHistory = typeof rateHistory.$inferSelect;
export type InsertRateHistory = typeof rateHistory.$inferInsert;
