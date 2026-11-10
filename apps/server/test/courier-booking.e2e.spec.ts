import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { MINUTE_MS } from '../src/common/time';
import type { SelectCourierParcel } from '@lytronix/db';
import { CourierBooking } from '../src/modules/couriers/services/courier-booking';
import { CourierBookingPass } from '../src/modules/couriers/services/courier-booking-pass';
import { CourierConnections } from '../src/modules/couriers/services/courier-connections';
import {
  CourierNoAnswer,
  type CourierAdapter,
} from '../src/modules/couriers/ports/courier-adapter';
import { SteadfastAdapter } from '../src/modules/couriers/services/steadfast-adapter';
import { COURIER_CLOCK, COURIER_FETCH } from '../src/modules/couriers/tokens';
import { PlanLimitOverridesService } from '../src/modules/billing/services/plan-limit-overrides.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { CourierBookingTickWorker } from '../src/modules/shared/queue-workers/services/courier-booking-tick-worker';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import {
  FakeSteadfast,
  RIGHT_API_KEY,
  RIGHT_SECRET_KEY,
  freshSteadfastKeys,
} from './support/fake-steadfast';
import { getJson, postJson, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';
import { expectLedgerAgrees } from './support/stock-ledger';

// Phase 6 Slice 6.1, read agreed 2026-11-04: connecting a courier (CRR-01 to CRR-05, CRR-20) and booking an order with it by claim,
// call and settle (CRR-06 to CRR-10, CRR-18, CRR-19, CRR-26, CRR-28, CRR-30, D6-7, D6-10, D6-11, D6-14). Exit criterion 3 and Steadfast's
// half of 2 and 6, with staff marking delivery by hand until Slice 6.2 brings the courier's news. A fake Steadfast stands in: it
// has no sandbox. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_courier_booking_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const SLOW = 30_000;
vi.setConfig({ testTimeout: SLOW });

let app: INestApplication;
let port: number;
let admin: pg.Client;
let clockShift = 0;
const steadfast = new FakeSteadfast();
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'courier-booking-e2e-otp-secret-012345678901';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(COURIER_FETCH)
    .useValue(steadfast.fetch)
    .overrideProvider(COURIER_CLOCK)
    .useValue(() => new Date(Date.now() + clockShift))
    .overrideProvider(CourierBookingTickWorker)
    .useValue({})
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

beforeEach(async () => {
  clockShift = 0;
  steadfast.reset();
  if (!ADMIN_URL) return;
  // The minute pass goes through every shop, so what an earlier test left open is closed for it first.
  await admin.query(
    "UPDATE tenant.courier_parcels SET next_look_up_at = NULL, state = CASE WHEN state = 'booking' THEN 'refused'::tenant.parcel_state ELSE state END WHERE state IN ('booking', 'unknown')",
  );
});

interface Parcel {
  state: string;
  invoice: string;
  consignmentId: string | null;
  trackingCode: string | null;
  cod: string;
  note: string | null;
  weightKg: string | null;
  areaCode: string | null;
  refusal: string | null;
  settled: boolean;
  settleProblem: string | null;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  override: string | null;
  confirmedAt: string | null;
  confirmedBy: { id: string; name: string | null } | null;
  courierName: string | null;
  trackingCode: string | null;
  trackingLink: string | null;
  handledAt: string | null;
  grandTotal: string;
  due: string;
  cancelReason: string | null;
  items: { id: string }[];
  parcel: Parcel | null;
  courierRecordUnchanged: boolean;
  history: { field: string; from: string | null; to: string | null; note: string | null }[];
}

function freshMobile(): string {
  return `017${String(randomInt(10_000_000, 99_999_999))}`;
}

let dhakaMirpur: number | null = null;
async function mirpur(shop: ShopClient): Promise<number> {
  if (dhakaMirpur !== null) return dhakaMirpur;
  const { zillas } = (await shop.get('/locations')).body as {
    zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
  };
  const found = zillas
    .find((row) => row.nameEn === 'Dhaka')
    ?.thanas.find((row) => row.nameEn === 'Mirpur');
  if (!found) throw new Error('no thana Dhaka/Mirpur');
  dhakaMirpur = found.id;
  return found.id;
}

async function product(
  shop: ShopClient,
  name: string,
  price: number,
  stock: number,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; variantId: string }> {
  const made = await shop.post('/products', {
    name,
    basePrice: price,
    variants: [{ optionIds: [], ...(stock > 0 ? { openingStock: stock } : {}) }],
    ...extra,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const body = made.body as { id: string; variants: { id: string }[] };
  return { id: body.id, variantId: body.variants[0]?.id ?? '' };
}

async function serialProduct(
  shop: ShopClient,
  serials: string[],
): Promise<{ id: string; variantId: string }> {
  const made = await product(shop, 'Phone', 15000, 0, { serialTracked: true, serialFormat: 'any' });
  const added = await shop.post(`/products/${made.id}/variants/${made.variantId}/stock-additions`, {
    quantity: serials.length,
    serials,
  });
  expect(added.status, JSON.stringify(added.body)).toBe(200);
  return made;
}

async function place(
  shop: ShopClient,
  variantId: string,
  quantity = 1,
  extra: Record<string, unknown> = {},
): Promise<Order> {
  const made = await postJson(
    port,
    '/orders',
    {
      customerName: 'Rahima Akter',
      phone: freshMobile(),
      locationId: await mirpur(shop),
      deliveryAddress: 'House 12, Road 3',
      items: [{ variantId, quantity }],
      ...extra,
    },
    shop.headers({ 'idempotency-key': randomUUID() }),
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as Order;
}

async function connected(shop: ShopClient): Promise<void> {
  const made = await shop.post('/couriers/connections', {
    courierKey: 'steadfast',
    credentials: freshSteadfastKeys(),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  steadfast.calls.length = 0;
}

async function connectedShop(prefix = 'crr'): Promise<ShopClient> {
  const shop = await openShop(port, texts, prefix);
  await connected(shop);
  return shop;
}

function book(
  shop: ShopClient,
  orderId: string,
  body: Record<string, unknown> = {},
): Promise<HttpResult> {
  return shop.post(`/orders/${orderId}/book`, body);
}

async function booked(
  shop: ShopClient,
  order: { id: string },
  body: Record<string, unknown> = {},
): Promise<Order> {
  const answered = await book(shop, order.id, body);
  expect(answered.status, JSON.stringify(answered.body)).toBe(200);
  return answered.body as Order;
}

async function read(shop: ShopClient, orderId: string): Promise<Order> {
  return (await shop.get(`/orders/${orderId}`)).body as Order;
}

async function stockOf(shop: ShopClient, productId: string): Promise<string[]> {
  const found = (await shop.get(`/products/${productId}/stock`)).body as {
    variants: { onHand: string; reserved: string }[];
  };
  return [found.variants[0]?.onHand ?? '', found.variants[0]?.reserved ?? ''];
}

async function serialsIn(shop: ShopClient, item: { id: string; variantId: string }) {
  const { serials } = (
    await shop.get(`/products/${item.id}/variants/${item.variantId}/serials?status=in_stock`)
  ).body as { serials: { serial: string }[] };
  return serials.map((row) => row.serial).sort();
}

async function payAsYouGo(balance: string): Promise<ShopClient> {
  const shop = await openShop(port, texts, 'crr');
  await admin.query(
    `UPDATE control.tenants SET state = 'pay_as_you_go',
       plan_id = (SELECT id FROM control.plans WHERE name = 'Pay-as-you-go'),
       plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Pay-as-you-go')
     WHERE id = $1`,
    [shop.tenantId],
  );
  await seedBalance(admin, shop.tenantId, balance);
  await connected(shop);
  return shop;
}

async function fees(tenantId: string): Promise<string[]> {
  const { rows } = await admin.query<{ amount: string }>(
    "SELECT amount FROM tenant.balance_ledger WHERE tenant_id = $1 AND type = 'order_fee' ORDER BY id",
    [tenantId],
  );
  return rows.map((row) => row.amount);
}

async function balanceOf(shop: ShopClient): Promise<{ amount: string; held: string }> {
  return (await shop.get('/balance')).body as { amount: string; held: string };
}

async function handledCount(tenantId: string): Promise<number> {
  const { rows } = await admin.query<{ total: string }>(
    'SELECT count(*)::text AS total FROM tenant.orders WHERE tenant_id = $1 AND handled_at IS NOT NULL',
    [tenantId],
  );
  return Number(rows[0]?.total);
}

/** The minute pass, run as if `minutes` had gone by. */
async function passAfter(minutes: number): Promise<void> {
  clockShift = minutes * MINUTE_MS;
  await app.get(CourierBookingPass).runTick();
}

describeIfDatabase('connecting a courier (CRR-01 to CRR-05, CRR-20, SEC-11)', () => {
  it('lists Steadfast with its fields (CRR-01)', async () => {
    const shop = await openShop(port, texts, 'crr');
    const { adapters } = (await shop.get('/couriers/adapters')).body as {
      adapters: {
        key: string;
        credentialFields: string[];
        needsArea: boolean;
        canCancel: boolean;
      }[];
    };
    expect(adapters).toContainEqual({
      key: 'steadfast',
      name: 'Steadfast',
      credentialFields: ['apiKey', 'secretKey'],
      needsArea: false,
      needsThana: false,
      hasStores: false,
      takesWeight: false,
      canCancel: false,
      // CRR-23 (Slice 6.6): not being retired.
      retiring: false,
    });
  });

  it('saves nothing when the courier refuses the keys, and shows what it said (CRR-02)', async () => {
    const shop = await openShop(port, texts, 'crr');
    const refused = await shop.post('/couriers/connections', {
      courierKey: 'steadfast',
      credentials: { apiKey: 'wrong', secretKey: 'wrong' },
    });
    expect(refused.status).toBe(409);
    expect(errorOf(refused).details).toMatchObject({ courierMessage: 'Unauthorized.' });
    expect(errorOf(refused).message).toContain('Unauthorized.');
    const { connections } = (await shop.get('/couriers/connections')).body as {
      connections: unknown[];
    };
    expect(connections).toEqual([]);
    expect(steadfast.callsTo('/get_balance')).toHaveLength(1);
  });

  it('connects with a test call, never returns or stores a key in the clear, and the first is the default (CRR-02, CRR-03, CRR-05)', async () => {
    const shop = await openShop(port, texts, 'crr');
    const made = await shop.post('/couriers/connections', {
      courierKey: 'steadfast',
      credentials: freshSteadfastKeys(),
    });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    expect(made.body).toMatchObject({
      courierKey: 'steadfast',
      isDefault: true,
      hasCredentials: true,
      state: 'active',
    });
    const listed = await shop.get('/couriers/connections');
    for (const answer of [made, listed]) {
      expect(JSON.stringify(answer.body)).not.toContain(RIGHT_API_KEY);
      expect(JSON.stringify(answer.body)).not.toContain(RIGHT_SECRET_KEY);
    }
    const { rows } = await admin.query<{ credentials: Buffer }>(
      'SELECT credentials FROM tenant.courier_connections WHERE tenant_id = $1',
      [shop.tenantId],
    );
    expect(rows[0]?.credentials.toString('latin1')).not.toContain(RIGHT_API_KEY);
    expect(rows[0]?.credentials.toString('latin1')).not.toContain(RIGHT_SECRET_KEY);
  });

  it('keeps saved values for blank fields, and refuses a field it does not know (CRR-03)', async () => {
    const shop = await connectedShop();
    const replaced = await shop.post('/couriers/connections', {
      courierKey: 'steadfast',
      credentials: { apiKey: '', secretKey: '' },
    });
    expect(replaced.status, JSON.stringify(replaced.body)).toBe(200);
    expect(steadfast.callsTo('/get_balance')[0]).toMatchObject({
      apiKey: expect.stringMatching(new RegExp(`^${RIGHT_API_KEY}-`)) as string,
      secretKey: RIGHT_SECRET_KEY,
    });
    const stray = await shop.post('/couriers/connections', {
      courierKey: 'steadfast',
      credentials: { ...freshSteadfastKeys(), password: 'x' },
    });
    expect(stray.status).toBe(400);
    expect(fieldsOf(stray)).toHaveProperty(['credentials.password']);
    const firstTime = await (
      await openShop(port, texts, 'crr')
    ).post('/couriers/connections', {
      courierKey: 'steadfast',
      credentials: { apiKey: RIGHT_API_KEY },
    });
    expect(firstTime.status).toBe(400);
    expect(fieldsOf(firstTime)).toHaveProperty(['credentials.secretKey']);
  });

  it('stops trying well before a courier locks the key out', async () => {
    const shop = await openShop(port, texts, 'crr');
    const wrong = { courierKey: 'steadfast', credentials: { apiKey: 'a', secretKey: 'b' } };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await shop.post('/couriers/connections', wrong)).status).toBe(409);
    }
    const sixth = await shop.post('/couriers/connections', wrong);
    expect(sixth.status).toBe(429);
    expect(steadfast.callsTo('/get_balance')).toHaveLength(5);
  });

  it('never puts a courier key in a URL, takes none from a query, and never shows one back (SEC-08, close-out)', async () => {
    const shop = await openShop(port, texts, 'crr');
    const keys = freshSteadfastKeys();
    // Credentials come only in the body: a query carrying them is no connection.
    const queried = await shop.post(
      `/couriers/connections?courierKey=steadfast&apiKey=${keys.apiKey}&secretKey=${keys.secretKey}`,
      {},
    );
    expect(queried.status).toBe(400);
    expect(steadfast.calls).toEqual([]);
    const made = await shop.post('/couriers/connections', {
      courierKey: 'steadfast',
      credentials: keys,
    });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const lamp = await product(shop, 'Lamp', 300, 5);
    await booked(shop, await place(shop, lamp.variantId));
    expect(steadfast.calls.length).toBeGreaterThan(1);
    for (const call of steadfast.calls) {
      expect(call.url).not.toContain(keys.apiKey);
      expect(call.url).not.toContain(keys.secretKey);
    }
    for (const read of [
      await shop.get('/couriers/connections'),
      await shop.get('/couriers/connections/steadfast/address'),
    ]) {
      expect(read.status, JSON.stringify(read.body)).toBe(200);
      expect(JSON.stringify(read.body)).not.toContain(keys.apiKey);
      expect(JSON.stringify(read.body)).not.toContain(keys.secretKey);
    }
  });

  it('records one entry each time keys are replaced, and one for disconnecting (AUD-01, close-out)', async () => {
    const shop = await openShop(port, texts, 'crr');
    expect(
      (
        await shop.post('/couriers/connections', {
          courierKey: 'steadfast',
          credentials: freshSteadfastKeys(),
        })
      ).status,
    ).toBe(200);
    const replaced = await shop.post('/couriers/connections', {
      courierKey: 'steadfast',
      credentials: { apiKey: '', secretKey: '' },
    });
    expect(replaced.status, JSON.stringify(replaced.body)).toBe(200);
    const entries = async (action: string): Promise<{ summary: Record<string, unknown> }[]> =>
      (
        await admin.query<{ summary: Record<string, unknown> }>(
          'SELECT summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2 ORDER BY id',
          [shop.tenantId, action],
        )
      ).rows;
    const connected = await entries('courier_connected');
    expect(connected.map((row) => row.summary['replaced'])).toEqual([false, true]);
    expect((await shop.delete('/couriers/connections/steadfast')).status).toBe(200);
    expect(await entries('courier_disconnected')).toHaveLength(1);
    expect(await entries('courier_connected')).toHaveLength(2);
  });

  it('takes only couriers:manage to connect; orders:manage sees them to book (CRR-05)', async () => {
    // A shop on Starter has one seat beyond its owner, so each person gets a shop.
    const shop = await connectedShop();
    const booker = await staffWith(port, texts, admin, shop, ['orders:read', 'orders:manage']);
    const other = await connectedShop();
    const manager = await staffWith(port, texts, admin, other, ['couriers:manage']);
    const listed = await getJson(port, '/couriers/connections', booker);
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    const asBooker = await postJson(
      port,
      '/couriers/connections',
      { courierKey: 'steadfast', credentials: freshSteadfastKeys() },
      booker,
    );
    expect(asBooker.status).toBe(403);
    const asManager = await postJson(
      port,
      '/couriers/connections',
      { courierKey: 'steadfast', credentials: freshSteadfastKeys() },
      manager,
    );
    expect(asManager.status, JSON.stringify(asManager.body)).toBe(200);
  });

  it('removes credentials on disconnect, keeps past parcels, and refuses a new booking (CRR-20)', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const first = await booked(shop, await place(shop, lamp.variantId));
    expect((await shop.delete('/couriers/connections/steadfast')).status).toBe(200);
    const { rows } = await admin.query(
      'SELECT 1 FROM tenant.courier_connections WHERE tenant_id = $1',
      [shop.tenantId],
    );
    expect(rows).toHaveLength(0);
    expect((await read(shop, first.id)).parcel?.consignmentId).toBe(first.parcel?.consignmentId);
    const next = await place(shop, lamp.variantId);
    const refused = await book(shop, next.id);
    expect(refused.status).toBe(409);
    expect(steadfast.bookings()).toHaveLength(1);
  });

  it('logs every use of the credentials without them, and the audit log has each change (SEC-11, AUD-01)', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId);
    await booked(shop, order);
    const { uses, total } = await app.get(CourierConnections).uses(shop.tenantId, 1, 20);
    expect(total).toBe(2);
    expect(uses[0]).toMatchObject({
      courierKey: 'steadfast',
      action: 'book',
      orderId: order.id,
      succeeded: true,
    });
    expect(uses[1]).toMatchObject({ action: 'test', orderId: null, succeeded: true });
    expect(JSON.stringify(uses)).not.toContain(RIGHT_API_KEY);
    const { rows } = await admin.query<{ action: string; summary: unknown }>(
      "SELECT action, summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'courier_connected'",
      [shop.tenantId],
    );
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain(RIGHT_SECRET_KEY);
  });

  it('clears connections, parcels and the log with the shop (LIF-19)', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    await booked(shop, await place(shop, lamp.variantId));
    await app.get(CourierConnections).deleteAllForTenant(shop.tenantId);
    for (const table of ['courier_connections', 'courier_parcels', 'courier_credential_uses']) {
      const { rows } = await admin.query(`SELECT 1 FROM tenant.${table} WHERE tenant_id = $1`, [
        shop.tenantId,
      ]);
      expect(rows, table).toHaveLength(0);
    }
  });
});

