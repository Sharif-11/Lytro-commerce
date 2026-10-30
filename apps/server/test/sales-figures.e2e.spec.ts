import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson, postJson } from './support/http';
import { fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 4 Slice 4.7, agreed 2026-10-30: a shop's sales figures from its delivered orders, each on the day it was placed
// -- order counts, units, revenue with its tax and the delivery charges, by week (from Saturday), month, quarter or
// year (STA-01); best sellers by units or revenue, a combo as itself (STA-02); one product's trend (STA-03); what is
// never sold left out (STA-04); and profit, the items less their tax less the cost of the goods kept, for those who
// may see cost (INV-18, D3-9). Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_sales_figures_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'sales-figures-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

interface Figure {
  orders: number;
  units: { unit: string; quantity: string }[];
  revenue: string;
  tax: string;
  deliveryCharges: string | null;
  profit?: { revenueLessTax: string; costOfGoods: string; profit: string; unknownCost: number };
}

interface Sales {
  dateFrom: string;
  dateTo: string;
  bucket: string;
  productId: string | null;
  buckets: (Figure & { from: string; to: string })[];
  totals: Figure;
}

interface BestSellers {
  by: string;
  products: {
    productId: string | null;
    name: string;
    stockUnit: string;
    units: string;
    revenue: string;
    orders: number;
  }[];
}

interface Order {
  id: string;
  items: { id: string }[];
}

interface Locations {
  zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
}
let locations: Locations | null = null;

function freshMobile(): string {
  return `017${String(randomInt(10_000_000, 99_999_999))}`;
}

async function product(
  shop: ShopClient,
  name: string,
  price: number,
  stock: number,
  cost: number,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; variantId: string }> {
  const made = await shop.post('/products', {
    name,
    basePrice: price,
    variants: [{ optionIds: [], openingStock: stock, openingUnitCost: cost }],
    ...extra,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const body = made.body as { id: string; variants: { id: string }[] };
  return { id: body.id, variantId: body.variants[0]?.id ?? '' };
}

async function place(shop: ShopClient, body: Record<string, unknown>): Promise<Order> {
  const made = await postJson(
    port,
    '/orders',
    { customerName: 'Rahima Akter', phone: freshMobile(), ...body },
    shop.headers({ 'idempotency-key': randomUUID() }),
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as Order;
}

/** The order as placed on that Asia/Dhaka day, at noon. */
async function placedOn(order: Order, day: string): Promise<void> {
  await admin.query('UPDATE tenant.orders SET created_at = $2 WHERE id = $1', [
    order.id,
    `${day}T12:00:00+06:00`,
  ]);
}

/** A takeaway order handed over -- delivered, its cash taken -- placed on that day. */
async function sold(
  shop: ShopClient,
  day: string,
  items: { variantId: string; quantity: number }[],
  extra: Record<string, unknown> = {},
): Promise<Order> {
  const order = await place(shop, { fulfilmentType: 'takeaway', items, ...extra });
  const handed = await shop.post(`/orders/${order.id}/hand-over`, {});
  expect(handed.status, JSON.stringify(handed.body)).toBe(200);
  await placedOn(order, day);
  return order;
}

async function sales(shop: ShopClient, query: string): Promise<Sales> {
  const read = await shop.get(`/sales?${query}`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return read.body as Sales;
}

async function bestSellers(shop: ShopClient, query: string): Promise<BestSellers> {
  const read = await shop.get(`/sales/best-sellers?${query}`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return read.body as BestSellers;
}

const OCTOBER = 'dateFrom=2026-10-01&dateTo=2026-10-31';

describeIfDatabase('sales by week, month, quarter or year (STA-01, STA-04)', () => {
  it('counts delivered orders on the day placed, weeks from Saturday, the buckets adding up to the totals', async () => {
    const shop = await openShop(port, texts, 'sal');
    const lamp = await product(shop, 'Lamp', 300, 30, 100);
    const mug = await product(shop, 'Mug', 200, 30, 50);
    await sold(shop, '2026-10-03', [{ variantId: lamp.variantId, quantity: 2 }]);
    await sold(shop, '2026-10-09', [{ variantId: mug.variantId, quantity: 1 }]);
    await sold(shop, '2026-10-10', [{ variantId: lamp.variantId, quantity: 1 }]);
    // A delivery, its charge set by hand, shipped and delivered.
    if (!locations) locations = (await shop.get('/locations')).body as Locations;
    const mirpur = locations.zillas
      .find((row) => row.nameEn === 'Dhaka')
      ?.thanas.find((row) => row.nameEn === 'Mirpur');
    const sent = await place(shop, {
      locationId: mirpur?.id,
      deliveryAddress: 'House 12, Road 3',
      deliveryCharge: 60,
      items: [{ variantId: mug.variantId, quantity: 2 }],
    });
    const shipped = await shop.post(`/orders/${sent.id}/ship`, {
      courierName: 'Steadfast',
      trackingCode: 'SF-1',
    });
    expect(shipped.status, JSON.stringify(shipped.body)).toBe(200);
    expect((await shop.post(`/orders/${sent.id}/deliver`, {})).status).toBe(200);
    await placedOn(sent, '2026-10-15');
    // Never sold: waiting for its call, and cancelled.
    await placedOn(
      await place(shop, {
        fulfilmentType: 'takeaway',
        items: [{ variantId: lamp.variantId, quantity: 5 }],
      }),
      '2026-10-04',
    );
    const dropped = await place(shop, {
      fulfilmentType: 'takeaway',
      items: [{ variantId: lamp.variantId, quantity: 3 }],
    });
    expect((await shop.post(`/orders/${dropped.id}/cancel`, { reason: 'duplicate' })).status).toBe(
      200,
    );
    await placedOn(dropped, '2026-10-05');

    const weekly = await sales(shop, `${OCTOBER}&bucket=week`);
    expect(
      weekly.buckets.map((bucket) => [
        bucket.from,
        bucket.to,
        bucket.orders,
        bucket.units,
        bucket.revenue,
        bucket.deliveryCharges,
      ]),
    ).toEqual([
      ['2026-10-01', '2026-10-02', 0, [], '0.00', '0.00'],
      ['2026-10-03', '2026-10-09', 2, [{ unit: 'piece', quantity: '3.000' }], '800.00', '0.00'],
      ['2026-10-10', '2026-10-16', 2, [{ unit: 'piece', quantity: '3.000' }], '700.00', '60.00'],
      ['2026-10-17', '2026-10-23', 0, [], '0.00', '0.00'],
      ['2026-10-24', '2026-10-30', 0, [], '0.00', '0.00'],
      ['2026-10-31', '2026-10-31', 0, [], '0.00', '0.00'],
    ]);
    expect(weekly.totals).toMatchObject({
      orders: 4,
      units: [{ unit: 'piece', quantity: '6.000' }],
      revenue: '1500.00',
      tax: '0.00',
      deliveryCharges: '60.00',
    });
    // The owner may see cost: the profit is there.
    // Three lamps at 100 and three mugs at 50.
    expect(weekly.totals.profit).toEqual({
      revenueLessTax: '1500.00',
      costOfGoods: '450.00',
      profit: '1050.00',
      unknownCost: 0,
    });

    const monthly = await sales(shop, `${OCTOBER}&bucket=month`);
    expect(monthly.buckets).toHaveLength(1);
    expect(monthly.buckets[0]).toMatchObject({ from: '2026-10-01', to: '2026-10-31', orders: 4 });
    expect(monthly.totals).toEqual(weekly.totals);
    // Left out, the period runs from the first of this month to today, by week.
    const plain = await sales(shop, '');
    expect(plain.bucket).toBe('week');
    expect(plain.dateFrom.slice(8)).toBe('01');
  });

  it('takes returns and the order discount off revenue, shows the tax inside it, and profit only to those who may see cost', async () => {
    const shop = await openShop(port, texts, 'sal');
    const classes = await shop.post('/tax-classes', { name: 'VAT', rate: 15 });
    expect(classes.status, JSON.stringify(classes.body)).toBe(201);
    const vat =
      (classes.body as { classes: { id: string; name: string }[] }).classes.find(
        (row) => row.name === 'VAT',
      )?.id ?? '';
    const lamp = await product(shop, 'Lamp', 300, 20, 100, { taxClassId: vat });
    const order = await sold(shop, '2026-10-12', [{ variantId: lamp.variantId, quantity: 4 }], {
      discount: 100,
    });
    // 1,200 less the 100 discount is 1,100, its tax 1,100 x 15 / 115 = 143.48; one lamp of four comes back.
    const back = await shop.post(`/orders/${order.id}/returns`, {
      items: [{ lineId: order.items[0]?.id, sellable: 1, damaged: 0 }],
    });
    expect(back.status, JSON.stringify(back.body)).toBe(200);

    const read = await sales(shop, `${OCTOBER}&bucket=month`);
    expect(read.totals).toEqual({
      orders: 1,
      units: [{ unit: 'piece', quantity: '3.000' }],
      revenue: '825.00',
      tax: '107.61',
      deliveryCharges: '0.00',
      // Three lamps kept at 100 each: four sold less the one back.
      profit: { revenueLessTax: '717.39', costOfGoods: '300.00', profit: '417.39', unknownCost: 0 },
    });

    const clerk = await staffWith(port, texts, admin, shop, ['orders:read']);
    const theirs = await getJson(port, `/sales?${OCTOBER}&bucket=month`, clerk);
    expect(theirs.status, JSON.stringify(theirs.body)).toBe(200);
    const seen = theirs.body as Sales;
    expect(seen.totals.revenue).toBe('825.00');
    expect(seen.totals.profit).toBeUndefined();
    expect(seen.buckets[0]?.profit).toBeUndefined();
    const stockOnly = await staffWith(port, texts, admin, shop, ['inventory:read']);
    expect((await getJson(port, `/sales?${OCTOBER}`, stockOnly)).status).toBe(403);
    expect((await getJson(port, `/sales/best-sellers?${OCTOBER}`, stockOnly)).status).toBe(403);
  });

  it('refuses a period that ends before it starts, runs over five years, or a split it does not know', async () => {
    const shop = await openShop(port, texts, 'sal');
    const backwards = await shop.get('/sales?dateFrom=2026-10-10&dateTo=2026-10-01');
    expect(backwards.status).toBe(400);
    expect(fieldsOf(backwards)).toEqual({ dateTo: 'not_allowed' });
    const long = await shop.get('/sales?dateFrom=2020-01-01&dateTo=2026-10-31');
    expect(long.status).toBe(400);
    expect(fieldsOf(long)).toEqual({ dateFrom: 'not_allowed' });
    const daily = await shop.get('/sales?bucket=day');
    expect(daily.status).toBe(400);
    expect(Object.keys(fieldsOf(daily))).toEqual(['bucket']);
    const many = await shop.get('/sales/best-sellers?limit=51');
    expect(Object.keys(fieldsOf(many))).toEqual(['limit']);
  });
});

describeIfDatabase('best sellers and trends (STA-02, STA-03, STA-04)', () => {
  it('ranks by units or by revenue, a combo as itself', async () => {
    const shop = await openShop(port, texts, 'sal');
    const clip = await product(shop, 'Clip', 50, 30, 20);
    const chair = await product(shop, 'Chair', 1000, 5, 400);
    const pack = await shop.post('/products', {
      name: 'Clip pair',
      basePrice: 90,
      kind: 'combo',
      parts: [{ quantity: 2, variantIds: [clip.variantId] }],
    });
    expect(pack.status, JSON.stringify(pack.body)).toBe(201);
    const pair = pack.body as { id: string; variants: { id: string }[] };
    await sold(shop, '2026-10-05', [
      { variantId: clip.variantId, quantity: 10 },
      { variantId: chair.variantId, quantity: 1 },
    ]);
    await sold(shop, '2026-10-06', [{ variantId: pair.variants[0]?.id ?? '', quantity: 2 }]);

    const byUnits = await bestSellers(shop, `${OCTOBER}&by=units`);
    expect(byUnits.products.map((row) => [row.name, row.units, row.revenue, row.orders])).toEqual([
      ['Clip', '10.000', '500.00', 1],
      ['Clip pair', '2.000', '180.00', 1],
      ['Chair', '1.000', '1000.00', 1],
    ]);
    expect(byUnits.products[1]).toMatchObject({ productId: pair.id, stockUnit: 'piece' });
    const byRevenue = await bestSellers(shop, `${OCTOBER}&by=revenue&limit=2`);
    expect(byRevenue.products.map((row) => row.name)).toEqual(['Chair', 'Clip']);

    // The combo's profit is its price less its clips' cost: two pairs, four clips at 20 each.
    const pairSales = await sales(shop, `${OCTOBER}&bucket=month&productId=${pair.id}`);
    expect(pairSales.totals.profit).toMatchObject({ costOfGoods: '80.00', profit: '100.00' });
  });

  it("traces one product's trend month by month, leaving out what was not sold or all came back", async () => {
    const shop = await openShop(port, texts, 'sal');
    const lamp = await product(shop, 'Lamp', 300, 40, 100);
    const mug = await product(shop, 'Mug', 200, 40, 50);
    await sold(shop, '2026-08-10', [{ variantId: lamp.variantId, quantity: 1 }]);
    await sold(shop, '2026-09-10', [
      { variantId: lamp.variantId, quantity: 2 },
      { variantId: mug.variantId, quantity: 4 },
    ]);
    await sold(shop, '2026-10-10', [{ variantId: lamp.variantId, quantity: 3 }]);
    // Every lamp of this one came back: it is not counted.
    const returned = await sold(shop, '2026-10-11', [{ variantId: lamp.variantId, quantity: 2 }]);
    const back = await shop.post(`/orders/${returned.id}/returns`, {
      items: [{ lineId: returned.items[0]?.id, sellable: 2, damaged: 0 }],
    });
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    // Placed but never handed over.
    await placedOn(
      await place(shop, {
        fulfilmentType: 'takeaway',
        items: [{ variantId: lamp.variantId, quantity: 7 }],
      }),
      '2026-10-12',
    );

    const trend = await sales(
      shop,
      `dateFrom=2026-08-01&dateTo=2026-10-31&bucket=month&productId=${lamp.id}`,
    );
    expect(trend.productId).toBe(lamp.id);
    expect(
      trend.buckets.map((bucket) => [bucket.from, bucket.orders, bucket.units, bucket.revenue]),
    ).toEqual([
      ['2026-08-01', 1, [{ unit: 'piece', quantity: '1.000' }], '300.00'],
      ['2026-09-01', 1, [{ unit: 'piece', quantity: '2.000' }], '600.00'],
      ['2026-10-01', 1, [{ unit: 'piece', quantity: '3.000' }], '900.00'],
    ]);
    expect(trend.totals.deliveryCharges).toBeNull();
    const shopWide = await sales(shop, 'dateFrom=2026-08-01&dateTo=2026-10-31&bucket=quarter');
    expect(
      shopWide.buckets.map((bucket) => [bucket.from, bucket.to, bucket.orders, bucket.revenue]),
    ).toEqual([
      ['2026-08-01', '2026-09-30', 2, '1700.00'],
      ['2026-10-01', '2026-10-31', 1, '900.00'],
    ]);

    // Another shop asking after this lamp sees nothing of it (SEC-02).
    const other = await openShop(port, texts, 'sal');
    const theirs = await sales(
      other,
      `dateFrom=2026-08-01&dateTo=2026-10-31&bucket=month&productId=${lamp.id}`,
    );
    expect(theirs.totals).toMatchObject({ orders: 0, revenue: '0.00', units: [] });
    expect((await bestSellers(other, 'dateFrom=2026-08-01&dateTo=2026-10-31')).products).toEqual(
      [],
    );
  });
});
