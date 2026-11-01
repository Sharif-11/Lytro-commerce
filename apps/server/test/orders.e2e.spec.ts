import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditAction } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { translate } from '../src/common/i18n/messages';
import { dhakaDate } from '../src/common/time';
import { DataExportService } from '../src/modules/data-export/services/data-export.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { deleteJson, getJson, postJson, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 4 Slice 4.1: orders entered by staff -- numbering, pricing, stock held, snapshots, edits, the call log, cancel
// reasons, holds, deletion, the list and search, customers, idempotency, warnings, isolation and permissions.
// ORD-01 to ORD-14, ORD-41, ORD-45, ORD-46, ORD-51, ORD-52, PRD-06 to PRD-08, PRD-13, ATR-08, ATR-09, ATR-15, UOM-04,
// DLV-06, DLV-07, CUS-01, API-11 (D4-8), AUD-01, LIF-16. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_orders_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'orders-e2e-otp-secret-0123456789abcdefgh';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  // ORD-04's 50 orders at once queue on the day's counter: room for them all to wait their turn.
  process.env['DATABASE_POOL_MAX'] = '20';
  process.env['DATABASE_CONNECT_TIMEOUT_MS'] = '30000';
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

interface Product {
  id: string;
  variants: { id: string; optionIds: string[] }[];
}

interface Item {
  id: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  attributes: { name: string; value: string; variantDefining: boolean }[];
  captured: { attributeId: string; name: string; value: string }[];
  listPrice: string;
  unitPrice: string;
  quantity: string;
  itemTotal: string;
  deliveryCharge: string;
  advance: string;
}

interface Order {
  id: string;
  orderNumber: string;
  trackingId: string;
  status: string;
  override: string | null;
  holdUntil: string | null;
  confirmedAt: string | null;
  fulfilmentType: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryZone: { id: string; name: { en: string }; charge: string } | null;
  cancelReason: string | null;
  subtotal: string;
  deliveryCharge: string;
  deliveryChargeByHand: boolean;
  discount: string;
  grandTotal: string;
  advanceDue: string;
  codAmount: string;
  items: Item[];
  calls: { outcome: string; by: { id: string } | null }[];
  unansweredCalls: number;
  history: { field: string; from: string | null; to: string | null; note: string | null }[];
  warnings: { code: string; productName: string | null }[];
}

interface Page {
  orders: { id: string; orderNumber: string; status: string; items: number }[];
  total: number;
  pages: number;
}

interface Locations {
  zillas: { id: number; nameEn: string; thanas: { id: number; nameEn: string }[] }[];
}

let locations: Locations | null = null;

async function thanaId(shop: ShopClient, zilla: string, thana: string): Promise<number> {
  if (!locations) locations = (await shop.get('/locations')).body as Locations;
  const found = locations.zillas
    .find((row) => row.nameEn === zilla)
    ?.thanas.find((row) => row.nameEn === thana);
  if (!found) throw new Error(`no thana ${zilla}/${thana}`);
  return found.id;
}

/** A Bangladeshi mobile number no other test uses. */
function freshMobile(): string {
  return `017${String(randomInt(10_000_000, 99_999_999))}`;
}