describeIfDatabase('booking an order (CRR-06 to CRR-10, D6-7, D6-10, exit criterion 2)', () => {
  it('charges a plan shop nothing for a booking: its ledger is unchanged (CRR-22, close-out)', async () => {
    const shop = await connectedShop();
    await admin.query(
      `UPDATE control.tenants SET state = 'active',
         plan_id = (SELECT id FROM control.plans WHERE name = 'Starter'),
         plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Starter'),
         period_start = now() - interval '10 days', period_end = now() + interval '20 days'
       WHERE id = $1`,
      [shop.tenantId],
    );
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId);
    const ledger = async (): Promise<number> =>
      Number(
        (
          await admin.query<{ total: string }>(
            'SELECT count(*)::text AS total FROM tenant.balance_ledger WHERE tenant_id = $1',
            [shop.tenantId],
          )
        ).rows[0]?.total,
      );
    const before = await ledger();
    const sent = await booked(shop, order);
    expect(sent).toMatchObject({ status: 'processing' });
    expect(await ledger()).toBe(before);
    expect((await balanceOf(shop)).held).toBe('0.00');
  });

  it('walks a pay-as-you-go order from placed to delivered, with stock, count and fee each moving once', async () => {
    const shop = await payAsYouGo('500.00');
    const phone = await serialProduct(shop, ['SN-A', 'SN-B']);
    // Written on two lines, as the address boxes let it be; the courier gets it on one.
    const order = await place(shop, phone.variantId, 1, {
      deliveryAddress: 'House 12\r\n Road 3',
    });
    // PYG-16: making the product had its own fee.
    const start = Number((await balanceOf(shop)).amount);
    expect(await fees(shop.tenantId)).toEqual([]);
    expect(await handledCount(shop.tenantId)).toBe(0);
    expect(await stockOf(shop, phone.id)).toEqual(['2.000', '1.000']);

    const sent = await booked(shop, order, {
      note: 'Fragile',
      serials: [{ lineId: order.items[0]?.id, serials: ['SN-B'] }],
    });
    // CRR-06: what the courier was sent.
    expect(steadfast.bookings()).toHaveLength(1);
    expect(steadfast.bookings()[0]?.body).toEqual({
      invoice: order.orderNumber,
      recipient_name: 'Rahima Akter',
      recipient_phone: expect.stringMatching(/^017\d{8}$/) as string,
      recipient_address: 'House 12, Road 3, Mirpur, Dhaka',
      cod_amount: Number(order.due),
      note: 'Fragile',
    });
    // The parcel, the order's axes, the stock and the balance agree.
    expect(sent).toMatchObject({
      status: 'processing',
      fulfillmentStatus: 'processing',
      courierName: 'Steadfast',
      trackingCode: expect.stringMatching(/^TRK/) as string,
      trackingLink: expect.stringMatching(/^https:\/\/steadfast\.com\.bd\/t\/TRK/) as string,
    });
    expect(sent.parcel).toMatchObject({
      state: 'booked',
      invoice: order.orderNumber,
      cod: order.due,
      note: 'Fragile',
      settled: true,
      settleProblem: null,
      refusal: null,
      courierStatus: 'in_review',
    });
    expect(sent.confirmedAt).not.toBeNull();
    expect(await stockOf(shop, phone.id)).toEqual(['1.000', '0.000']);
    expect(await serialsIn(shop, phone)).toEqual(['SN-A']);
    expect(await handledCount(shop.tenantId)).toBe(1);
    expect((await fees(shop.tenantId)).length).toBe(1);
    const feeAmount = Number((await fees(shop.tenantId))[0]);
    expect(await balanceOf(shop)).toMatchObject({
      amount: (start + feeAmount).toFixed(2),
      held: '0.00',
    });
    await expectLedgerAgrees(admin, shop.tenantId);

    // D6-13: by hand until the courier's own news comes (Slice 6.2): no more stock, count or fee.
    const shipped = await shop.post(`/orders/${order.id}/ship`, {
      courierName: 'Steadfast',
      trackingCode: sent.trackingCode,
    });
    expect(shipped.status, JSON.stringify(shipped.body)).toBe(200);
    expect(shipped.body).toMatchObject({ status: 'shipped' });
    const delivered = await shop.post(`/orders/${order.id}/deliver`, {});
    expect(delivered.status, JSON.stringify(delivered.body)).toBe(200);
    expect(delivered.body).toMatchObject({ status: 'delivered', due: '0.00' });
    expect(await stockOf(shop, phone.id)).toEqual(['1.000', '0.000']);
    expect(await handledCount(shop.tenantId)).toBe(1);
    expect((await fees(shop.tenantId)).length).toBe(1);
    expect(steadfast.bookings()).toHaveLength(1);
    await expectLedgerAgrees(admin, shop.tenantId);
  });

  it('books with the default courier unless told otherwise, and never takes a COD amount (CRR-05)', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const named = await booked(shop, await place(shop, lamp.variantId), {
      courierKey: 'steadfast',
    });
    expect(named.courierName).toBe('Steadfast');
    const order = await place(shop, lamp.variantId);
    const withCod = await book(shop, order.id, { cod: 1 });
    expect(withCod.status).toBe(400);
    expect(steadfast.bookings()).toHaveLength(1);
  });

  it('refuses with no courier connected, and what the order can not do (CRR-09, D6-10)', async () => {
    const none = await openShop(port, texts, 'crr');
    const noLamp = await product(none, 'Lamp', 300, 5);
    expect((await book(none, (await place(none, noLamp.variantId)).id)).status).toBe(409);

    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const held = await place(shop, lamp.variantId);
    await shop.post(`/orders/${held.id}/override`, { override: 'hold' });
    expect((await book(shop, held.id)).status).toBe(409);
    const takeaway = await place(shop, lamp.variantId, 1, {
      fulfilmentType: 'takeaway',
      locationId: undefined,
      deliveryAddress: undefined,
    });
    expect((await book(shop, takeaway.id)).status).toBe(409);
    expect(steadfast.bookings()).toEqual([]);
  });

  it('shows who confirmed a pending order that was booked with no call (CRR-09)', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId);
    expect(order.status).toBe('pending');
    const sent = await booked(shop, order);
    expect(sent.confirmedAt).not.toBeNull();
    expect(sent.history.map((row) => row.field)).toContain('confirmed');
  });

  it('sends nothing past a courier’s limits and says what to change, and another courier’s rules are its own (CRR-30, D6-14)', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const longAddress = await place(shop, lamp.variantId, 1, { deliveryAddress: 'x'.repeat(490) });
    const refused = await book(shop, longAddress.id);
    expect(refused.status).toBe(409);
    expect(errorOf(refused).details).toMatchObject({ courierKey: 'steadfast', limit: 490 });
    expect(errorOf(refused).message).toContain('490');
    const longNote = await book(shop, (await place(shop, lamp.variantId)).id, {
      note: 'x'.repeat(481),
    });
    expect(longNote.status).toBe(409);
    expect(steadfast.bookings()).toEqual([]);
    expect(await handledCount(shop.tenantId)).toBe(0);
  });
});

