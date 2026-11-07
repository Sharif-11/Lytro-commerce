import { randomInt, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { expect } from 'vitest';
import { postJson } from './http';
import type { ShopClient } from './shop-client';
import { expectLedgerAgrees } from './stock-ledger';

/**
 * Phase 6's exit criterion 2: one golden path, the same for every courier. A cash-on-delivery order → its confirming call → booked →
 * stock out with its serials, the handling limit counted once and the fee charged once → news moves it to shipped → delivered, its
 * cash recorded and nothing due. At every step the parcel, the order's two axes, the stock and the balance agree. Each courier's spec
 * says only what is its own: where it delivers, what its booking needs, and how its news arrives each of the three ways.
 */

/** The three ways news reaches Lytro (D6-2, D6-4). */
export const GOLDEN_WAYS = ['by message', 'by the night check alone', 'by Sync'] as const;
export type GoldenWay = (typeof GOLDEN_WAYS)[number];

export interface GoldenOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  due: string;
  grandTotal: string;
  deliveryCharge: string;
  items: { id: string }[];
  parcel: { state: string; consignmentId: string | null; reading: string | null } | null;
  payments: { method: string; amount: string }[];
}

export interface GoldenCourier {
  port: number;
  admin: pg.Client;
  /** A thana this courier delivers to. */
  locationId: number;
  /** What else this courier's booking needs: its key, a weight, an area. */
  booking: Record<string, unknown>;
  /** Brings the booked parcel to `stage` the given way, as this courier would. */
  news(order: GoldenOrder, stage: 'shipped' | 'delivered', way: GoldenWay): Promise<void>;
}

const SERIALS = ['GP-SN-1', 'GP-SN-2'];

/** A pay-as-you-go shop, so booking takes the order fee from its balance (PYG-02, PYG-04). */
export async function payAsYouGo(admin: pg.Client, tenantId: string): Promise<void> {
  await admin.query(
    `UPDATE control.tenants SET state = 'pay_as_you_go',
       plan_id = (SELECT id FROM control.plans WHERE name = 'Pay-as-you-go'),
       plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Pay-as-you-go')
     WHERE id = $1`,
    [tenantId],
  );
}

/** Walks one order down the golden path, checking that everything agrees after each step. */
export async function walkGoldenPath(
  shop: ShopClient,
  courier: GoldenCourier,
  way: GoldenWay,
): Promise<GoldenOrder> {
  const { admin } = courier;
  const phone = await serialProduct(shop);
  const placed = await place(shop, courier, phone.variantId);
  expect(placed).toMatchObject({ status: 'pending', fulfillmentStatus: 'unfulfilled' });
  expect(placed.paymentStatus).not.toBe('paid');

  // ORD-51: the confirming call. Nothing has moved yet: one unit is reserved, no fee, nothing counted.
  const called = await shop.post(`/orders/${placed.id}/calls`, { outcome: 'confirmed' });
  expect(called.status, JSON.stringify(called.body)).toBe(200);
  const confirmed = await read(shop, placed.id);
  expect(confirmed).toMatchObject({ status: 'confirmed', fulfillmentStatus: 'unfulfilled' });
  expect(confirmed.parcel).toBeNull();
  expect(await stockOf(shop, phone)).toEqual(['2.000', '1.000']);
  expect(await fees(admin, shop.tenantId)).toEqual([]);
  expect(await handled(admin, shop.tenantId)).toBe(0);
  const start = await balanceOf(shop);

  // D6-7: booked. The stock goes out with the serial chosen, the order is counted and its fee taken, once each.
  const answered = await shop.post(`/orders/${placed.id}/book`, {
    ...courier.booking,
    serials: [{ lineId: placed.items[0]?.id, serials: [SERIALS[1]] }],
  });
  expect(answered.status, JSON.stringify(answered.body)).toBe(200);
  const booked = answered.body as GoldenOrder;
  expect(booked).toMatchObject({ status: 'processing', fulfillmentStatus: 'processing' });
  expect(booked.parcel).toMatchObject({ state: 'booked' });
  expect(booked.parcel?.consignmentId).toBeTruthy();
  expect(booked.due).toBe(placed.due);
  // CUS-12: a courier's area, or the booking itself, never changes the order's delivery charge or total.
  expect(booked.deliveryCharge).toBe(placed.deliveryCharge);
  expect(booked.grandTotal).toBe(placed.grandTotal);
  const outStock = ['1.000', '0.000'];
  expect(await stockOf(shop, phone)).toEqual(outStock);
  expect(await serialsIn(shop, phone)).toEqual([SERIALS[0]]);
  const fee = await fees(admin, shop.tenantId);
  expect(fee).toHaveLength(1);
  expect(await handled(admin, shop.tenantId)).toBe(1);
  const afterFee = await balanceOf(shop);
  expect(Number(afterFee)).toBeCloseTo(Number(start) + Number(fee[0]), 2);
  await expectLedgerAgrees(admin, shop.tenantId);

  // Shipped on the courier's word: nothing else moves.
  await courier.news(booked, 'shipped', way);
  const shipped = await read(shop, placed.id);
  expect(shipped).toMatchObject({
    status: 'shipped',
    fulfillmentStatus: 'shipped',
    paymentStatus: placed.paymentStatus,
    due: placed.due,
  });
  expect(shipped.parcel).toMatchObject({ state: 'booked', reading: 'with_courier' });
  expect(await stockOf(shop, phone)).toEqual(outStock);
  expect(await fees(admin, shop.tenantId)).toEqual(fee);
  expect(await handled(admin, shop.tenantId)).toBe(1);
  expect(await balanceOf(shop)).toBe(afterFee);
  await expectLedgerAgrees(admin, shop.tenantId);

  // Delivered: its cash recorded, nothing due. The stock, the count and the fee stay as booking left them.
  await courier.news(shipped, 'delivered', way);
  const delivered = await read(shop, placed.id);
  expect(delivered).toMatchObject({
    status: 'delivered',
    fulfillmentStatus: 'delivered',
    paymentStatus: 'paid',
    due: '0.00',
  });
  expect(delivered.parcel).toMatchObject({ state: 'booked', reading: 'delivered' });
  expect(delivered.payments).toEqual([
    expect.objectContaining({ method: 'cash_on_delivery', amount: placed.due }),
  ]);
  expect(await stockOf(shop, phone)).toEqual(outStock);
  expect(await serialsIn(shop, phone)).toEqual([SERIALS[0]]);
  expect(await fees(admin, shop.tenantId)).toEqual(fee);
  expect(await handled(admin, shop.tenantId)).toBe(1);
  expect(await balanceOf(shop)).toBe(afterFee);
  await expectLedgerAgrees(admin, shop.tenantId);
  return delivered;
}

