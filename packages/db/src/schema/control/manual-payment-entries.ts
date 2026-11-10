import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import type {
  PlanLimits,
  PlanPaymentKind,
  ScheduledPlanChangeKind,
  TenantState,
} from '@lytronix/validators';
import { control, createdAt } from '../shared';
import { paymentEvidence } from './payment-evidence';
import { planPayments } from './plan-payments';
import { platformWallets } from './platform-wallets';
import { tenants } from './tenancy';

/** D8-48: everything a plan payment changes on a shop, as it stood, dates as ISO strings. */
export interface PlanStanding {
  state: TenantState;
  planId: string | null;
  planSnapshot: PlanLimits | null;
  planVersionSnapshot: number | null;
  featureSnapshot: Record<string, boolean> | null;
  periodStart: string | null;
  periodEnd: string | null;
  billingTermId: string | null;
  cancelledAt: string | null;
  archivedAt: string | null;
  downgradedAt: string | null;
  downgradeOverLimit: string[] | null;
  downgradeFinalWarningAt: string | null;
  lapseScheduleSnapshot: {
    grace: number;
    readOnly: number;
    locked: number;
    archived: number;
  } | null;
  balanceFrozen: boolean;
}

/** D8-48: the shop as it stood before a plan entry, and the plan change an activation cancels. */
export interface ManualEntryBefore {
  standing: PlanStanding;
  scheduled: {
    kind: ScheduledPlanChangeKind;
    targetPlanId: string | null;
    effectiveAt: string;
  } | null;
}

/** D8-48: the plan the entry left the shop on; a reversal is refused once the shop has moved off it. */
export interface ManualEntryAfter {
  planId: string | null;
  periodEnd: string | null;
}

// ADM-14, ADM-15, D8-14, D8-47 to D8-56 (Phase 8 Slice 8.5, read agreed 2026-11-09): each payment the operator recorded
// and each reversal of one. Append-only (the app role can only read and add): a reversal is its own row, pointing at the
// entry it reverses, and the original is never changed. `kind` is the payment's own: purchase, renewal, upgrade or top-up.
export const manualPaymentEntries = control.table(
  'manual_payment_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    planPaymentId: uuid('plan_payment_id')
      .notNull()
      .references(() => planPayments.id),
    kind: text('kind').$type<PlanPaymentKind>().notNull(),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    // Null on a reversal, as is everything about how the money arrived.
    walletId: uuid('wallet_id').references(() => platformWallets.id),
    transactionId: text('transaction_id'),
    senderNumber: text('sender_number'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    evidenceId: uuid('evidence_id').references(() => paymentEvidence.id),
    evidenceLine: text('evidence_line'),
    reason: text('reason').notNull(),
    enteredBy: uuid('entered_by').notNull(),
    before: jsonb('before').$type<ManualEntryBefore>(),
    after: jsonb('after').$type<ManualEntryAfter>(),
    reversesEntryId: uuid('reverses_entry_id').references(
      (): AnyPgColumn => manualPaymentEntries.id,
    ),
    createdAt: createdAt(),
  },
  (t) => [
    // ADM-15: an entry is reversed once.
    uniqueIndex('manual_payment_entries_reverses_idx')
      .on(t.reversesEntryId)
      .where(sql`${t.reversesEntryId} IS NOT NULL`),
    index('manual_payment_entries_transaction_idx').on(t.transactionId),
    index('manual_payment_entries_created_idx').on(t.createdAt),
    index('manual_payment_entries_tenant_idx').on(t.tenantId, t.createdAt),
    // ADM-15: an entry states its wallet, transaction, sender, time and evidence; only a reversal may go without.
    check(
      'manual_payment_entries_evidence_check',
      sql`${t.reversesEntryId} IS NOT NULL OR (
        ${t.walletId} IS NOT NULL AND ${t.transactionId} IS NOT NULL AND ${t.senderNumber} IS NOT NULL
        AND ${t.paidAt} IS NOT NULL AND (${t.evidenceId} IS NOT NULL OR ${t.evidenceLine} IS NOT NULL)
      )`,
    ),
  ],
);

export type SelectManualPaymentEntry = typeof manualPaymentEntries.$inferSelect;
export type InsertManualPaymentEntry = typeof manualPaymentEntries.$inferInsert;