describeIfDatabase('a booking never doubles (exit criterion 3, CRR-07, CRR-08, API-11)', () => {
  it('makes one parcel from two bookings at once, with one fee and one count (CRR-08)', async () => {
    const shop = await payAsYouGo('500.00');
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId);
    const answers = await Promise.all([book(shop, order.id), book(shop, order.id)]);
    const statuses = answers.map((answer) => answer.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(steadfast.bookings()).toHaveLength(1);
    expect((await fees(shop.tenantId)).length).toBe(1);
    expect(await handledCount(shop.tenantId)).toBe(1);
    expect(await stockOf(shop, lamp.id)).toEqual(['4.000', '0.000']);
    const { rows } = await admin.query(
      "SELECT 1 FROM tenant.courier_parcels WHERE tenant_id = $1 AND state = 'booked'",
      [shop.tenantId],
    );
    expect(rows).toHaveLength(1);
    await expectLedgerAgrees(admin, shop.tenantId);
  });

  it('refuses a second booking of a booked order, and the database refuses one anyway', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await booked(shop, await place(shop, lamp.variantId));
    expect((await book(shop, order.id)).status).toBe(409);
    expect(steadfast.bookings()).toHaveLength(1);
    await expect(
      admin.query(
        `INSERT INTO tenant.courier_parcels (tenant_id, order_id, courier_key, state, invoice, cod)
         VALUES ($1, $2, 'steadfast', 'booking', 'x', 0)`,
        [shop.tenantId, order.id],
      ),
    ).rejects.toThrow(/courier_parcels_live_key/);
  });

  it('runs once per Idempotency-Key, replaying the first answer (API-11)', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId);
    const headers = shop.headers({ 'idempotency-key': randomUUID() });
    const first = await postJson(port, `/orders/${order.id}/book`, {}, headers);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const again = await postJson(port, `/orders/${order.id}/book`, {}, headers);
    expect(again.status).toBe(200);
    expect(again.headers['idempotent-replay']).toBe('true');
    expect(steadfast.bookings()).toHaveLength(1);
  });

  it('changes nothing when refused, shows the courier’s words, and books again on the same invoice (CRR-07, PYG-04, QTA-01)', async () => {
    const shop = await payAsYouGo('500.00');
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId);
    const start = (await balanceOf(shop)).amount;
    steadfast.behaviour = {
      refuseBooking: { status: 400, body: { status: 400, message: 'Invalid recipient phone.' } },
    };
    const refused = await book(shop, order.id);
    expect(refused.status).toBe(409);
    expect(errorOf(refused).details).toMatchObject({
      courierKey: 'steadfast',
      courierMessage: 'Invalid recipient phone.',
    });
    const after = await read(shop, order.id);
    expect(after).toMatchObject({
      status: 'pending',
      fulfillmentStatus: 'unfulfilled',
      courierName: null,
      trackingCode: null,
      handledAt: null,
      confirmedAt: null,
    });
    expect(after.parcel).toMatchObject({ state: 'refused', refusal: 'Invalid recipient phone.' });
    expect(await fees(shop.tenantId)).toEqual([]);
    expect(await handledCount(shop.tenantId)).toBe(0);
    expect(await stockOf(shop, lamp.id)).toEqual(['5.000', '1.000']);
    expect(await balanceOf(shop)).toMatchObject({ amount: start, held: '0.00' });

    steadfast.behaviour = {};
    const sent = await booked(shop, order);
    expect(sent.parcel?.invoice).toBe(order.orderNumber);
    expect((await fees(shop.tenantId)).length).toBe(1);
    expect(await handledCount(shop.tenantId)).toBe(1);
  });

  it('reads a failure said in a 200’s body as a refusal, and cuts long words to 200 characters (SEC-16 as amended)', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId);
    steadfast.behaviour = {
      refuseBooking: {
        status: 200,
        body: { status: 400, message: `<b>Bad</b> ${'x'.repeat(400)}` },
      },
    };
    const refused = await book(shop, order.id);
    expect(refused.status).toBe(409);
    const words = errorOf(refused).details['courierMessage'] as string;
    expect(words.length).toBe(200);
    expect(words).not.toContain('<b>');
    expect(words.startsWith('Bad ')).toBe(true);
  });
});

