import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, numeric, uuid } from 'drizzle-orm/pg-core';
import { control, createdAt } from '../shared';
import { tenants } from './tenancy';

// MED-04: the nightly comparison of a shop's recorded files (tenant.media_objects) with what R2 holds under its
// prefix, kept for each shop where the two differ, so the operator can see it. Files R2 holds that no row records
// (`stray`) and that are over a day old were deleted by the run; recorded files R2 no longer holds (`missing`) are
// only reported. A difference above 0.5% of the recorded bytes is also an operator alert.
export const mediaReconciliations = control.table(
  'media_reconciliations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    recordedBytes: bigint('recorded_bytes', { mode: 'number' }).notNull(),
    storedBytes: bigint('stored_bytes', { mode: 'number' }).notNull(),
    missingFiles: integer('missing_files').notNull(),
    strayFiles: integer('stray_files').notNull(),
    straysDeleted: integer('strays_deleted').notNull(),
    // |stored - recorded| / recorded, in percent; 100 when nothing is recorded but something is stored.
    mismatchPercent: numeric('mismatch_percent', { precision: 9, scale: 3 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('media_reconciliations_tenant_idx').on(t.tenantId, t.createdAt.desc()),
    check(
      'media_reconciliations_counts_check',
      sql`${t.recordedBytes} >= 0 AND ${t.storedBytes} >= 0 AND ${t.missingFiles} >= 0 AND ${t.strayFiles} >= 0 AND ${t.straysDeleted} BETWEEN 0 AND ${t.strayFiles}`,
    ),
  ],
);

export type SelectMediaReconciliation = typeof mediaReconciliations.$inferSelect;
export type InsertMediaReconciliation = typeof mediaReconciliations.$inferInsert;
