import { sql } from 'drizzle-orm';
import { bigserial, check, index, integer, numeric, text, uuid } from 'drizzle-orm/pg-core';
import { PerUsePaidFrom } from '@lytronix/validators';
import { addonPurchases } from '../control/addons';
import { createdAt, tenant } from '../shared';

// ORD-30, ORD-34, PLN-20 (Phase 7 Slice 7.6, read agreed 2026-11-06): one row for each charged read of a customer's
// delivery details. The pasted message is never kept (D7-18), only its length and how sure the read was. A read that
// found nothing charges nothing and leaves no row. An allowance's uses are its rows.
export const orderExtractions = tenant.table(
  'order_extractions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    // The staff member who pasted it; null for the owner's own session, as the activity log has it (AUD-02).
    userId: uuid('user_id'),
    inputChars: integer('input_chars').notNull(),
    confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull(),
    paidFrom: text('paid_from').$type<PerUsePaidFrom>().notNull(),
    // What the balance paid: the rate, or zero when an allowance paid or the rate is zero.
    cost: numeric('cost', { precision: 10, scale: 2 }).notNull(),
    addonPurchaseId: uuid('addon_purchase_id').references(() => addonPurchases.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('order_extractions_tenant_idx').on(t.tenantId, t.createdAt),
    index('order_extractions_purchase_idx').on(t.addonPurchaseId),
    check('order_extractions_chars_check', sql`${t.inputChars} BETWEEN 1 AND 4000`),
    check('order_extractions_cost_check', sql`${t.cost} >= 0`),
    check(
      'order_extractions_paid_from_check',
      sql`${t.paidFrom} in (${sql.raw(
        Object.values(PerUsePaidFrom)
          .map((value) => `'${value}'`)
          .join(','),
      )}) AND (${t.paidFrom} = 'allowance') = (${t.addonPurchaseId} IS NOT NULL)`,
    ),
  ],
);

export type SelectOrderExtraction = typeof orderExtractions.$inferSelect;
export type InsertOrderExtraction = typeof orderExtractions.$inferInsert;