describeIfDatabase(
  'setting the fee and the limit aside during the call (read agreed 2026-11-04)',
  () => {
    it('holds the fee while the call is out, so a second booking can not spend it', async () => {
      const shop = await payAsYouGo('100.00');
      const lamp = await product(shop, 'Lamp', 5000, 5);
      const first = await place(shop, lamp.variantId);
      const second = await place(shop, lamp.variantId);
      const start = (await balanceOf(shop)).amount;
      let during: { amount: string; held: string } | null = null;
      let secondAnswer: HttpResult | null = null;
      steadfast.behaviour = {
        whileBooking: async () => {
          // Only the first booking gets this far.
          steadfast.behaviour = {};
          during = await balanceOf(shop);
          secondAnswer = await book(shop, second.id);
        },
      };
      const sent = await booked(shop, first);
      expect(during).toMatchObject({ amount: start });
      expect(Number((during as unknown as { held: string }).held)).toBeGreaterThan(0);
      const refused = secondAnswer as unknown as HttpResult;
      expect(refused.status).toBe(429);
      expect(errorOf(refused).code).toBe('quota_exceeded');
      expect(steadfast.bookings()).toHaveLength(1);
      expect((await read(shop, second.id)).fulfillmentStatus).toBe('unfulfilled');
      expect(sent.status).toBe('processing');
      const charged = (await fees(shop.tenantId))[0];
      expect((await balanceOf(shop)).held).toBe('0.00');
      expect((await balanceOf(shop)).amount).toBe((Number(start) + Number(charged)).toFixed(2));
    });

    it('refuses before calling when the balance can not cover the fee (PYG-03)', async () => {
      // What's left once the product's own fee is paid: well short of this order's.
      const shop = await payAsYouGo('15.00');
      const lamp = await product(shop, 'Lamp', 5000, 5);
      const order = await place(shop, lamp.variantId);
      const refused = await book(shop, order.id);
      expect(refused.status).toBe(429);
      expect(steadfast.bookings()).toEqual([]);
      expect((await read(shop, order.id)).handledAt).toBeNull();
      expect(await balanceOf(shop)).toMatchObject({ amount: '5.00', held: '0.00' });
    });

    it('gives the hold back when the courier refuses', async () => {
      const shop = await payAsYouGo('100.00');
      const lamp = await product(shop, 'Lamp', 5000, 5);
      const order = await place(shop, lamp.variantId);
      const start = (await balanceOf(shop)).amount;
      steadfast.behaviour = {
        refuseBooking: { status: 400, body: { status: 400, message: 'No.' } },
      };
      expect((await book(shop, order.id)).status).toBe(409);
      expect(await balanceOf(shop)).toMatchObject({ amount: start, held: '0.00' });
      expect(await fees(shop.tenantId)).toEqual([]);
    });

    it('takes the order’s place under the limit before the call, and gives it back on a refusal (QTA-01)', async () => {
      const shop = await connectedShop();
      await app
        .get(PlanLimitOverridesService)
        .set(shop.tenantId, 'orders_total', 1, 'courier booking test', randomUUID());
      const lamp = await product(shop, 'Lamp', 300, 5);
      const first = await place(shop, lamp.variantId);
      const second = await place(shop, lamp.variantId);
      let secondAnswer: HttpResult | null = null;
      steadfast.behaviour = {
        whileBooking: async () => {
          steadfast.behaviour = {
            refuseBooking: { status: 400, body: { status: 400, message: 'No.' } },
          };
          secondAnswer = await book(shop, second.id);
        },
      };
      const firstAnswer = await book(shop, first.id);
      expect(firstAnswer.status).toBe(409);
      expect((secondAnswer as unknown as HttpResult).status).toBe(402);
      steadfast.behaviour = {};
      expect(await handledCount(shop.tenantId)).toBe(0);
      await booked(shop, second);
      expect(await handledCount(shop.tenantId)).toBe(1);
    });

    it('refuses a serial another booking has named while its call is out', async () => {
      const shop = await connectedShop();
      const phone = await serialProduct(shop, ['SN-A', 'SN-B']);
      const first = await place(shop, phone.variantId);
      const second = await place(shop, phone.variantId);
      let secondAnswer: HttpResult | null = null;
      steadfast.behaviour = {
        whileBooking: async () => {
          steadfast.behaviour = {};
          secondAnswer = await book(shop, second.id, {
            serials: [{ lineId: second.items[0]?.id, serials: ['SN-A'] }],
          });
        },
      };
      await booked(shop, first, { serials: [{ lineId: first.items[0]?.id, serials: ['SN-A'] }] });
      expect((secondAnswer as unknown as HttpResult).status).toBe(409);
      expect(steadfast.bookings()).toHaveLength(1);
      expect(await serialsIn(shop, phone)).toEqual(['SN-B']);
    });

    it('refuses before calling when the serials are wrong (INV-14)', async () => {
      const shop = await connectedShop();
      const phone = await serialProduct(shop, ['SN-A']);
      const order = await place(shop, phone.variantId);
      expect((await book(shop, order.id)).status).toBe(409);
      expect(
        (
          await book(shop, order.id, {
            serials: [{ lineId: order.items[0]?.id, serials: ['SN-NOPE'] }],
          })
        ).status,
      ).toBeGreaterThanOrEqual(400);
      expect(steadfast.bookings()).toEqual([]);
      expect(await serialsIn(shop, phone)).toEqual(['SN-A']);
      expect(await handledCount(shop.tenantId)).toBe(0);
    });

    it('never loses an accepted parcel when its stock can no longer be taken, and says so (§3.6)', async () => {
      const shop = await payAsYouGo('500.00');
      const phone = await serialProduct(shop, ['SN-A', 'SN-B']);
      const first = await place(shop, phone.variantId);
      const other = await place(shop, phone.variantId);
      steadfast.behaviour = {
        whileBooking: async () => {
          // By hand, during the call, someone sends the serial this booking named.
          steadfast.behaviour = {};
          const shipped = await shop.post(`/orders/${other.id}/ship`, {
            courierName: 'Own rider',
            trackingCode: 'R-1',
            serials: [{ lineId: other.items[0]?.id, serials: ['SN-A'] }],
          });
          expect(shipped.status, JSON.stringify(shipped.body)).toBe(200);
        },
      };
      const answered = await book(shop, first.id, {
        serials: [{ lineId: first.items[0]?.id, serials: ['SN-A'] }],
      });
      expect(answered.status, JSON.stringify(answered.body)).toBe(200);
      const order = answered.body as Order;
      expect(order.fulfillmentStatus).toBe('unfulfilled');
      expect(order.parcel).toMatchObject({ state: 'booked', settled: false });
      expect(order.parcel?.consignmentId).not.toBeNull();
      expect(order.parcel?.settleProblem).not.toBeNull();
      // The other order's fee is charged; this one's is still held.
      expect(Number((await balanceOf(shop)).held)).toBeGreaterThan(0);
      // The minute pass leaves it for staff, who call it off.
      await passAfter(3);
      expect((await read(shop, first.id)).parcel).toMatchObject({ settled: false });
      expect(
        (
          await shop.post(`/orders/${first.id}/ship`, {
            courierName: 'x',
            trackingCode: 'y',
          })
        ).status,
      ).toBe(409);
      const cancelled = await shop.post(`/orders/${first.id}/parcel/cancel`, {
        courierCancelled: true,
      });
      expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
      expect((await balanceOf(shop)).held).toBe('0.00');
      expect((await read(shop, first.id)).handledAt).toBeNull();
    });
  },
);