async function product(
  shop: ShopClient,
  name: string,
  price: number,
  openingStock: number | null,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; variantId: string }> {
  const made = await shop.post('/products', {
    name,
    basePrice: price,
    variants: [{ optionIds: [], ...(openingStock !== null ? { openingStock } : {}) }],
    ...(openingStock === null ? { stockTracking: 'not_tracked' } : {}),
    ...extra,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const body = made.body as Product;
  return { id: body.id, variantId: body.variants[0]?.id ?? '' };
}

function send(
  shop: ShopClient,
  body: unknown,
  key: string | null = randomUUID(),
): Promise<HttpResult> {
  return postJson(
    port,
    '/orders',
    body,
    shop.headers(key === null ? {} : { 'idempotency-key': key }),
  );
}

async function delivery(shop: ShopClient, thana = 'Mirpur', zilla = 'Dhaka') {
  return {
    customerName: 'Rahima Akter',
    phone: freshMobile(),
    locationId: await thanaId(shop, zilla, thana),
    deliveryAddress: 'House 12, Road 3',
  };
}

async function place(shop: ShopClient, body: Record<string, unknown>): Promise<Order> {
  const made = await send(shop, body);
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as Order;
}

async function reserved(variantId: string): Promise<string> {
  const result = await admin.query<{ reserved: string }>(
    'SELECT reserved::text FROM tenant.stock_levels WHERE variant_id = $1',
    [variantId],
  );
  return result.rows[0]?.reserved ?? '0.000';
}

async function activity(tenantId: string, action: AuditAction): Promise<number> {
  const result = await admin.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2',
    [tenantId, action],
  );
  return result.rows[0]?.n ?? 0;
}

async function customerOf(tenantId: string, phone: string) {
  const result = await admin.query<{
    id: string;
    name: string | null;
    order_count: number;
    total_spent: string;
  }>(
    'SELECT id, name, order_count, total_spent::text FROM tenant.customers WHERE tenant_id = $1 AND phone = $2',
    [tenantId, phone],
  );
  return result.rows[0];
}

const today = (): string => {
  const day = dhakaDate(new Date());
  return `${day.slice(2, 4)}${day.slice(5, 7)}${day.slice(8, 10)}`;
};

describeIfDatabase('entering an order (ORD-01, ORD-04, ORD-05, ORD-06, PRD-07)', () => {
  it('numbers it by the day, prices it from the variants, holds its stock and logs it', async () => {
    const shop = await openShop(port, texts, 'ord');
    const shirt = await product(shop, 'Shirt', 500, 10);
    const shoes = await product(shop, 'Shoes', 300, 5);
    const order = await place(shop, {
      ...(await delivery(shop)),
      items: [
        { variantId: shirt.variantId, quantity: 2 },
        { variantId: shoes.variantId, quantity: 1 },
      ],
      deliveryCharge: 60,
      discount: 40,
      // ORD-06: a client's own totals are never read.
      grandTotal: 1,
    });
    expect(order.orderNumber).toBe(`${today()}-0001`);
    expect(order.trackingId).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    // ORD-06's example: 2 x 500 and 1 x 300, delivery 60 set by hand, discount 40.
    expect(order).toMatchObject({
      status: 'pending',
      subtotal: '1300.00',
      deliveryCharge: '60.00',
      deliveryChargeByHand: true,
      discount: '40.00',
      grandTotal: '1320.00',
      advanceDue: '0.00',
      codAmount: '1320.00',
    });
    expect(order.items.map((item) => [item.productName, item.quantity, item.itemTotal])).toEqual([
      ['Shirt', '2.000', '1000.00'],
      ['Shoes', '1.000', '300.00'],
    ]);
    // The hand-set charge is kept in the history beside the 70 TK the home zone would have charged.
    expect(order.history.map((row) => [row.field, row.from, row.to])).toEqual([
      ['created', null, 'pending'],
      ['delivery_charge', '70.00', '60.00'],
    ]);
    expect(await reserved(shirt.variantId)).toBe('2.000');
    expect(await reserved(shoes.variantId)).toBe('1.000');
    expect(await activity(shop.tenantId, AuditAction.OrderCreated)).toBe(1);

    const next = await place(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: shirt.variantId, quantity: 1 }],
    });
    expect(next.orderNumber).toBe(`${today()}-0002`);
    expect(next.deliveryCharge).toBe('70.00');
  });

  it('refuses an order asking more than is free, naming the product, and gives its number to the next one', async () => {
    const shop = await openShop(port, texts, 'ord');
    const vase = await product(shop, 'Clay vase', 800, 1);
    const refused = await send(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: vase.variantId, quantity: 2 }],
    });
    expect(refused.status).toBe(409);
    expect(errorOf(refused).message).toContain('Clay vase');
    const count = await admin.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM tenant.orders WHERE tenant_id = $1',
      [shop.tenantId],
    );
    expect(count.rows[0]?.n).toBe(0);
    expect(await reserved(vase.variantId)).toBe('0.000');
    const placed = await place(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: vase.variantId, quantity: 1 }],
    });
    expect(placed.orderNumber).toBe(`${today()}-0001`);
  });

  it('gives 50 orders made at once 50 distinct consecutive numbers (ORD-04)', async () => {
    const shop = await openShop(port, texts, 'ord');
    const cake = await product(shop, 'Cake', 1200, null);
    const address = await delivery(shop);
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        send(shop, { ...address, items: [{ variantId: cake.variantId, quantity: 1 }] }),
      ),
    );
    const failed = results.find((result) => result.status !== 201);
    expect(failed?.status, JSON.stringify(failed?.body)).toBeUndefined();
    const numbers = results.map((result) => (result.body as Order).orderNumber).sort();
    expect(numbers).toEqual(
      Array.from({ length: 50 }, (_, index) => `${today()}-${String(index + 1).padStart(4, '0')}`),
    );
  });

  it('gives two orders racing for the last unit one order and one refusal, never overselling (INV-01)', async () => {
    const shop = await openShop(port, texts, 'ord');
    const vase = await product(shop, 'Last vase', 900, 1);
    const [one, two] = await Promise.all([
      send(shop, {
        ...(await delivery(shop)),
        items: [{ variantId: vase.variantId, quantity: 1 }],
      }),
      send(shop, {
        ...(await delivery(shop)),
        items: [{ variantId: vase.variantId, quantity: 1 }],
      }),
    ]);
    expect([one.status, two.status].sort()).toEqual([201, 409]);
    expect(await reserved(vase.variantId)).toBe('1.000');
  });

  it('starts a confirmed order confirmed, and never refuses a made-to-order item for stock', async () => {
    const shop = await openShop(port, texts, 'ord');
    const cake = await product(shop, 'Birthday cake', 1500, null);
    const order = await place(shop, {
      ...(await delivery(shop)),
      status: 'confirmed',
      items: [{ variantId: cake.variantId, quantity: 30 }],
    });
    expect(order.status).toBe('confirmed');
    expect(order.confirmedAt).not.toBeNull();
  });
});

