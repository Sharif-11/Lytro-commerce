import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditAction } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson, postJson, deleteJson, type HttpResult } from './support/http';
import { errorOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 4 Slice 4.4a, read agreed 2026-10-30: the shop's customers as staff look them up -- listed who last ordered
// first, searched by name or phone, one customer with their figures and where their latest delivery went, and their
// orders (CUS-01, CUS-02) -- and deleting a customer's details at a privacy request, refused while an order is on its
// way (CUS-09). Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_customers_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'customers-e2e-otp-secret-0123456789abcdefgh';
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

interface Customer {
  id: string;
  name: string | null;
  phone: string | null;
  orderCount: number;
  totalSpent: string;
  lastOrderAt: string | null;
  firstOrderAt: string;
  lastAddress: { locationId: number; deliveryAddress: string } | null;
}

interface CustomerPage {
  customers: Customer[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface Order {
  id: string;
  orderNumber: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerErased: boolean;
  deliveryAddress: string | null;
  shopperNote: string | null;
  grandTotal: string;
  location: { id: number } | null;
}

interface Locations {
  zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
}
const thanas = new Map<string, number>();

async function thanaId(shop: ShopClient, name: string): Promise<number> {
  if (thanas.size === 0) {
    const locations = (await shop.get('/locations')).body as Locations;
    for (const thana of locations.zillas.find((row) => row.nameEn === 'Dhaka')?.thanas ?? []) {
      thanas.set(thana.nameEn, thana.id);
    }
  }
  const id = thanas.get(name);
  if (id === undefined) throw new Error(`no thana Dhaka/${name}`);
  return id;
}

function freshMobile(): string {
  return `017${String(randomInt(10_000_000, 99_999_999))}`;
}

async function product(shop: ShopClient, name: string, price: number): Promise<string> {
  const made = await shop.post('/products', {
    name,
    basePrice: price,
    variants: [{ optionIds: [], openingStock: 50 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '';
}

async function place(
  shop: ShopClient,
  variantId: string,
  phone: string,
  extra: Record<string, unknown> = {},
): Promise<Order> {
  const made = await postJson(
    port,
    '/orders',
    {
      customerName: 'Rahima Akter',
      phone,
      locationId: await thanaId(shop, 'Mirpur'),
      deliveryAddress: 'House 12, Road 3',
      items: [{ variantId, quantity: 1 }],
      ...extra,
    },
    shop.headers({ 'idempotency-key': randomUUID() }),
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as Order;
}

async function deliver(shop: ShopClient, order: Order): Promise<void> {
  const shipped = await shop.post(`/orders/${order.id}/ship`, {
    courierName: 'Steadfast',
    trackingCode: 'SF-1',
  });
  expect(shipped.status, JSON.stringify(shipped.body)).toBe(200);
  expect((await shop.post(`/orders/${order.id}/deliver`, {})).status).toBe(200);
}

async function cancel(shop: ShopClient, order: Order): Promise<void> {
  const cancelled = await shop.post(`/orders/${order.id}/cancel`, { reason: 'customer_cancelled' });
  expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
}

function erase(shop: ShopClient, customerId: string): Promise<HttpResult> {
  return shop.delete(`/customers/${customerId}`);
}

async function page(shop: ShopClient, query = ''): Promise<CustomerPage> {
  const result = await shop.get(`/customers${query}`);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body as CustomerPage;
}

async function activity(tenantId: string, action: AuditAction): Promise<unknown[]> {
  const result = await admin.query<{ summary: unknown }>(
    'SELECT summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2',
    [tenantId, action],
  );
  return result.rows.map((row) => row.summary);
}

describeIfDatabase("the shop's customers (CUS-01, CUS-02)", () => {
  it('lists who last ordered first, and finds one by part of the name or the last four digits', async () => {
    const shop = await openShop(port, texts, 'cus');
    const lamp = await product(shop, 'Lamp', 300);
    const rahima = freshMobile();
    const karim = freshMobile();
    await place(shop, lamp, rahima);
    await place(shop, lamp, karim, { customerName: 'Karim Uddin' });
    await place(shop, lamp, rahima);
    const all = await page(shop);
    expect(all).toMatchObject({ page: 1, limit: 20, total: 2, pages: 1 });
    expect(all.customers.map((row) => [row.phone, row.orderCount])).toEqual([
      [rahima, 2],
      [karim, 1],
    ]);
    const byDigits = await page(shop, `?q=${karim.slice(-4)}`);
    expect(byDigits.customers.map((row) => row.phone)).toEqual([karim]);
    const byName = await page(shop, '?q=karim');
    expect(byName.customers.map((row) => row.name)).toEqual(['Karim Uddin']);
    const international = await page(shop, `?q=${encodeURIComponent(`+88${rahima}`)}`);
    expect(international.customers.map((row) => row.phone)).toEqual([rahima]);
    const first = await page(shop, '?limit=1');
    expect(first).toMatchObject({ total: 2, pages: 2 });
    expect(first.customers).toHaveLength(1);
  });

  it('opens one customer: their figures, first order, latest delivery address and their orders', async () => {
    const shop = await openShop(port, texts, 'cus');
    const lamp = await product(shop, 'Lamp', 300);
    const phone = freshMobile();
    const first = await place(shop, lamp, phone);
    await deliver(shop, first);
    const latest = await place(shop, lamp, phone, {
      locationId: await thanaId(shop, 'Gulshan'),
      deliveryAddress: 'Flat 4B, Road 90',
    });
    await place(shop, lamp, freshMobile());
    const customerId = latest.customerId ?? '';
    const opened = await shop.get(`/customers/${customerId}`);
    expect(opened.status, JSON.stringify(opened.body)).toBe(200);
    const customer = opened.body as Customer;
    expect(customer).toMatchObject({
      phone,
      name: 'Rahima Akter',
      orderCount: 2,
      totalSpent: '370.00',
      lastAddress: {
        locationId: await thanaId(shop, 'Gulshan'),
        deliveryAddress: 'Flat 4B, Road 90',
      },
    });
    expect(new Date(customer.firstOrderAt).getTime()).toBeLessThanOrEqual(
      new Date(customer.lastOrderAt ?? 0).getTime(),
    );
    const history = (await shop.get(`/orders?customerId=${customerId}`)).body as {
      orders: { orderNumber: string; customerErased: boolean }[];
      total: number;
    };
    expect(history.total).toBe(2);
    expect(history.orders.map((row) => row.orderNumber)).toEqual([
      latest.orderNumber,
      first.orderNumber,
    ]);
    expect(history.orders.every((row) => !row.customerErased)).toBe(true);
    expect((await shop.get('/customers/not-a-customer')).status).toBe(404);
    expect((await shop.get(`/customers/${randomUUID()}`)).status).toBe(404);
  });

  it("keeps each shop's customers its own (SEC-02)", async () => {
    const shop = await openShop(port, texts, 'cus');
    const other = await openShop(port, texts, 'cus');
    const order = await place(shop, await product(shop, 'Lamp', 300), freshMobile());
    const customerId = order.customerId ?? '';
    expect((await other.get(`/customers/${customerId}`)).status).toBe(404);
    expect((await page(other)).total).toBe(0);
    expect(
      ((await other.get(`/orders?customerId=${customerId}`)).body as { total: number }).total,
    ).toBe(0);
    expect((await erase(other, customerId)).status).toBe(404);
    expect((await shop.get(`/customers/${customerId}`)).body).toMatchObject({
      phone: order.customerPhone,
    });
  });

  it('needs customers:read to look, and customers:manage to delete', async () => {
    const shop = await openShop(port, texts, 'cus');
    const order = await place(shop, await product(shop, 'Lamp', 300), freshMobile());
    await cancel(shop, order);
    const reader = await staffWith(port, texts, admin, shop, ['customers:read']);
    expect((await getJson(port, '/customers', reader)).status).toBe(200);
    expect((await getJson(port, `/customers/${order.customerId ?? ''}`, reader)).status).toBe(200);
    expect((await deleteJson(port, `/customers/${order.customerId ?? ''}`, reader)).status).toBe(
      403,
    );
    const other = await openShop(port, texts, 'cus');
    const clerk = await staffWith(port, texts, admin, other, ['orders:read']);
    expect((await getJson(port, '/customers', clerk)).status).toBe(403);
  });
});

describeIfDatabase("deleting a customer's details at a privacy request (CUS-09)", () => {
  it('is refused while an order is on its way, naming it', async () => {
    const shop = await openShop(port, texts, 'era');
    const lamp = await product(shop, 'Lamp', 300);
    const phone = freshMobile();
    const pending = await place(shop, lamp, phone);
    const shipped = await place(shop, lamp, phone);
    await shop.post(`/orders/${shipped.id}/ship`, {
      courierName: 'Steadfast',
      trackingCode: 'SF-2',
    });
    const refused = await erase(shop, pending.customerId ?? '');
    expect(refused.status).toBe(409);
    expect(errorOf(refused).details).toMatchObject({
      orders: [pending.orderNumber, shipped.orderNumber],
    });
    expect(errorOf(refused).message).toContain('2');
    await cancel(shop, pending);
    expect((await erase(shop, pending.customerId ?? '')).status).toBe(409);
    expect((await shop.get(`/customers/${pending.customerId ?? ''}`)).body).toMatchObject({
      phone,
    });
  });

  it('clears the name, phone and address from the customer and every order, keeping the totals', async () => {
    const shop = await openShop(port, texts, 'era');
    const lamp = await product(shop, 'Lamp', 300);
    const phone = freshMobile();
    const delivered = await place(shop, lamp, phone);
    await deliver(shop, delivered);
    const cancelled = await place(shop, lamp, phone);
    await cancel(shop, cancelled);
    await admin.query(
      "UPDATE tenant.orders SET shopper_note = 'Ring the bell twice' WHERE id = $1",
      [cancelled.id],
    );
    const customerId = delivered.customerId ?? '';
    const erased = await erase(shop, customerId);
    expect(erased.status, JSON.stringify(erased.body)).toBe(200);
    expect((await shop.get(`/customers/${customerId}`)).status).toBe(404);
    expect((await page(shop)).total).toBe(0);
    for (const order of [delivered, cancelled]) {
      const after = (await shop.get(`/orders/${order.id}`)).body as Order;
      expect(after).toMatchObject({
        customerId,
        customerErased: true,
        customerName: null,
        customerPhone: null,
        deliveryAddress: null,
        shopperNote: null,
        grandTotal: '370.00',
        location: { id: await thanaId(shop, 'Mirpur') },
      });
    }
    const rows = await admin.query<{ name: string | null; phone: string | null; erased: boolean }>(
      'SELECT name, phone, erased_at IS NOT NULL AS erased FROM tenant.customers WHERE id = $1',
      [customerId],
    );
    expect(rows.rows).toEqual([{ name: null, phone: null, erased: true }]);
    expect(await activity(shop.tenantId, AuditAction.CustomerErased)).toEqual([{ orders: 2 }]);
    expect((await erase(shop, customerId)).status).toBe(404);
    const again = await place(shop, lamp, phone);
    expect(again.customerId).not.toBe(customerId);
    expect(again.customerErased).toBe(false);
  });

  it('clears the same details from the replies stored for its orders (D4-8)', async () => {
    const shop = await openShop(port, texts, 'era');
    const phone = freshMobile();
    const order = await place(shop, await product(shop, 'Lamp', 300), phone);
    await cancel(shop, order);
    const stored = async (): Promise<Record<string, unknown> | undefined> =>
      (
        await admin.query<{ body: Record<string, unknown> }>(
          "SELECT response_body AS body FROM control.idempotency_keys WHERE response_body ->> 'id' = $1",
          [order.id],
        )
      ).rows[0]?.body;
    expect(await stored()).toMatchObject({
      customerPhone: phone,
      deliveryAddress: 'House 12, Road 3',
    });
    expect((await erase(shop, order.customerId ?? '')).status).toBe(200);
    expect(await stored()).toMatchObject({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: null,
      customerPhone: null,
      deliveryAddress: null,
      grandTotal: '370.00',
    });
  });

  it('keeps an erasure in the database: neither the customer nor an order can be brought back', async () => {
    const shop = await openShop(port, texts, 'era');
    const order = await place(shop, await product(shop, 'Lamp', 300), freshMobile());
    await cancel(shop, order);
    expect((await erase(shop, order.customerId ?? '')).status).toBe(200);
    await expect(
      admin.query('UPDATE tenant.customers SET erased_at = NULL WHERE id = $1', [order.customerId]),
    ).rejects.toThrow(/an erased customer stays erased/);
    await expect(
      admin.query('UPDATE tenant.orders SET customer_erased_at = NULL WHERE id = $1', [order.id]),
    ).rejects.toThrow(/an erased order stays erased/);
    await expect(
      admin.query("UPDATE tenant.orders SET customer_name = 'Back again' WHERE id = $1", [
        order.id,
      ]),
    ).rejects.toThrow(/orders_erased_check/);
  });
});