describeIfDatabase('a lost answer (CRR-18, D6-11, exit criterion 3)', () => {
  it('stays unknown with everything set aside, and refuses another booking until it settles', async () => {
    const shop = await payAsYouGo('500.00');
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId);
    steadfast.behaviour = { bookingTimesOut: { madeIt: true } };
    const lost = await book(shop, order.id);
    expect(lost.status).toBe(503);
    expect(errorOf(lost).code).toBe('service_unavailable');
    steadfast.behaviour = {};
    const after = await read(shop, order.id);
    expect(after.parcel).toMatchObject({ state: 'unknown', settled: false });
    expect(after.fulfillmentStatus).toBe('unfulfilled');
    expect(Number((await balanceOf(shop)).held)).toBeGreaterThan(0);
    expect(await fees(shop.tenantId)).toEqual([]);
    expect(await handledCount(shop.tenantId)).toBe(1);
    expect(await stockOf(shop, lamp.id)).toEqual(['5.000', '1.000']);

    const again = await book(shop, order.id);
    expect(again.status).toBe(409);
    expect(errorOf(again).details).toMatchObject({ parcelState: 'unknown' });
    expect(steadfast.bookings()).toHaveLength(1);
    for (const move of [
      () => shop.post(`/orders/${order.id}/ship`, { courierName: 'x', trackingCode: 'y' }),
      () => shop.post(`/orders/${order.id}/cancel`, { reason: 'customer_cancelled' }),
      () => shop.patch(`/orders/${order.id}`, { notes: 'x' }),
      () => shop.post(`/orders/${order.id}/override`, { override: 'hold' }),
      () => shop.post(`/orders/${order.id}/calls`, { outcome: 'cancelled', reason: 'duplicate' }),
      () => shop.delete(`/orders/${order.id}`),
    ]) {
      expect((await move()).status).toBe(409);
    }
  });

  it('asks by our own number after two minutes, and a parcel found settles once (D6-11)', async () => {
    const shop = await payAsYouGo('500.00');
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId);
    steadfast.behaviour = { bookingTimesOut: { madeIt: true } };
    await book(shop, order.id);
    steadfast.behaviour = {};
    await passAfter(1);
    expect(steadfast.callsTo(`/status_by_invoice/${order.orderNumber}`)).toEqual([]);
    await passAfter(3);
    expect(steadfast.callsTo(`/status_by_invoice/${order.orderNumber}`)).toHaveLength(1);
    const found = await read(shop, order.id);
    expect(found).toMatchObject({ status: 'processing', courierName: 'Steadfast' });
    // Close-out (A5): whoever booked it confirmed it, though the minute pass settled it.
    expect(found.confirmedBy?.id).toBeTruthy();
    expect(found.parcel).toMatchObject({
      state: 'booked',
      settled: true,
      courierStatus: 'in_review',
    });
    expect((await fees(shop.tenantId)).length).toBe(1);
    expect(await handledCount(shop.tenantId)).toBe(1);
    expect(await stockOf(shop, lamp.id)).toEqual(['4.000', '0.000']);
    expect((await balanceOf(shop)).held).toBe('0.00');
    // Run again: nothing left to do.
    await passAfter(30);
    expect(steadfast.callsTo(`/status_by_invoice/${order.orderNumber}`)).toHaveLength(1);
    expect((await fees(shop.tenantId)).length).toBe(1);
    await expectLedgerAgrees(admin, shop.tenantId);
    // Its IDs weren't in that answer, so staff can add them from the panel.
    const filled = await shop.post(`/orders/${order.id}/parcel/settle`, {
      outcome: 'booked',
      consignmentId: '777',
      trackingCode: 'TRK777',
    });
    expect(filled.status, JSON.stringify(filled.body)).toBe(200);
    expect((filled.body as Order).parcel).toMatchObject({ consignmentId: '777', settled: true });
    // Close-out (A3): and the order's tracking, which the shopper sees, has them too.
    expect(filled.body).toMatchObject({
      trackingCode: 'TRK777',
      trackingLink: expect.stringContaining('TRK777') as string,
    });
    expect((await fees(shop.tenantId)).length).toBe(1);
  });

  it('never brings back a booking staff said wasn’t made, nor refuses one they said was (A6, close-out)', async () => {
    const shop = await payAsYouGo('500.00');
    const lamp = await product(shop, 'Lamp', 300, 5);
    const gone = await place(shop, lamp.variantId);
    const made = await place(shop, lamp.variantId);
    steadfast.behaviour = { bookingTimesOut: { madeIt: false } };
    await book(shop, gone.id);
    await book(shop, made.id);
    steadfast.behaviour = {};
    const parcelOf = async (orderId: string): Promise<SelectCourierParcel> => {
      const { rows } = await admin.query<{ id: string }>(
        'SELECT id FROM tenant.courier_parcels WHERE order_id = $1',
        [orderId],
      );
      return { id: rows[0]?.id ?? '', orderId } as SelectCourierParcel;
    };
    const booking = app.get(CourierBooking);
    // Staff say it wasn't made; a look-up already out then finds it.
    expect(
      (await shop.post(`/orders/${gone.id}/parcel/settle`, { outcome: 'not_booked' })).status,
    ).toBe(200);
    await booking.foundByLookUp(shop.tenantId, await parcelOf(gone.id), {
      consignmentId: '901',
      trackingCode: null,
      courierStatus: 'in_review',
    });
    expect(await read(shop, gone.id)).toMatchObject({
      handledAt: null,
      parcel: { state: 'refused' },
    });
    // Staff say it was; a look-up already out then finds no such parcel.
    const yes = await shop.post(`/orders/${made.id}/parcel/settle`, {
      outcome: 'booked',
      consignmentId: '902',
      trackingCode: 'TRK902',
    });
    expect(yes.status, JSON.stringify(yes.body)).toBe(200);
    await booking.notBooked(shop.tenantId, await parcelOf(made.id));
    expect(await read(shop, made.id)).toMatchObject({
      status: 'processing',
      parcel: { state: 'booked', consignmentId: '902' },
    });
    expect((await fees(shop.tenantId)).length).toBe(1);
    await expectLedgerAgrees(admin, shop.tenantId);
  });

  it('cancels a booking once when staff press it twice at once (A6, close-out)', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await booked(shop, await place(shop, lamp.variantId));
    const answers = await Promise.all([
      shop.post(`/orders/${order.id}/parcel/cancel`, { courierCancelled: true }),
      shop.post(`/orders/${order.id}/parcel/cancel`, { courierCancelled: true }),
    ]);
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
    const { rows } = await admin.query(
      "SELECT 1 FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'parcel_cancelled'",
      [shop.tenantId],
    );
    expect(rows).toHaveLength(1);
  });

  it('closes after two looks find no parcel, giving everything back, and books again on the same invoice', async () => {
    const shop = await payAsYouGo('500.00');
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId);
    const start = (await balanceOf(shop)).amount;
    steadfast.behaviour = { bookingTimesOut: { madeIt: false } };
    await book(shop, order.id);
    steadfast.behaviour = {};
    await passAfter(3);
    expect((await read(shop, order.id)).parcel?.state).toBe('unknown');
    await passAfter(20);
    const closed = await read(shop, order.id);
    expect(closed.parcel?.state).toBe('refused');
    expect(closed.handledAt).toBeNull();
    expect(await balanceOf(shop)).toMatchObject({ amount: start, held: '0.00' });
    expect(await fees(shop.tenantId)).toEqual([]);
    clockShift = 0;
    const sent = await booked(shop, order);
    expect(sent.parcel?.invoice).toBe(order.orderNumber);
    expect(steadfast.consignments).toHaveLength(1);
  });

  it('treats a server error or a success naming no consignment as unknown, never refused', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    for (const behaviour of [
      { bookingServerError: { madeIt: true } },
      { bookingSuccessWithoutConsignment: true },
      { bookingPage: true },
    ]) {
      steadfast.behaviour = behaviour;
      const order = await place(shop, lamp.variantId);
      expect((await book(shop, order.id)).status, JSON.stringify(behaviour)).toBe(503);
      expect((await read(shop, order.id)).parcel?.state).toBe('unknown');
    }
  });

  it('lets staff settle it from the courier’s panel, either way (D6-11)', async () => {
    const shop = await payAsYouGo('500.00');
    const lamp = await product(shop, 'Lamp', 300, 5);
    const made = await place(shop, lamp.variantId);
    const notMade = await place(shop, lamp.variantId);
    steadfast.behaviour = { bookingTimesOut: { madeIt: false } };
    await book(shop, made.id);
    await book(shop, notMade.id);
    steadfast.behaviour = {};

    const missing = await shop.post(`/orders/${made.id}/parcel/settle`, { outcome: 'booked' });
    expect(missing.status).toBe(400);
    const yes = await shop.post(`/orders/${made.id}/parcel/settle`, {
      outcome: 'booked',
      consignmentId: '555',
      trackingCode: 'TRK555',
    });
    expect(yes.status, JSON.stringify(yes.body)).toBe(200);
    expect(yes.body).toMatchObject({
      status: 'processing',
      trackingCode: 'TRK555',
      parcel: { state: 'booked', consignmentId: '555', settled: true },
    });

    const no = await shop.post(`/orders/${notMade.id}/parcel/settle`, { outcome: 'not_booked' });
    expect(no.status, JSON.stringify(no.body)).toBe(200);
    expect(no.body).toMatchObject({ handledAt: null, parcel: { state: 'refused' } });
    expect((await fees(shop.tenantId)).length).toBe(1);
    expect((await balanceOf(shop)).held).toBe('0.00');
    const none = await shop.post(`/orders/${notMade.id}/parcel/settle`, { outcome: 'not_booked' });
    expect(none.status).toBe(409);
    const { rows } = await admin.query(
      "SELECT 1 FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'parcel_settled'",
      [shop.tenantId],
    );
    expect(rows).toHaveLength(2);
  });

  it('turns a booking the server died during into a lost answer (§3.6)', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId);
    await admin.query(
      `INSERT INTO tenant.courier_parcels (tenant_id, order_id, courier_key, state, invoice, cod, created_at)
       VALUES ($1, $2, 'steadfast', 'booking', $3, 0, now())`,
      [shop.tenantId, order.id, order.orderNumber],
    );
    await passAfter(1);
    expect((await read(shop, order.id)).parcel?.state).toBe('booking');
    await passAfter(3);
    expect((await read(shop, order.id)).parcel?.state).toBe('unknown');
    await passAfter(3);
    expect(steadfast.callsTo(`/status_by_invoice/${order.orderNumber}`)).toHaveLength(1);
  });
});