describeIfDatabase('what an order needs (ORD-01, MNU-04, UOM-04, PRD-06)', () => {
  it('names each missing or wrong field', async () => {
    const shop = await openShop(port, texts, 'ord');
    const missing = await send(shop, { locationId: 1, deliveryAddress: 'x', items: [] });
    expect(missing.status).toBe(400);
    expect(fieldsOf(missing)).toMatchObject({
      customerName: 'required',
      phone: 'required',
      items: 'too_few',
    });
    const badPhone = await send(shop, {
      customerName: 'A',
      phone: '12345',
      locationId: 1,
      deliveryAddress: 'x',
      items: [{ variantId: randomUUID(), quantity: 1 }],
    });
    expect(fieldsOf(badPhone)).toMatchObject({ phone: 'invalid_format' });
  });

  it('takes a takeaway with no address or charge, and a dine-in with only its table', async () => {
    const shop = await openShop(port, texts, 'ord');
    const tea = await product(shop, 'Tea', 40, null);
    const takeaway = await place(shop, {
      fulfilmentType: 'takeaway',
      customerName: 'Rafi',
      phone: freshMobile(),
      items: [{ variantId: tea.variantId, quantity: 2 }],
    });
    expect(takeaway).toMatchObject({
      deliveryCharge: '0.00',
      grandTotal: '80.00',
      deliveryZone: null,
    });
    const table = await place(shop, {
      fulfilmentType: 'dine_in',
      tableRef: 'Table 4',
      items: [{ variantId: tea.variantId, quantity: 1 }],
    });
    expect(table).toMatchObject({ deliveryCharge: '0.00', customerId: null, customerPhone: null });
    const refused = await send(shop, {
      fulfilmentType: 'takeaway',
      customerName: 'Rafi',
      phone: freshMobile(),
      deliveryAddress: 'Somewhere',
      deliveryCharge: 50,
      items: [{ variantId: tea.variantId, quantity: 1 }],
    });
    expect(fieldsOf(refused)).toMatchObject({
      deliveryAddress: 'not_allowed',
      deliveryCharge: 'not_allowed',
    });
    expect(fieldsOf(await send(shop, { fulfilmentType: 'dine_in', items: [] }))).toMatchObject({
      tableRef: 'required',
    });
  });

  it('takes a fraction only of a measured unit, and lets staff order an inactive product', async () => {
    const shop = await openShop(port, texts, 'ord');
    const rice = await product(shop, 'Rice', 90, 10, { stockUnit: 'kg' });
    const soap = await product(shop, 'Soap', 60, 10);
    const order = await place(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: rice.variantId, quantity: 2.5 }],
    });
    expect(order.items[0]).toMatchObject({ quantity: '2.500', itemTotal: '225.00' });
    const fraction = await send(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: soap.variantId, quantity: 0.5 }],
    });
    expect(fieldsOf(fraction)).toMatchObject({ 'items.0.quantity': 'not_whole_number' });
    expect((await shop.patch(`/products/${soap.id}`, { active: false })).status).toBe(200);
    await place(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: soap.variantId, quantity: 1 }],
    });
  });
});

