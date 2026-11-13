import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  ReconciliationDifferenceState,
  type ReconciliationDifferenceKind,
} from '@lytronix/validators';
import { control, createdAt } from '../shared';

// DAT-52, D9-16 (Phase 9 Slice 9.5): each day the reconciliation compared, once -- when it ran and what it found, so a
// second run of the same day adds nothing and the operator can see the check is being made at all.
export const reconciliationRuns = control.table('reconciliation_runs', {
  day: date('day').primaryKey(),
  ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
  // How many differences it found, of every kind, and how many of them were new.
  found: integer('found').notNull().default(0),
  counts: jsonb('counts')
    .$type<Partial<Record<ReconciliationDifferenceKind, number>>>()
    .notNull()
    .default({}),
});

// DAT-52, D9-16, OD-44: one row for each difference the daily reconciliation found, once per day, kind and subject (a
// re-run adds nothing). It says what was found -- the amounts in taka where an amount differs, and the ids it is about,
// never a secret -- and what the operator did: open until resolved with their note.
export const reconciliationDifferences = control.table(
  'reconciliation_differences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The Asia/Dhaka day the reconciliation was comparing.
    day: date('day').notNull(),
    kind: text('kind').$type<ReconciliationDifferenceKind>().notNull(),
    // What it is about, as an id: the payment, message, order or shop the difference is in.
    subject: text('subject').notNull(),
    tenantId: uuid('tenant_id'),
    // Where an amount differs: what it should be and what was found.
    expected: numeric('expected', { precision: 14, scale: 2 }),
    found: numeric('found', { precision: 14, scale: 2 }),
    details: jsonb('details').$type<Record<string, string | number | null>>().notNull().default({}),
    state: text('state')
      .$type<ReconciliationDifferenceState>()
      .notNull()
      .default(ReconciliationDifferenceState.Open),
    note: text('note'),
    resolvedBy: uuid('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('reconciliation_differences_once').on(t.day, t.kind, t.subject),
    index('reconciliation_differences_state_idx').on(t.state, t.day),
  ],
);

export type SelectReconciliationRun = typeof reconciliationRuns.$inferSelect;
export type SelectReconciliationDifference = typeof reconciliationDifferences.$inferSelect;
export type InsertReconciliationDifference = typeof reconciliationDifferences.$inferInsert;