describeIfDatabase('cancelling a booked order (CRR-28, exit criterion 6)', () => {
  it('asks staff to confirm first, then brings the stock back once and keeps the fee and count', async () => {
    const shop = await payAsYouGo('500.00');
    const phone = await serialProduct(shop, ['SN-A', 'SN-B']);
    const order = await place(shop, phone.variantId);
    await booked(shop, order, { serials: [{ lineId: order.items[0]?.id, serials: ['SN-A'] }] });
    expect(await stockOf(shop, phone.id)).toEqual(['1.000', '0.000']);
    const charged = await fees(shop.tenantId);

    const unconfirmed = await shop.post(`/orders/${order.id}/cancel`, {
      reason: 'customer_cancelled',
    });
    expect(unconfirmed.status).toBe(409);
    expect(errorOf(unconfirmed).details).toMatchObject({ courierKey: 'steadfast' });
    expect((await read(shop, order.id)).status).toBe('processing');

    const cancelled = await shop.post(`/orders/${order.id}/cancel`, {
      reason: 'customer_cancelled',
      courierCancelled: true,
    });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect(cancelled.body).toMatchObject({
      status: 'cancelled',
      cancelReason: 'customer_cancelled',
      parcel: { state: 'cancelled' },
    });
    expect(await stockOf(shop, phone.id)).toEqual(['2.000', '0.000']);
    expect(await serialsIn(shop, phone)).toEqual(['SN-A', 'SN-B']);
    expect(await fees(shop.tenantId)).toEqual(charged);
    expect(await handledCount(shop.tenantId)).toBe(1);
    await expectLedgerAgrees(admin, shop.tenantId);

    const twice = await shop.post(`/orders/${order.id}/cancel`, {
      reason: 'customer_cancelled',
      courierCancelled: true,
    });
    expect(twice.status).toBe(409);
    expect(await stockOf(shop, phone.id)).toEqual(['2.000', '0.000']);
  });

  it('cancels an order with no booking as ever, and refuses one that has shipped (ORD-52)', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const plain = await place(shop, lamp.variantId);
    const cancelled = await shop.post(`/orders/${plain.id}/cancel`, { reason: 'duplicate' });
    expect(cancelled.status).toBe(200);
    expect(await stockOf(shop, lamp.id)).toEqual(['5.000', '0.000']);

    const sent = await booked(shop, await place(shop, lamp.variantId));
    await shop.post(`/orders/${sent.id}/ship`, { courierName: 'Steadfast', trackingCode: 'T' });
    const late = await shop.post(`/orders/${sent.id}/cancel`, {
      reason: 'duplicate',
      courierCancelled: true,
    });
    expect(late.status).toBe(409);
    expect(errorOf(late).message).toBeTruthy();
    expect((await read(shop, sent.id)).status).toBe('shipped');
  });

  it('refuses other ways of cancelling or deleting a booked order, which would lose its stock', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await booked(shop, await place(shop, lamp.variantId));
    expect(
      (await shop.post(`/orders/${order.id}/calls`, { outcome: 'cancelled', reason: 'duplicate' }))
        .status,
    ).toBe(409);
    expect((await shop.delete(`/orders/${order.id}`)).status).toBe(409);
    expect(await stockOf(shop, lamp.id)).toEqual(['4.000', '0.000']);
  });
});

describeIfDatabase(
  'cancelling only the booking, and booking again (QTA-01, read agreed 2026-11-04)',
  () => {
    it('keeps the order, its stock out, fee and count, and gives the next attempt its own invoice', async () => {
      const shop = await payAsYouGo('500.00');
      const phone = await serialProduct(shop, ['SN-A', 'SN-B']);
      const order = await place(shop, phone.variantId);
      const first = await booked(shop, order, {
        serials: [{ lineId: order.items[0]?.id, serials: ['SN-A'] }],
      });
      const charged = await fees(shop.tenantId);

      const unconfirmed = await shop.post(`/orders/${order.id}/parcel/cancel`, {});
      expect(unconfirmed.status).toBe(409);
      const called = await shop.post(`/orders/${order.id}/parcel/cancel`, {
        courierCancelled: true,
      });
      expect(called.status, JSON.stringify(called.body)).toBe(200);
      expect(called.body).toMatchObject({
        status: 'processing',
        courierName: null,
        trackingCode: null,
        trackingLink: null,
        parcel: { state: 'cancelled' },
      });
      expect(await stockOf(shop, phone.id)).toEqual(['1.000', '0.000']);
      expect(await serialsIn(shop, phone)).toEqual(['SN-B']);

      const again = await booked(shop, order);
      expect(again.parcel?.invoice).toBe(`${order.orderNumber}-2`);
      expect(again.parcel?.consignmentId).not.toBe(first.parcel?.consignmentId);
      expect(again).toMatchObject({ status: 'processing', courierName: 'Steadfast' });
      expect(await fees(shop.tenantId)).toEqual(charged);
      expect(await handledCount(shop.tenantId)).toBe(1);
      expect(await stockOf(shop, phone.id)).toEqual(['1.000', '0.000']);
      expect(steadfast.consignments).toHaveLength(2);
      await expectLedgerAgrees(admin, shop.tenantId);

      // And a third time numbers on.
      await shop.post(`/orders/${order.id}/parcel/cancel`, { courierCancelled: true });
      const third = await booked(shop, order);
      expect(third.parcel?.invoice).toBe(`${order.orderNumber}-3`);
    });

    it('lets a called-off order be marked shipped by hand or cancelled with its stock back', async () => {
      const shop = await connectedShop();
      const lamp = await product(shop, 'Lamp', 300, 5);
      const byHand = await booked(shop, await place(shop, lamp.variantId));
      await shop.post(`/orders/${byHand.id}/parcel/cancel`, { courierCancelled: true });
      const shipped = await shop.post(`/orders/${byHand.id}/ship`, {
        courierName: 'Own rider',
        trackingCode: 'R-1',
      });
      expect(shipped.status, JSON.stringify(shipped.body)).toBe(200);
      expect(await stockOf(shop, lamp.id)).toEqual(['4.000', '0.000']);

      const dropped = await booked(shop, await place(shop, lamp.variantId));
      await shop.post(`/orders/${dropped.id}/parcel/cancel`, { courierCancelled: true });
      const cancelled = await shop.post(`/orders/${dropped.id}/cancel`, { reason: 'duplicate' });
      expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
      expect(await stockOf(shop, lamp.id)).toEqual(['4.000', '0.000']);
      await expectLedgerAgrees(admin, shop.tenantId);
    });

    it('has nothing to cancel on an order with no booking', async () => {
      const shop = await connectedShop();
      const lamp = await product(shop, 'Lamp', 300, 5);
      const order = await place(shop, lamp.variantId);
      expect((await shop.post(`/orders/${order.id}/parcel/cancel`, {})).status).toBe(409);
    });
  },
);

