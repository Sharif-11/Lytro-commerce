import type pg from 'pg';
import { expect } from 'vitest';

/**
 * INV-05: for every level of the shop, on hand is the sum of its movements, reserved the sum of its active reservations,
 * and, on a batch-tracked product, on hand the sum of its open batches.
 */
export async function expectLedgerAgrees(admin: pg.Client, tenantId: string): Promise<void> {
  const result = await admin.query<{
    variant_id: string;
    on_hand: string;
    moved: string;
    reserved: string;
    held: string;
    batch_tracked: boolean;
    batched: string;
  }>(
    `SELECT l.variant_id, l.on_hand::text, l.reserved::text, p.batch_tracked,
       (SELECT coalesce(sum(m.quantity_delta), 0) FROM tenant.stock_movements m
        WHERE m.tenant_id = l.tenant_id AND m.variant_id = l.variant_id)::numeric(14, 3)::text AS moved,
       (SELECT coalesce(sum(r.quantity), 0) FROM tenant.stock_reservations r
        WHERE r.tenant_id = l.tenant_id AND r.variant_id = l.variant_id AND r.status = 'active')::numeric(14, 3)::text
         AS held,
       (SELECT coalesce(sum(b.quantity), 0) FROM tenant.stock_batches b
        WHERE b.tenant_id = l.tenant_id AND b.variant_id = l.variant_id AND b.closed_at IS NULL)::numeric(14, 3)::text
         AS batched
     FROM tenant.stock_levels l
     JOIN tenant.product_variants v ON v.tenant_id = l.tenant_id AND v.id = l.variant_id
     JOIN tenant.products p ON p.tenant_id = v.tenant_id AND p.id = v.product_id
     WHERE l.tenant_id = $1`,
    [tenantId],
  );
  expect(result.rows.length).toBeGreaterThan(0);
  for (const row of result.rows) {
    expect(row.on_hand, `on hand of ${row.variant_id}`).toBe(row.moved);
    expect(row.reserved, `reserved of ${row.variant_id}`).toBe(row.held);
    if (row.batch_tracked) expect(row.on_hand, `batches of ${row.variant_id}`).toBe(row.batched);
  }
}