interface Product {
  id: string;
  variantId: string;
}

async function serialProduct(shop: ShopClient): Promise<Product> {
  const made = await shop.post('/products', {
    name: 'Phone',
    basePrice: 1200,
    weightKg: 0.5,
    serialTracked: true,
    serialFormat: 'any',
    variants: [{ optionIds: [] }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const body = made.body as { id: string; variants: { id: string }[] };
  const product = { id: body.id, variantId: body.variants[0]?.id ?? '' };
  const added = await shop.post(
    `/products/${product.id}/variants/${product.variantId}/stock-additions`,
    { quantity: SERIALS.length, serials: SERIALS },
  );
  expect(added.status, JSON.stringify(added.body)).toBe(200);
  return product;
}

async function place(
  shop: ShopClient,
  courier: GoldenCourier,
  variantId: string,
): Promise<GoldenOrder> {
  const made = await postJson(
    courier.port,
    '/orders',
    {
      customerName: 'Rahima Akter',
      phone: `017${String(randomInt(10_000_000, 99_999_999))}`,
      locationId: courier.locationId,
      deliveryAddress: 'House 12, Road 3',
      items: [{ variantId, quantity: 1 }],
    },
    shop.headers({ 'idempotency-key': randomUUID() }),
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as GoldenOrder;
}

async function read(shop: ShopClient, orderId: string): Promise<GoldenOrder> {
  return (await shop.get(`/orders/${orderId}`)).body as GoldenOrder;
}

async function stockOf(shop: ShopClient, product: Product): Promise<string[]> {
  const found = (await shop.get(`/products/${product.id}/stock`)).body as {
    variants: { onHand: string; reserved: string }[];
  };
  return [found.variants[0]?.onHand ?? '', found.variants[0]?.reserved ?? ''];
}

async function serialsIn(shop: ShopClient, product: Product): Promise<string[]> {
  const { serials } = (
    await shop.get(`/products/${product.id}/variants/${product.variantId}/serials?status=in_stock`)
  ).body as { serials: { serial: string }[] };
  return serials.map((row) => row.serial).sort();
}

async function fees(admin: pg.Client, tenantId: string): Promise<string[]> {
  const { rows } = await admin.query<{ amount: string }>(
    "SELECT amount FROM tenant.balance_ledger WHERE tenant_id = $1 AND type = 'order_fee' ORDER BY id",
    [tenantId],
  );
  return rows.map((row) => row.amount);
}

async function handled(admin: pg.Client, tenantId: string): Promise<number> {
  const { rows } = await admin.query<{ total: string }>(
    'SELECT count(*)::text AS total FROM tenant.orders WHERE tenant_id = $1 AND handled_at IS NOT NULL',
    [tenantId],
  );
  return Number(rows[0]?.total);
}

async function balanceOf(shop: ShopClient): Promise<string> {
  return ((await shop.get('/balance')).body as { amount: string }).amount;
}