describeIfDatabase('editing an order after booking (ORD-11, D6-7)', () => {
  it('lets details change with the warning, and refuses what stock or totals depend on', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await booked(shop, await place(shop, lamp.variantId));
    const details = await shop.patch(`/orders/${order.id}`, { deliveryAddress: 'House 9, Road 1' });
    expect(details.status, JSON.stringify(details.body)).toBe(200);
    expect(details.body).toMatchObject({
      deliveryAddress: 'House 9, Road 1',
      courierRecordUnchanged: true,
      grandTotal: order.grandTotal,
    });
    for (const change of [
      { discount: 10 },
      { deliveryCharge: 200 },
      { items: [{ variantId: lamp.variantId, quantity: 2 }] },
    ]) {
      const refused = await shop.patch(`/orders/${order.id}`, change);
      expect(refused.status, JSON.stringify(change)).toBe(409);
    }
    expect(await stockOf(shop, lamp.id)).toEqual(['4.000', '0.000']);
  });

  it('says nothing of the courier on an order not booked', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId);
    const edited = await shop.patch(`/orders/${order.id}`, { notes: 'x' });
    expect(edited.body).toMatchObject({ courierRecordUnchanged: false, parcel: null });
  });
});

describeIfDatabase('limits on calls (CRR-19, CRR-26, SEC-02)', () => {
  it('opens the circuit for one shop’s courier only, and a call it refuses is not made (CRR-26)', async () => {
    const troubled = await connectedShop();
    const lamp = await product(troubled, 'Lamp', 300, 20);
    steadfast.behaviour = { down: true };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const order = await place(troubled, lamp.variantId);
      expect((await book(troubled, order.id)).status).toBe(503);
    }
    const calls = steadfast.bookings().length;
    const blocked = await place(troubled, lamp.variantId);
    const refused = await book(troubled, blocked.id);
    expect(refused.status).toBe(503);
    expect(steadfast.bookings().length).toBe(calls);
    // Nothing was sent, so nothing is unknown: this attempt is over.
    expect((await read(troubled, blocked.id)).parcel?.state).toBe('refused');

    steadfast.behaviour = {};
    const healthy = await connectedShop();
    const other = await product(healthy, 'Lamp', 300, 5);
    await booked(healthy, await place(healthy, other.variantId));
  });

  it('refuses the 61st booking call in a minute (CRR-19)', async () => {
    const shop = await connectedShop();
    const missing = randomUUID();
    for (let attempt = 0; attempt < 60; attempt += 1) {
      expect((await book(shop, missing)).status).toBe(404);
    }
    const over = await book(shop, missing);
    expect(over.status).toBe(429);
    expect(errorOf(over).code).toBe('rate_limited');
  });

  it('answers 404 for another shop’s order on every parcel route, sending nothing (SEC-02)', async () => {
    const owner = await connectedShop();
    const other = await connectedShop();
    const lamp = await product(owner, 'Lamp', 300, 5);
    const order = await booked(owner, await place(owner, lamp.variantId));
    steadfast.calls.length = 0;
    expect((await book(other, order.id)).status).toBe(404);
    expect(
      (await other.post(`/orders/${order.id}/parcel/settle`, { outcome: 'not_booked' })).status,
    ).toBe(404);
    expect(
      (await other.post(`/orders/${order.id}/parcel/cancel`, { courierCancelled: true })).status,
    ).toBe(404);
    expect((await other.post(`/orders/${order.id}/cancel`, { reason: 'duplicate' })).status).toBe(
      404,
    );
    expect(steadfast.calls).toEqual([]);
    expect((await read(owner, order.id)).status).toBe('processing');
  });

  it('lists only the shop’s own connections, with row-level security on every table (SEC-02)', async () => {
    const first = await connectedShop();
    const second = await openShop(port, texts, 'crr');
    const { connections } = (await second.get('/couriers/connections')).body as {
      connections: unknown[];
    };
    expect(connections).toEqual([]);
    expect((await second.delete('/couriers/connections/steadfast')).status).toBe(404);
    expect((await second.put('/couriers/connections/steadfast/default', {})).status).toBe(404);
    expect(
      ((await first.get('/couriers/connections')).body as { connections: unknown[] }).connections,
    ).toHaveLength(1);
    const { rows } = await admin.query<{ relname: string; forced: boolean }>(
      `SELECT c.relname, c.relforcerowsecurity AS forced FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'tenant' AND c.relname = ANY($1)`,
      [['courier_connections', 'courier_parcels', 'courier_credential_uses']],
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.forced)).toBe(true);
  });
});