describeIfDatabase('delivery and advance (ORD-06a, RAT-14, PRD-08, ORD-16, DLV-06, DLV-07)', () => {
  it('charges the zone once, each line with its own charge by its own mode, and the weight over 1 kg', async () => {
    const shop = await openShop(port, texts, 'ord');
    expect((await shop.patch('/shop-settings', { extraDeliveryChargePerKg: 20 })).status).toBe(200);
    const shirt = await product(shop, 'Shirt', 500, 10);
    const lamp = await product(shop, 'Lamp', 900, 10, {
      deliveryCharge: 120,
      deliveryMode: 'default',
    });
    const jar = await product(shop, 'Honey jar', 400, 10, {
      deliveryCharge: 120,
      weightKg: 0.6,
      deliveryMode: 'adjustable',
    });
    const order = await place(shop, {
      ...(await delivery(shop, 'Rajpara', 'Rajshahi')),
      items: [
        { variantId: shirt.variantId, quantity: 2 },
        { variantId: lamp.variantId, quantity: 3 },
        { variantId: jar.variantId, quantity: 3 },
      ],
    });
    // The fallback zone's 130 once, 3 x 120 by Default, and 120 + 20 x 0.8 kg by Adjustable.
    expect(order.items.map((item) => item.deliveryCharge)).toEqual(['0.00', '360.00', '136.00']);
    expect(order.deliveryCharge).toBe('626.00');
    expect(order.deliveryZone).toMatchObject({ charge: '130.00' });
  });

  it('asks a partial advance per line and the delivery charge once for delivery-charge-only', async () => {
    const shop = await openShop(port, texts, 'ord');
    const phone = await product(shop, 'Phone', 15000, 5, {
      paymentPolicy: 'partial_advance',
      advanceAmount: 300,
    });
    const order = await place(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: phone.variantId, quantity: 1 }],
    });
    expect(order).toMatchObject({
      grandTotal: '15070.00',
      advanceDue: '300.00',
      codAmount: '14770.00',
    });
    const shirt = await product(shop, 'Shirt', 1200, 5, { paymentPolicy: 'delivery_charge_only' });
    const outside = await place(shop, {
      ...(await delivery(shop, 'Rajpara', 'Rajshahi')),
      items: [{ variantId: shirt.variantId, quantity: 1 }],
    });
    // PRD-08's example: a 1,200 TK shirt delivered outside the city at 130 TK asks 130 first.
    expect(outside).toMatchObject({ advanceDue: '130.00', codAmount: '1200.00' });
  });

  it('warns staff of a no-delivery zone and of a product limited to other zones, and still saves', async () => {
    const shop = await openShop(port, texts, 'ord');
    const zones = (await shop.get('/delivery-zones')).body as {
      zones: { id: string; isHome: boolean; isFallback: boolean }[];
    };
    const home = zones.zones.find((zone) => zone.isHome)?.id ?? '';
    const outside = zones.zones.find((zone) => zone.isFallback)?.id ?? '';
    expect((await shop.patch(`/delivery-zones/${outside}`, { noDelivery: true })).status).toBe(200);
    const fish = await product(shop, 'Frozen fish', 700, 5);
    expect(
      (await shop.put(`/products/${fish.id}/delivery-zones`, { zoneIds: [home] })).status,
    ).toBe(200);
    const order = await place(shop, {
      ...(await delivery(shop, 'Rajpara', 'Rajshahi')),
      items: [{ variantId: fish.variantId, quantity: 1 }],
    });
    expect(order.warnings.map((warning) => [warning.code, warning.productName])).toEqual([
      ['zone_no_delivery', null],
      ['product_not_delivered_here', 'Frozen fish'],
    ]);
    const quoted = await shop.post('/orders/quote', {
      ...(await delivery(shop)),
      items: [{ variantId: fish.variantId, quantity: 2 }],
    });
    expect(quoted.status).toBe(200);
    expect(quoted.body).toMatchObject({ subtotal: '1400.00', grandTotal: '1470.00', warnings: [] });
    expect(await reserved(fish.variantId)).toBe('1.000');
  });

  it("prices a quote before the customer's details are in, and still refuses an order without them (Slice 4.8a)", async () => {
    const shop = await openShop(port, texts, 'ord');
    const shirt = await product(shop, 'Shirt', 500, 10);
    const items = [{ variantId: shirt.variantId, quantity: 2 }];
    const bare = await shop.post('/orders/quote', { items });
    expect(bare.status, JSON.stringify(bare.body)).toBe(200);
    expect(bare.body).toMatchObject({ subtotal: '1000.00', deliveryZone: null });
    const { locationId } = await delivery(shop);
    const placed = await shop.post('/orders/quote', { locationId, items });
    expect(placed.status).toBe(200);
    expect(placed.body).toMatchObject({ subtotal: '1000.00', grandTotal: '1070.00' });
    expect(fieldsOf(await send(shop, { locationId, items }))).toMatchObject({
      customerName: 'required',
      phone: 'required',
      deliveryAddress: 'required',
    });
    expect(await reserved(shirt.variantId)).toBe('0.000');
  });
});

