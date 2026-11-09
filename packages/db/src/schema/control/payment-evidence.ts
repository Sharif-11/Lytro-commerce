import { sql } from 'drizzle-orm';
import { index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { control, createdAt } from '../shared';
import { tenants } from './tenancy';

// ADM-14, ADM-17, D8-14, D8-15, D8-47 (Phase 8 Slice 8.5, read agreed 2026-11-09): a screenshot proving a payment, the
// operator's for a manual entry or the seller's for an "I have paid". The file itself is in a private bucket no public
// route reads. After two years a nightly job removes the file and sets `removed_at`; the row stays, so an old entry says
// that its evidence is gone rather than having none.
export const paymentEvidence = control.table(
  'payment_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    objectKey: text('object_key').notNull().unique(),
    contentType: text('content_type').notNull(),
    bytes: integer('bytes').notNull(),
    createdAt: createdAt(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [
    index('payment_evidence_due_idx')
      .on(t.createdAt)
      .where(sql`${t.removedAt} IS NULL`),
  ],
);

export type SelectPaymentEvidence = typeof paymentEvidence.$inferSelect;
export type InsertPaymentEvidence = typeof paymentEvidence.$inferInsert;