describeIfDatabase('what another courier may declare (exit criterion 8, D6-5, D6-8, D6-14)', () => {
  // Steadfast takes no weight or area and has no cancel call; Pathao and RedX differ. Shared code is proven here, on Steadfast's
  // adapter with those declared, so that adding them changes no booking or order code.
  async function declaring(
    changes: Partial<Pick<CourierAdapter, 'limits' | 'needsArea' | 'cancel' | 'lookUp'>>,
    work: () => Promise<void>,
  ): Promise<void> {
    const adapter = app.get<Record<string, unknown>>(SteadfastAdapter);
    const before = Object.keys(changes).map((key): [string, PropertyDescriptor | undefined] => [
      key,
      Object.getOwnPropertyDescriptor(adapter, key),
    ]);
    Object.assign(adapter, changes);
    try {
      await work();
    } finally {
      for (const [key, descriptor] of before) {
        if (descriptor) Object.defineProperty(adapter, key, descriptor);
        else Reflect.deleteProperty(adapter, key);
      }
    }
  }

  it('calls a courier’s own cancel with no confirmation asked, and stock comes back (D6-8, CRR-28)', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await booked(shop, await place(shop, lamp.variantId));
    const asked: string[] = [];
    await declaring(
      {
        cancel: (_account, consignmentId) => {
          asked.push(consignmentId);
          return Promise.resolve({ outcome: 'cancelled' });
        },
      },
      async () => {
        const cancelled = await shop.post(`/orders/${order.id}/cancel`, { reason: 'duplicate' });
        expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
      },
    );
    expect(asked).toEqual([order.parcel?.consignmentId]);
    expect((await read(shop, order.id)).status).toBe('cancelled');
    expect(await stockOf(shop, lamp.id)).toEqual(['5.000', '0.000']);
    const { uses } = await app.get(CourierConnections).uses(shop.tenantId, 1, 20);
    expect(uses[0]).toMatchObject({ action: 'cancel', orderId: order.id, succeeded: true });
  });

  it('changes nothing when a courier refuses a cancel or gives no answer (D6-8)', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await booked(shop, await place(shop, lamp.variantId));
    await declaring(
      {
        cancel: () =>
          Promise.resolve({
            outcome: 'refused',
            refusal: { message: 'Already picked up.', login: false },
          }),
      },
      async () => {
        const refused = await shop.post(`/orders/${order.id}/parcel/cancel`, {});
        expect(refused.status).toBe(409);
        expect(errorOf(refused).details).toMatchObject({ courierMessage: 'Already picked up.' });
      },
    );
    // Read agreed 2026-11-06: no answer is not a yes, so staff are asked to confirm it in the courier's panel.
    await declaring({ cancel: () => Promise.reject(new CourierNoAnswer('down')) }, async () => {
      const unanswered = await shop.post(`/orders/${order.id}/cancel`, { reason: 'duplicate' });
      expect(unanswered.status).toBe(409);
      expect(errorOf(unanswered).details).toMatchObject({ courierNotAnswering: true });
    });
    expect(await read(shop, order.id)).toMatchObject({
      status: 'processing',
      courierName: 'Steadfast',
      parcel: { state: 'booked', settled: true },
    });
    expect(await stockOf(shop, lamp.id)).toEqual(['4.000', '0.000']);
  });

  it('works a weight from the items, takes staff’s instead, and keeps to the courier’s range (ATR-13, CMB-07, CRR-30)', async () => {
    const limits = { ...app.get(SteadfastAdapter).limits, weightKg: { min: 0.5, max: 10 } };
    const shop = await connectedShop();
    const heavy = await product(shop, 'Lamp', 300, 20, { weightKg: 2 });
    const unweighed = await product(shop, 'Scarf', 300, 20);
    await declaring({ limits }, async () => {
      const worked = await booked(shop, await place(shop, heavy.variantId, 2));
      expect(worked.parcel?.weightKg).toBe('4.000');
      const none = await book(shop, (await place(shop, unweighed.variantId)).id);
      expect(none.status).toBe(409);
      expect(errorOf(none).message).toContain('Steadfast');
      const given = await booked(shop, await place(shop, unweighed.variantId), { weightKg: 1.5 });
      expect(given.parcel?.weightKg).toBe('1.500');
      const tooMuch = await book(shop, (await place(shop, heavy.variantId, 6)).id);
      expect(tooMuch.status).toBe(409);
      expect(errorOf(tooMuch).details).toMatchObject({ limit: 10 });
    });
    expect(steadfast.bookings()).toHaveLength(2);
  });

  it('keeps a weight off a courier that takes none (D6-14)', async () => {
    const shop = await connectedShop();
    const heavy = await product(shop, 'Lamp', 300, 20, { weightKg: 2 });
    const sent = await booked(shop, await place(shop, heavy.variantId), { weightKg: 1 });
    expect(sent.parcel?.weightKg).toBeNull();
  });

  it('asks for an area only where the courier needs one (CRR-10, D6-5)', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 20);
    await declaring({ needsArea: true }, async () => {
      const order = await place(shop, lamp.variantId);
      const refused = await book(shop, order.id);
      expect(refused.status).toBe(409);
      expect(steadfast.bookings()).toEqual([]);
      // Slice 6.4 (CUS-12): an area is one of the courier's own, in the order's zilla.
      expect((await book(shop, order.id, { areaCode: 'A-42' })).status).toBe(409);
      await admin.query(
        `INSERT INTO control.courier_areas (courier_key, area_code, name, district_name, zilla_id, match, refreshed_at)
         SELECT 'steadfast', 'A-42', 'Area 42', 'Dhaka', l.zilla_id, 'none', now()
         FROM tenant.orders o JOIN control.locations l ON l.id = o.location_id WHERE o.id = $1
         ON CONFLICT DO NOTHING`,
        [order.id],
      );
      const sent = await booked(shop, order, { areaCode: 'A-42' });
      expect(sent.parcel?.areaCode).toBe('A-42');
    });
    const plain = await booked(shop, await place(shop, lamp.variantId), { areaCode: 'A-42' });
    expect(plain.parcel?.areaCode).toBeNull();
  });

  it('keeps to a courier’s shortest name and address (CRR-30)', async () => {
    const limits = { ...app.get(SteadfastAdapter).limits, nameMin: 3, addressMin: 100 };
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 20);
    await declaring({ limits }, async () => {
      const name = await book(
        shop,
        (await place(shop, lamp.variantId, 1, { customerName: 'Al' })).id,
      );
      expect(errorOf(name).details).toMatchObject({ limit: 3 });
      const address = await book(shop, (await place(shop, lamp.variantId)).id);
      expect(errorOf(address).details).toMatchObject({ limit: 100 });
    });
    expect(steadfast.bookings()).toEqual([]);
  });

  it('leaves a lost answer to staff where the courier can’t be asked (D6-11)', async () => {
    const shop = await connectedShop();
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId);
    steadfast.behaviour = { bookingTimesOut: { madeIt: true } };
    await declaring({ lookUp: undefined }, async () => {
      expect((await book(shop, order.id)).status).toBe(503);
      steadfast.behaviour = {};
      await passAfter(30);
      expect(steadfast.callsTo(`/status_by_invoice/${order.orderNumber}`)).toEqual([]);
      expect((await read(shop, order.id)).parcel?.state).toBe('unknown');
      clockShift = 0;
      const settled = await shop.post(`/orders/${order.id}/parcel/settle`, {
        outcome: 'booked',
        consignmentId: '901',
      });
      expect(settled.status, JSON.stringify(settled.body)).toBe(200);
      expect(settled.body).toMatchObject({ status: 'processing', trackingCode: '901' });
    });
  });
});

describeIfDatabase('settling runs once, whoever gets there (§8, exit criterion 3)', () => {
  function timesMovedToProcessing(order: Order): number {
    return order.history.filter((row) => row.to === 'processing').length;
  }

  it('finishes a parcel accepted just before the server died, once, with two passes at once (§3.6)', async () => {
    const shop = await payAsYouGo('500.00');
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId);
    const start = Number((await balanceOf(shop)).amount);
    // What the server leaves if it dies after writing the courier's yes and before the order takes it.
    await admin.query(
      `INSERT INTO tenant.courier_parcels
         (tenant_id, order_id, courier_key, state, invoice, cod, consignment_id, tracking_code,
          fee_held, fee_rates, took_place)
       VALUES ($1, $2, 'steadfast', 'booked', $3, $4, '4242', 'TRK4242', 20, '{"minimum":"20","percent":"1.5"}', true)`,
      [shop.tenantId, order.id, order.orderNumber, order.due],
    );
    await admin.query('UPDATE tenant.orders SET handled_at = now() WHERE id = $1', [order.id]);
    expect((await balanceOf(shop)).held).toBe('20.00');

    const pass = app.get(CourierBookingPass);
    await Promise.all([pass.runTick(), pass.runTick()]);

    const settled = await read(shop, order.id);
    expect(settled).toMatchObject({
      status: 'processing',
      courierName: 'Steadfast',
      trackingCode: 'TRK4242',
      parcel: { state: 'booked', settled: true, consignmentId: '4242' },
    });
    expect(timesMovedToProcessing(settled)).toBe(1);
    expect(await fees(shop.tenantId)).toEqual(['-20.00']);
    expect(await balanceOf(shop)).toMatchObject({ amount: (start - 20).toFixed(2), held: '0.00' });
    expect(await stockOf(shop, lamp.id)).toEqual(['4.000', '0.000']);
    await expectLedgerAgrees(admin, shop.tenantId);
    // Nothing was sent to the courier to finish it, and a later pass finds nothing left.
    expect(steadfast.calls).toEqual([]);
    await passAfter(5);
    expect(timesMovedToProcessing(await read(shop, order.id))).toBe(1);
    expect((await fees(shop.tenantId)).length).toBe(1);
  });

  it('settles a parcel found by its invoice once, with two passes at once (D6-11)', async () => {
    const shop = await payAsYouGo('500.00');
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId);
    steadfast.behaviour = { bookingTimesOut: { madeIt: true } };
    await book(shop, order.id);
    steadfast.behaviour = {};
    clockShift = 3 * MINUTE_MS;
    const pass = app.get(CourierBookingPass);
    await Promise.all([pass.runTick(), pass.runTick()]);
    const settled = await read(shop, order.id);
    expect(settled.parcel).toMatchObject({ state: 'booked', settled: true });
    expect(timesMovedToProcessing(settled)).toBe(1);
    expect((await fees(shop.tenantId)).length).toBe(1);
    expect(await stockOf(shop, lamp.id)).toEqual(['4.000', '0.000']);
    await expectLedgerAgrees(admin, shop.tenantId);
  });

  it('settles once when staff say the same thing twice at once (D6-11)', async () => {
    const shop = await payAsYouGo('500.00');
    const lamp = await product(shop, 'Lamp', 300, 5);
    const order = await place(shop, lamp.variantId);
    steadfast.behaviour = { bookingTimesOut: { madeIt: true } };
    await book(shop, order.id);
    steadfast.behaviour = {};
    const answers = await Promise.all(
      [1, 2].map(() =>
        shop.post(`/orders/${order.id}/parcel/settle`, {
          outcome: 'booked',
          consignmentId: '888',
        }),
      ),
    );
    expect(answers.map((answer) => answer.status)).toContain(200);
    const settled = await read(shop, order.id);
    expect(settled.parcel).toMatchObject({ settled: true, consignmentId: '888' });
    expect(timesMovedToProcessing(settled)).toBe(1);
    expect((await fees(shop.tenantId)).length).toBe(1);
    expect(await stockOf(shop, lamp.id)).toEqual(['4.000', '0.000']);
    await expectLedgerAgrees(admin, shop.tenantId);
  });
});