describeIfDatabase('the line as it was (ORD-46, ATR-08, ATR-09, PRD-13)', () => {
  it('keeps the name, values, captured text and price after the product is renamed and deleted', async () => {
    const shop = await openShop(port, texts, 'ord');
    const attributes = (await shop.get('/attributes')).body as {
      id: string;
      name: string;
      scope: string;
    }[];
    const colour =
      attributes.find((row) => row.name === 'Color' && row.scope === 'platform')?.id ?? '';
    const options = await shop.post(`/attributes/${colour}/options/batch`, { values: ['Red'] });
    const red = (options.body as { id: string }[])[0]?.id ?? '';
    const text = await shop.post('/attributes', { name: 'Name on the cake', dataType: 'text' });
    expect(text.status, JSON.stringify(text.body)).toBe(201);
    const asked = (text.body as { id: string }).id;
    const made = await shop.post('/products', {
      name: 'Cake',
      basePrice: 1500,
      stockTracking: 'not_tracked',
      variantAttributes: [{ attributeId: colour, optionIds: [red] }],
      variants: [{ optionIds: [red] }],
      attributes: [{ attributeId: asked, role: 'captured_at_order' }],
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const cake = made.body as Product;
    const order = await place(shop, {
      ...(await delivery(shop)),
      items: [
        {
          variantId: cake.variants[0]?.id,
          quantity: 1,
          captured: [{ attributeId: asked, value: 'Rafi' }],
        },
      ],
    });
    const notAsked = await send(shop, {
      ...(await delivery(shop)),
      items: [
        {
          variantId: cake.variants[0]?.id,
          quantity: 1,
          captured: [{ attributeId: colour, value: 'x' }],
        },
      ],
    });
    expect(fieldsOf(notAsked)).toMatchObject({ 'items.0.captured.0.attributeId': 'not_found' });

    expect((await shop.patch(`/products/${cake.id}`, { name: 'Renamed cake' })).status).toBe(200);
    expect((await shop.delete(`/products/${cake.id}?hard=true`)).status).toBe(200);
    const read = (await shop.get(`/orders/${order.id}`)).body as Order;
    expect(read.items[0]).toMatchObject({
      productName: 'Cake',
      unitPrice: '1500.00',
      itemTotal: '1500.00',
      attributes: [{ name: 'Color', value: 'Red', variantDefining: true }],
      captured: [{ name: 'Name on the cake', value: 'Rafi' }],
    });
  });

  it('refuses to change which attributes split a product once it has orders (ATR-15)', async () => {
    const shop = await openShop(port, texts, 'ord');
    const attributes = (await shop.get('/attributes')).body as {
      id: string;
      name: string;
      scope: string;
    }[];
    const size =
      attributes.find((row) => row.name === 'Size' && row.scope === 'platform')?.id ?? '';
    const options = await shop.post(`/attributes/${size}/options/batch`, { values: ['M', 'L'] });
    const ids = (options.body as { id: string }[]).map((row) => row.id);
    const made = await shop.post('/products', {
      name: 'T-shirt',
      basePrice: 450,
      variantAttributes: [{ attributeId: size, optionIds: ids }],
      variants: ids.map((id) => ({ optionIds: [id], openingStock: 3 })),
    });
    const shirt = made.body as Product;
    const unsplit = { variantAttributes: [], variants: [{ optionIds: [] }] };
    await place(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: shirt.variants[0]?.id, quantity: 1 }],
    });
    const refused = await shop.put(`/products/${shirt.id}/variants`, unsplit);
    expect(refused.status).toBe(409);
    expect(errorOf(refused).code).toBe('conflict');
  });
});

describeIfDatabase('changing an order (ORD-11)', () => {
  it('re-holds changed items, keeps prices ordered at, records hand-set prices, refuses a shortfall whole', async () => {
    const shop = await openShop(port, texts, 'ord');
    const shirt = await product(shop, 'Shirt', 500, 5);
    const cap = await product(shop, 'Cap', 200, 5);
    const order = await place(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: shirt.variantId, quantity: 2 }],
    });
    const line = order.items[0]?.id ?? '';
    // A price change on the product after ordering does not move the line.
    expect((await shop.patch(`/products/${shirt.id}`, { basePrice: 650 })).status).toBe(200);
    const changed = await shop.patch(`/orders/${order.id}`, {
      items: [
        { lineId: line, variantId: shirt.variantId, quantity: 3, unitPrice: 450 },
        { variantId: cap.variantId, quantity: 1 },
      ],
    });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    const edited = changed.body as Order;
    expect(
      edited.items.map((item) => [item.productName, item.listPrice, item.unitPrice, item.quantity]),
    ).toEqual([
      ['Shirt', '500.00', '450.00', '3.000'],
      ['Cap', '200.00', '200.00', '1.000'],
    ]);
    expect(edited.subtotal).toBe('1550.00');
    expect(edited.history.at(-1)).toMatchObject({
      field: 'unit_price',
      from: '500.00',
      to: '450.00',
    });
    expect(await reserved(shirt.variantId)).toBe('3.000');
    expect(await reserved(cap.variantId)).toBe('1.000');

    const short = await shop.patch(`/orders/${order.id}`, {
      items: [{ lineId: line, variantId: shirt.variantId, quantity: 9 }],
    });
    expect(short.status).toBe(409);
    expect(await reserved(shirt.variantId)).toBe('3.000');
    expect(await reserved(cap.variantId)).toBe('1.000');

    const dropped = await shop.patch(`/orders/${order.id}`, {
      items: [{ lineId: line, variantId: shirt.variantId, quantity: 3 }],
      customerName: 'Rahima A.',
    });
    expect(dropped.status).toBe(200);
    expect((dropped.body as Order).items).toHaveLength(1);
    expect(await reserved(cap.variantId)).toBe('0.000');
    expect(await activity(shop.tenantId, AuditAction.OrderUpdated)).toBe(2);
  });
});

