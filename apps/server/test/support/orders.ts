import { randomInt } from 'node:crypto';
import type pg from 'pg';

const TRACKING_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * INV-15: stock is held for an order and its lines by key (migration 0083). Tests that hold stock through the
 * reservation service directly, without going through order creation, stand in a bare dine-in order and its lines
 * first, through the admin connection; running it again for the same ids adds nothing.
 */
export async function seedOrderFor(
  admin: pg.Client,
  tenantId: string,
  orderId: string,
  lineIds: readonly string[],
): Promise<void> {
  let trackingId = '';
  for (let index = 0; index < 8; index += 1) {
    trackingId += TRACKING_ALPHABET.charAt(randomInt(TRACKING_ALPHABET.length));
  }
  await admin.query(
    `INSERT INTO tenant.orders (id, tenant_id, order_number, tracking_id, fulfilment_type, table_ref,
       subtotal, delivery_charge, grand_total, cod_amount, due)
     VALUES ($1, $2, $3, $4, 'dine_in', 'T1', 0, 0, 0, 0, 0)
     ON CONFLICT (id) DO NOTHING`,
    [orderId, tenantId, `T-${orderId.slice(0, 8)}`, trackingId],
  );
  for (const [position, lineId] of lineIds.entries()) {
    await admin.query(
      `INSERT INTO tenant.order_lines (id, tenant_id, order_id, position, product_name, stock_unit, list_price,
         unit_price, quantity, item_total, delivery_mode, delivery_charge, payment_policy)
       VALUES ($1, $2, $3, $4, 'Seeded item', 'kg', 0, 0, 1, 0, 'default', 0, 'none')
       ON CONFLICT (id) DO NOTHING`,
      [lineId, tenantId, orderId, position],
    );
  }
}
