import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditAction } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson, postJson, sendExact, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 4 Slice 4.6a, read agreed 2026-10-30: a shop's tax classes (TAX-01) -- prices include the tax, so a class only
// says how much of a price is tax; items are taxed after their discounts, the delivery charge never; each order line
// keeps the class and rate it was ordered under (TAX-02); and an order shows a tax line per class (TAX-03). New products
// start with the shop's default class. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_tax_classes_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'tax-classes-e2e-otp-secret-0123456789abcdefg';
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

interface Classes {
  classes: { id: string; name: string; rate: string }[];
  defaultId: string | null;
}

interface Order {
  id: string;
  grandTotal: string;
  deliveryCharge: string;
  items: {
    id: string;
    variantId: string;
    taxClassName: string | null;
    taxRate: string | null;
    taxAmount: string;
  }[];
  taxes: { name: string; rate: string; amount: string }[];
}

async function named(shop: ShopClient, name: string, rate: number): Promise<string> {
  const made = await shop.post('/tax-classes', { name, rate });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const found = (made.body as Classes).classes.find((row) => row.name === name);
  if (!found) throw new Error(`no class ${name}`);
  return found.id;
}

async function product(
  shop: ShopClient,
  name: string,
  price: number,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; variantId: string; taxClass: { id: string } | null }> {
  const made = await shop.post('/products', {
    name,
    basePrice: price,
    variants: [{ optionIds: [], openingStock: 50 }],
    ...extra,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const body = made.body as {
    id: string;
    variants: { id: string }[];
    taxClass: { id: string } | null;
  };
  return { id: body.id, variantId: body.variants[0]?.id ?? '', taxClass: body.taxClass };
}

async function takeaway(
  shop: ShopClient,
  items: { variantId: string; quantity: number }[],
  extra: Record<string, unknown> = {},
): Promise<Order> {
  const made = await postJson(
    port,
    '/orders',
    {
      customerName: 'Rahima',
      phone: texts.freshPhone(),
      fulfilmentType: 'takeaway',
      items,
      ...extra,
    },
    shop.headers({ 'idempotency-key': randomUUID() }),
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as Order;
}

describeIfDatabase("a shop's tax classes (TAX-01)", () => {
  it('names classes with a rate, one name each ignoring case, and refuses a rate past 100 or of three decimals', async () => {
    const shop = await openShop(port, texts, 'tax');
    await named(shop, 'Stationery', 15);
    await named(shop, 'Books', 0);
    const listed = (await shop.get('/tax-classes')).body as Classes;
    expect(listed).toEqual({
      classes: [
        { id: expect.any(String) as string, name: 'Books', rate: '0.00' },
        { id: expect.any(String) as string, name: 'Stationery', rate: '15.00' },
      ],
      defaultId: null,
    });
    const twice = await shop.post('/tax-classes', { name: 'stationery', rate: 5 });
    expect(twice.status).toBe(409);
    expect(fieldsOf(twice)).toEqual({ name: 'taken' });
    expect((await shop.post('/tax-classes', { name: 'Odd', rate: 101 })).status).toBe(400);
    expect(fieldsOf(await shop.post('/tax-classes', { name: 'Odd', rate: 7.555 }))).toEqual({
      rate: 'too_many_decimals',
    });
  });

  it('keeps 20 at most, and deletes only a class no product uses', async () => {
    const shop = await openShop(port, texts, 'tax');
    for (let n = 1; n <= 20; n += 1) await named(shop, `Class ${String(n)}`, n);
    expect((await shop.post('/tax-classes', { name: 'One more', rate: 1 })).status).toBe(409);
    const listed = (await shop.get('/tax-classes')).body as Classes;
    const used = listed.classes[0]?.id ?? '';
    const free = listed.classes[1]?.id ?? '';
    await product(shop, 'Pen', 10, { taxClassId: used });
    const refused = await shop.delete(`/tax-classes/${used}`);
    expect(refused.status).toBe(409);
    expect(errorOf(refused).details).toMatchObject({ products: 1 });
    expect((await shop.delete(`/tax-classes/${free}`)).status).toBe(200);
    expect(((await shop.get('/tax-classes')).body as Classes).classes).toHaveLength(19);
    await expect(
      admin.query('DELETE FROM tenant.tax_classes WHERE id = $1', [used]),
    ).rejects.toThrow(/products_tax_class_fk/);
  });

  it("starts each new product with the shop's default, which a product may change or clear", async () => {
    const shop = await openShop(port, texts, 'tax');
    const vat = await named(shop, 'VAT', 15);
    const other = await named(shop, 'Reduced', 5);
    expect((await product(shop, 'Before', 100)).taxClass).toBeNull();
    const set = await shop.put('/tax-classes/default', { taxClassId: vat });
    expect((set.body as Classes).defaultId).toBe(vat);
    const after = await product(shop, 'After', 100);
    expect(after.taxClass).toMatchObject({ id: vat, name: 'VAT', rate: '15.00' });
    expect((await product(shop, 'Untaxed', 100, { taxClassId: null })).taxClass).toBeNull();
    expect(
      (await product(shop, 'Reduced item', 100, { taxClassId: other })).taxClass,
    ).toMatchObject({
      id: other,
    });
    const changed = await shop.patch(`/products/${after.id}`, { taxClassId: other });
    expect((changed.body as { taxClass: { id: string } }).taxClass.id).toBe(other);
    const cleared = await shop.patch(`/products/${after.id}`, { taxClassId: null });
    expect((cleared.body as { taxClass: unknown }).taxClass).toBeNull();
    const copy = await shop.post(
      `/products/${(await product(shop, 'Copied', 100)).id}/duplicate`,
      {},
    );
    expect((copy.body as { taxClass: { id: string } }).taxClass.id).toBe(vat);
    const unused = await named(shop, 'Unused', 1);
    await shop.put('/tax-classes/default', { taxClassId: unused });
    expect((await shop.delete(`/tax-classes/${unused}`)).status).toBe(200);
    expect(((await shop.get('/tax-classes')).body as Classes).defaultId).toBeNull();
    expect(
      (
        await admin.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2',
          [shop.tenantId, AuditAction.TaxClassSaved],
        )
      ).rows[0]?.n,
    ).toBeGreaterThanOrEqual(4);
  });

  it("never reaches another shop's class (SEC-02), and lets only settings:manage change them", async () => {
    const shop = await openShop(port, texts, 'tax');
    const other = await openShop(port, texts, 'tax');
    const theirs = await named(other, 'VAT', 15);
    expect(((await shop.get('/tax-classes')).body as Classes).classes).toEqual([]);
    expect((await shop.patch(`/tax-classes/${theirs}`, { rate: 1 })).status).toBe(404);
    expect((await shop.delete(`/tax-classes/${theirs}`)).status).toBe(404);
    expect(fieldsOf(await shop.put('/tax-classes/default', { taxClassId: theirs }))).toEqual({
      taxClassId: 'not_found',
    });
    const refused = await shop.post('/products', {
      name: 'Pen',
      basePrice: 10,
      taxClassId: theirs,
      variants: [{ optionIds: [] }],
    });
    expect(fieldsOf(refused)).toEqual({ taxClassId: 'not_found' });
    expect(((await other.get('/tax-classes')).body as Classes).classes[0]?.rate).toBe('15.00');
    const reader = await staffWith(port, texts, admin, shop, ['products:read']);
    expect((await getJson(port, '/tax-classes', reader)).status).toBe(200);
    expect((await postJson(port, '/tax-classes', { name: 'X', rate: 1 }, reader)).status).toBe(403);
  });
});

describeIfDatabase('tax on an order (TAX-02, TAX-03)', () => {
  it('takes the tax out of the price, after the discounts, never adding it, a line per class', async () => {
    const shop = await openShop(port, texts, 'tax');
    const vat = await named(shop, 'VAT', 15);
    const books = await named(shop, 'Books', 0);
    const pen = await product(shop, 'Pen', 115, { taxClassId: vat });
    const novel = await product(shop, 'Novel', 300, { taxClassId: books });
    const bag = await product(shop, 'Bag', 200);
    const order = await takeaway(shop, [
      { variantId: pen.variantId, quantity: 2 },
      { variantId: novel.variantId, quantity: 1 },
      { variantId: bag.variantId, quantity: 1 },
    ]);
    expect(order.grandTotal).toBe('730.00');
    expect(order.items.map((row) => [row.taxClassName, row.taxRate, row.taxAmount])).toEqual([
      ['VAT', '15.00', '30.00'],
      ['Books', '0.00', '0.00'],
      [null, null, '0.00'],
    ]);
    expect(order.taxes).toEqual([
      { name: 'Books', rate: '0.00', amount: '0.00' },
      { name: 'VAT', rate: '15.00', amount: '30.00' },
    ]);
    // The order's discount is shared by the lines' totals: 23 off a 230 pen line leaves 207, of which 27 is tax.
    const discounted = await takeaway(shop, [{ variantId: pen.variantId, quantity: 2 }], {
      discount: 23,
    });
    expect(discounted).toMatchObject({
      grandTotal: '207.00',
      taxes: [{ name: 'VAT', amount: '27.00' }],
    });
    const quoted = await shop.post('/orders/quote', {
      customerName: 'Rahima',
      phone: texts.freshPhone(),
      fulfilmentType: 'takeaway',
      items: [{ variantId: pen.variantId, quantity: 2 }],
    });
    expect((quoted.body as Order).taxes).toEqual([{ name: 'VAT', rate: '15.00', amount: '30.00' }]);
  });

  it('keeps the class and rate a line was ordered under when the class changes, and taxes no delivery', async () => {
    const shop = await openShop(port, texts, 'tax');
    const vat = await named(shop, 'VAT', 15);
    const pen = await product(shop, 'Pen', 115, { taxClassId: vat });
    const locations = (await shop.get('/locations')).body as {
      zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
    };
    const mirpur = locations.zillas
      .find((row) => row.nameEn === 'Dhaka')
      ?.thanas.find((row) => row.nameEn === 'Mirpur');
    const made = await postJson(
      port,
      '/orders',
      {
        customerName: 'Rahima',
        phone: texts.freshPhone(),
        locationId: mirpur?.id,
        deliveryAddress: 'House 12',
        items: [{ variantId: pen.variantId, quantity: 2 }],
      },
      shop.headers({ 'idempotency-key': randomUUID() }),
    );
    const order = made.body as Order;
    expect(order).toMatchObject({
      deliveryCharge: '70.00',
      grandTotal: '300.00',
      taxes: [{ amount: '30.00' }],
    });
    await shop.patch(`/tax-classes/${vat}`, { name: 'VAT new', rate: 10 });
    const [line] = order.items;
    const edited = await shop.patch(`/orders/${order.id}`, {
      items: [
        { lineId: line?.id, variantId: pen.variantId, quantity: 1 },
        { variantId: pen.variantId, quantity: 1 },
      ],
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(
      (edited.body as Order).items.map((row) => [row.taxClassName, row.taxRate, row.taxAmount]),
    ).toEqual([
      ['VAT', '15.00', '15.00'],
      ['VAT new', '10.00', '10.45'],
    ]);
    expect((edited.body as Order).taxes).toEqual([
      { name: 'VAT', rate: '15.00', amount: '15.00' },
      { name: 'VAT new', rate: '10.00', amount: '10.45' },
    ]);
    await expect(
      admin.query('UPDATE tenant.order_lines SET tax_rate = NULL WHERE id = $1', [line?.id]),
    ).rejects.toThrow(/order_lines_tax_check/);
  });

  it('shows the tax to the shopper too, on the order placed and its tracking', async () => {
    const shop = await openShop(port, texts, 'tax');
    const vat = await named(shop, 'VAT', 15);
    const pen = await product(shop, 'Pen', 115, { taxClassId: vat });
    const key = await shop.post('/api-keys', { name: 'Website', websites: ['https://myshop.com'] });
    const publicKey = (key.body as { key: string }).key;
    const locations = (await shop.get('/locations')).body as {
      zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
    };
    const mirpur = locations.zillas
      .find((row) => row.nameEn === 'Dhaka')
      ?.thanas.find((row) => row.nameEn === 'Mirpur');
    const headers = {
      host: 'api.localhost',
      authorization: `Bearer ${publicKey}`,
      origin: 'https://myshop.com',
      'content-type': 'application/json',
    };
    const placed: HttpResult = await sendExact(
      port,
      'POST',
      '/v1/orders',
      {
        customerName: 'Rahima',
        phone: texts.freshPhone(),
        locationId: mirpur?.id,
        deliveryAddress: 'House 12',
        items: [{ variantId: pen.variantId, quantity: 2 }],
      },
      { ...headers, 'idempotency-key': randomUUID() },
    );
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    const body = placed.body as { trackingId: string; taxes: unknown };
    expect(body.taxes).toEqual([{ name: 'VAT', rate: '15.00', amount: '30.00' }]);
    const tracked = await sendExact(
      port,
      'GET',
      `/v1/track/${body.trackingId}`,
      undefined,
      headers,
    );
    expect((tracked.body as { taxes: unknown }).taxes).toEqual(body.taxes);
  });
});