describeIfDatabase('calls, holds and cancelling (ORD-41, ORD-51, ORD-52, ORD-10)', () => {
  it('logs an unanswered call, holds on call back later, then confirms on a confirming call', async () => {
    const shop = await openShop(port, texts, 'ord');
    const shirt = await product(shop, 'Shirt', 500, 5);
    const order = await place(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: shirt.variantId, quantity: 1 }],
    });
    const first = (await shop.post(`/orders/${order.id}/calls`, { outcome: 'no_answer' }))
      .body as Order;
    expect(first).toMatchObject({ status: 'pending', unansweredCalls: 1 });
    const later = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const held = (
      await shop.post(`/orders/${order.id}/calls`, {
        outcome: 'call_back_later',
        callBackAt: later,
      })
    ).body as Order;
    expect(held).toMatchObject({ status: 'hold', override: 'hold' });
    expect(held.holdUntil).toBe(later);
    const confirmed = (
      await shop.post(`/orders/${order.id}/calls`, {
        outcome: 'confirmed',
        note: 'Wants it by Friday',
      })
    ).body as Order;
    expect(confirmed).toMatchObject({ status: 'confirmed', override: null, holdUntil: null });
    expect(confirmed.calls.map((call) => call.outcome)).toEqual([
      'no_answer',
      'call_back_later',
      'confirmed',
    ]);
    expect(confirmed.calls.every((call) => call.by !== null)).toBe(true);
    const past = await shop.post(`/orders/${order.id}/calls`, {
      outcome: 'call_back_later',
      callBackAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(fieldsOf(past)).toMatchObject({ callBackAt: 'out_of_range' });
    expect(await activity(shop.tenantId, AuditAction.OrderCallLogged)).toBe(3);
  });

  it('holds and clears by hand, cancels with a reason releasing stock once, and filters by that reason', async () => {
    const shop = await openShop(port, texts, 'ord');
    const shirt = await product(shop, 'Shirt', 500, 5);
    const order = await place(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: shirt.variantId, quantity: 2 }],
    });
    const held = await shop.post(`/orders/${order.id}/override`, { override: 'hold' });
    expect((held.body as Order).status).toBe('hold');
    const cleared = await shop.post(`/orders/${order.id}/override`, { override: null });
    expect((cleared.body as Order).status).toBe('pending');
    expect(fieldsOf(await shop.post(`/orders/${order.id}/cancel`, {}))).toMatchObject({
      reason: 'required',
    });
    expect(
      fieldsOf(await shop.post(`/orders/${order.id}/cancel`, { reason: 'other' })),
    ).toMatchObject({
      note: 'required',
    });
    const cancelled = await shop.post(`/orders/${order.id}/cancel`, { reason: 'fake_order' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: 'cancelled', cancelReason: 'fake_order' });
    expect(await reserved(shirt.variantId)).toBe('0.000');
    expect((await shop.post(`/orders/${order.id}/cancel`, { reason: 'duplicate' })).status).toBe(
      409,
    );
    expect((await shop.patch(`/orders/${order.id}`, { notes: 'x' })).status).toBe(409);
    expect((await shop.post(`/orders/${order.id}/override`, { override: 'hold' })).status).toBe(
      409,
    );
    const listed = (await shop.get('/orders?cancelReason=fake_order')).body as Page;
    expect(listed.orders.map((row) => row.id)).toEqual([order.id]);
  });

  it('cancels from a call, and refuses to cancel a shipped order', async () => {
    const shop = await openShop(port, texts, 'ord');
    const shirt = await product(shop, 'Shirt', 500, 5);
    const order = await place(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: shirt.variantId, quantity: 1 }],
    });
    const called = await shop.post(`/orders/${order.id}/calls`, {
      outcome: 'cancelled',
      reason: 'customer_cancelled',
    });
    expect(called.body).toMatchObject({ status: 'cancelled', cancelReason: 'customer_cancelled' });
    const shipped = await place(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: shirt.variantId, quantity: 1 }],
    });
    await admin.query("UPDATE tenant.orders SET fulfillment_status = 'shipped' WHERE id = $1", [
      shipped.id,
    ]);
    const refused = await shop.post(`/orders/${shipped.id}/cancel`, { reason: 'unreachable' });
    expect(refused.status).toBe(409);
    expect(errorOf(refused).message).toBe(translate('OrderShippedReturnInstead', 'bn'));
  });
});

describeIfDatabase('deleting an order (ORD-12)', () => {
  it('deletes one not shipped and unpaid, letting its stock go and keeping its number used', async () => {
    const shop = await openShop(port, texts, 'ord');
    const shirt = await product(shop, 'Shirt', 500, 5);
    const order = await place(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: shirt.variantId, quantity: 2 }],
    });
    await shop.post(`/orders/${order.id}/calls`, { outcome: 'no_answer' });
    const deleted = await shop.delete(`/orders/${order.id}`);
    expect(deleted.status).toBe(200);
    expect((await shop.get(`/orders/${order.id}`)).status).toBe(404);
    expect(await reserved(shirt.variantId)).toBe('0.000');
    expect(await activity(shop.tenantId, AuditAction.OrderDeleted)).toBe(1);
    const next = await place(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: shirt.variantId, quantity: 1 }],
    });
    expect(next.orderNumber).toBe(`${today()}-0002`);
  });

  it('refuses a shipped order and a paid one', async () => {
    const shop = await openShop(port, texts, 'ord');
    const cake = await product(shop, 'Cake', 900, null);
    const shipped = await place(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: cake.variantId, quantity: 1 }],
    });
    const paid = await place(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: cake.variantId, quantity: 1 }],
    });
    await admin.query("UPDATE tenant.orders SET fulfillment_status = 'shipped' WHERE id = $1", [
      shipped.id,
    ]);
    await admin.query("UPDATE tenant.orders SET payment_status = 'paid' WHERE id = $1", [paid.id]);
    expect((await shop.delete(`/orders/${shipped.id}`)).status).toBe(409);
    expect((await shop.delete(`/orders/${paid.id}`)).status).toBe(409);
  });
});

describeIfDatabase('the order list (ORD-13, ORD-45, DAT-13)', () => {
  it('filters by status and either axis, searches by name, phone and number, and pages at 20', async () => {
    const shop = await openShop(port, texts, 'ord');
    const cake = await product(shop, 'Cake', 900, null);
    const made: Order[] = [];
    for (let n = 0; n < 22; n += 1) {
      made.push(
        await place(shop, {
          ...(await delivery(shop)),
          customerName: n === 0 ? 'Nusrat Jahan' : 'Rahima Akter',
          items: [{ variantId: cake.variantId, quantity: 1 }],
        }),
      );
    }
    const first = made[0] as Order;
    const page = (await shop.get('/orders')).body as Page;
    expect(page).toMatchObject({ total: 22, pages: 2 });
    expect(page.orders).toHaveLength(20);
    expect(page.orders[0]?.id).toBe(made[21]?.id);
    expect(page.orders[0]?.items).toBe(1);
    const byName = (await shop.get('/orders?q=nusrat')).body as Page;
    expect(byName.orders.map((row) => row.id)).toEqual([first.id]);
    const digits = (first.customerPhone ?? '').slice(-4);
    expect(
      ((await shop.get(`/orders?q=${digits}`)).body as Page).orders.map((row) => row.id),
    ).toContain(first.id);
    const byNumber = (await shop.get(`/orders?q=${first.orderNumber.slice(-4)}`)).body as Page;
    expect(byNumber.orders.map((row) => row.id)).toContain(first.id);
    await shop.post(`/orders/${first.id}/calls`, { outcome: 'confirmed' });
    const confirmed = (await shop.get('/orders?status=confirmed')).body as Page;
    expect(confirmed.orders.map((row) => row.id)).toEqual([first.id]);
    await admin.query(
      "UPDATE tenant.orders SET fulfillment_status = 'partially_shipped' WHERE id = $1",
      [first.id],
    );
    const partly = (await shop.get('/orders?fulfillmentStatus=partially_shipped')).body as Page;
    expect(partly.orders.map((row) => [row.id, row.status])).toEqual([
      [first.id, 'partial_delivered'],
    ]);
    expect(((await shop.get('/orders?paymentStatus=paid')).body as Page).total).toBe(0);
    const day = dhakaDate(new Date());
    expect(((await shop.get(`/orders?dateFrom=${day}&dateTo=${day}`)).body as Page).total).toBe(22);
    expect(((await shop.get('/orders?dateTo=2020-01-01')).body as Page).total).toBe(0);
  });
});

describeIfDatabase('customers from orders (CUS-01)', () => {
  it('keeps one customer per phone, counting orders not cancelled and spending on delivered ones', async () => {
    const shop = await openShop(port, texts, 'ord');
    const cake = await product(shop, 'Cake', 900, null);
    const phone = freshMobile();
    const address = { ...(await delivery(shop)), phone };
    const one = await place(shop, {
      ...address,
      items: [{ variantId: cake.variantId, quantity: 1 }],
    });
    await place(shop, {
      ...address,
      customerName: 'Rahima Begum',
      items: [{ variantId: cake.variantId, quantity: 2 }],
    });
    expect(await customerOf(shop.tenantId, phone)).toMatchObject({
      name: 'Rahima Begum',
      order_count: 2,
      total_spent: '0.00',
    });
    await shop.post(`/orders/${one.id}/cancel`, { reason: 'duplicate' });
    expect((await customerOf(shop.tenantId, phone))?.order_count).toBe(1);
    const delivered = await place(shop, {
      ...address,
      items: [{ variantId: cake.variantId, quantity: 1 }],
    });
    await admin.query("UPDATE tenant.orders SET fulfillment_status = 'delivered' WHERE id = $1", [
      delivered.id,
    ]);
    await place(shop, { ...address, items: [{ variantId: cake.variantId, quantity: 1 }] });
    expect(await customerOf(shop.tenantId, phone)).toMatchObject({
      order_count: 3,
      total_spent: delivered.grandTotal,
    });
  });
});

describeIfDatabase('idempotency on order creation (API-11, ORD-21, D4-8)', () => {
  it('requires the key, replays the same order for the same key and body, refuses another body', async () => {
    const shop = await openShop(port, texts, 'ord');
    const cake = await product(shop, 'Cake', 900, null);
    const body = { ...(await delivery(shop)), items: [{ variantId: cake.variantId, quantity: 1 }] };
    const missing = await send(shop, body, null);
    expect(missing.status).toBe(400);
    expect(errorOf(missing).code).toBe('validation_error');
    const key = randomUUID();
    const first = await send(shop, body, key);
    const again = await send(shop, body, key);
    expect(again.status).toBe(201);
    expect(again.headers['idempotent-replay']).toBe('true');
    expect((again.body as Order).id).toBe((first.body as Order).id);
    const other = await send(shop, { ...body, notes: 'changed' }, key);
    expect(other.status).toBe(422);
  });

  it('makes one order from two requests sent at once with one key, and lets a failed one run again', async () => {
    const shop = await openShop(port, texts, 'ord');
    const vase = await product(shop, 'Vase', 900, 1);
    const body = { ...(await delivery(shop)), items: [{ variantId: vase.variantId, quantity: 1 }] };
    const key = randomUUID();
    const [first, second] = await Promise.all([send(shop, body, key), send(shop, body, key)]);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect((first.body as Order).id).toBe((second.body as Order).id);
    const count = await admin.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM tenant.orders WHERE tenant_id = $1',
      [shop.tenantId],
    );
    expect(count.rows[0]?.n).toBe(1);

    const retryKey = randomUUID();
    const short = { ...body, items: [{ variantId: vase.variantId, quantity: 1 }] };
    expect((await send(shop, short, retryKey)).status).toBe(409);
    // D4-8: the refused request gave its key back, so once stock arrives the same key runs again.
    const added = await shop.post(
      `/products/${vase.id}/variants/${vase.variantId}/stock-additions`,
      {
        quantity: 1,
      },
    );
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    expect((await send(shop, short, retryKey)).status).toBe(201);
  });
});

describeIfDatabase("another shop's orders (SEC-02, TEN-03)", () => {
  it('answers 404 for every route on an order of another shop, and refuses its variants', async () => {
    const shop = await openShop(port, texts, 'ord');
    const other = await openShop(port, texts, 'ord');
    const cake = await product(other, 'Cake', 900, 2);
    const theirs = await place(other, {
      ...(await delivery(other)),
      items: [{ variantId: cake.variantId, quantity: 1 }],
    });
    expect((await shop.get(`/orders/${theirs.id}`)).status).toBe(404);
    expect((await shop.patch(`/orders/${theirs.id}`, { notes: 'x' })).status).toBe(404);
    expect((await shop.post(`/orders/${theirs.id}/calls`, { outcome: 'no_answer' })).status).toBe(
      404,
    );
    expect((await shop.post(`/orders/${theirs.id}/cancel`, { reason: 'duplicate' })).status).toBe(
      404,
    );
    expect((await shop.post(`/orders/${theirs.id}/override`, { override: 'hold' })).status).toBe(
      404,
    );
    expect((await shop.delete(`/orders/${theirs.id}`)).status).toBe(404);
    expect(((await shop.get('/orders')).body as Page).total).toBe(0);
    const refused = await send(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: cake.variantId, quantity: 1 }],
    });
    expect(fieldsOf(refused)).toMatchObject({ 'items.0.variantId': 'not_found' });
    expect(await reserved(cake.variantId)).toBe('1.000');
    expect((await other.get(`/orders/${theirs.id}`)).status).toBe(200);
  });

  it('lets orders:read read but not make, and orders:manage not delete (ORD-12)', async () => {
    const shop = await openShop(port, texts, 'ord');
    const cake = await product(shop, 'Cake', 900, null);
    const order = await place(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: cake.variantId, quantity: 1 }],
    });
    const reader = await staffWith(port, texts, admin, shop, ['orders:read']);
    expect((await getJson(port, `/orders/${order.id}`, reader)).status).toBe(200);
    const made = await postJson(
      port,
      '/orders',
      { ...(await delivery(shop)), items: [{ variantId: cake.variantId, quantity: 1 }] },
      { ...reader, 'idempotency-key': randomUUID() },
    );
    expect(made.status).toBe(403);

    // A seat for one staff member a shop: the manager works in a second shop.
    const second = await openShop(port, texts, 'ord');
    const tea = await product(second, 'Tea', 40, null);
    const theirs = await place(second, {
      ...(await delivery(second)),
      items: [{ variantId: tea.variantId, quantity: 1 }],
    });
    const manager = await staffWith(port, texts, admin, second, ['orders:read', 'orders:manage']);
    expect((await deleteJson(port, `/orders/${theirs.id}`, manager)).status).toBe(403);
  });
});

describeIfDatabase('orders in the data export (LIF-16)', () => {
  it('writes the orders, their items and the customers into the export', async () => {
    const shop = await openShop(port, texts, 'ord');
    const cake = await product(shop, 'Cake', 900, null);
    await place(shop, {
      ...(await delivery(shop)),
      items: [{ variantId: cake.variantId, quantity: 1 }],
    });
    const requested = await shop.post('/exports', {});
    expect(requested.status, JSON.stringify(requested.body)).toBe(201);
    const exportId = (requested.body as { id: string }).id;
    await app.get(DataExportService).generate(shop.tenantId, exportId);
    const stored = await admin.query<{ status: string; file_content: Buffer }>(
      'SELECT status, file_content FROM tenant.data_exports WHERE id = $1',
      [exportId],
    );
    expect(stored.rows[0]?.status).toBe('ready');
    const names = stored.rows[0]?.file_content.toString('latin1') ?? '';
    for (const name of ['orders.csv', 'order-items.csv', 'orders.json', 'customers.csv']) {
      expect(names).toContain(name);
    }
  });
});
