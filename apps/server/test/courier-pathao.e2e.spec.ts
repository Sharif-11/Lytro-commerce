import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { DAY_MS } from '../src/common/time';
import type {
  ConnectionTroubleNotice,
  ParcelAttentionNotice,
  ParcelMovedNotice,
} from '../src/modules/couriers/ports/courier-notifier';
import { CourierBookingPass } from '../src/modules/couriers/services/courier-booking-pass';
import { CourierChecks } from '../src/modules/couriers/services/courier-checks';
import {
  COURIER_CLOCK,
  COURIER_FETCH,
  COURIER_NOTIFIER,
  COURIER_PAUSE,
} from '../src/modules/couriers/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { CourierBookingTickWorker } from '../src/modules/shared/queue-workers/services/courier-booking-tick-worker';
import { CourierNightTickWorker } from '../src/modules/shared/queue-workers/services/courier-night-tick-worker';
import { SecretBox, SecretPurpose } from '../src/modules/shared/secrets/secret-box';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import {
  FakePathao,
  PATHAO_CLIENT_SECRET,
  PATHAO_FIELDS,
  PATHAO_PASSWORD,
  PATHAO_USERNAME,
} from './support/fake-pathao';
import { postJson, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 6 Slice 6.3, read agreed 2026-11-05: Pathao, through the real routes and database with a fake built from what its sandbox answered
// on the same day: connecting without keeping the password, a one-use login, one store, whole taka, its test of an address, and its news
// taking the same path as Steadfast's. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_courier_pathao_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 40_000 });

const ANSWER_VALUE = 'the-value-its-page-gives';
const NEARLY_ENDED = 89.5 * DAY_MS;

let app: INestApplication;
let port: number;
let admin: pg.Client;
let clockShift = 0;
const pathao = new FakePathao();
const texts = new SmsCapture();
const attention: ParcelAttentionNotice[] = [];
const moved: ParcelMovedNotice[] = [];
const trouble: ConnectionTroubleNotice[] = [];

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'courier-pathao-e2e-otp-secret-012345678901234';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['PATHAO_WEBHOOK_INTEGRATION_SECRET'] = ANSWER_VALUE;
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(COURIER_FETCH)
    .useValue(pathao.fetch)
    .overrideProvider(COURIER_CLOCK)
    .useValue(() => new Date(Date.now() + clockShift))
    .overrideProvider(COURIER_PAUSE)
    .useValue(() => Promise.resolve())
    .overrideProvider(COURIER_NOTIFIER)
    .useValue({
      parcelNeedsAttention: (notice: ParcelAttentionNotice) => {
        attention.push(notice);
        return Promise.resolve();
      },
      parcelMoved: (notice: ParcelMovedNotice) => {
        moved.push(notice);
        return Promise.resolve();
      },
      connectionTrouble: (notice: ConnectionTroubleNotice) => {
        trouble.push(notice);
        return Promise.resolve();
      },
    })
    .overrideProvider(CourierBookingTickWorker)
    .useValue({})
    .overrideProvider(CourierNightTickWorker)
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
  pathao.reset();
  attention.length = 0;
  moved.length = 0;
  trouble.length = 0;
  if (!ADMIN_URL) return;
  // The night check goes through every shop, so what an earlier test left on its way is finished for it first.
  await admin.query(
    'UPDATE tenant.courier_parcels SET checks_stopped_at = now() WHERE checks_stopped_at IS NULL',
  );
  await admin.query('UPDATE tenant.courier_events SET applied_at = now() WHERE applied_at IS NULL');
});

interface Parcel {
  state: string;
  consignmentId: string | null;
  courierStatus: string | null;
  reading: string | null;
  cod: string;
  cashCollected: string | null;
  attention: string | null;
  deliveryCharge: string | null;
  paidAt: string | null;
  payoutId: string | null;
  news: { source: string; rawStatus: string | null }[];
}

interface Order {
  id: string;
  orderNumber: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  due: string;
  grandTotal: string;
  parcel: Parcel | null;
  payments: { amount: string; method: string }[];
}

interface Connected {
  shop: ShopClient;
  address: string;
  token: string;
}

function freshMobile(): string {
  return `017${String(randomInt(10_000_000, 99_999_999))}`;
}

let mirpurId: number | null = null;
async function mirpur(shop: ShopClient): Promise<number> {
  if (mirpurId !== null) return mirpurId;
  const { zillas } = (await shop.get('/locations')).body as {
    zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
  };
  const found = zillas
    .find((row) => row.nameEn === 'Dhaka')
    ?.thanas.find((row) => row.nameEn === 'Mirpur');
  if (!found) throw new Error('no thana Dhaka/Mirpur');
  mirpurId = found.id;
  return found.id;
}

async function product(
  shop: ShopClient,
  price = 300,
  weightKg?: number,
): Promise<{ id: string; variantId: string }> {
  const made = await shop.post('/products', {
    name: 'Lamp',
    basePrice: price,
    ...(weightKg !== undefined ? { weightKg } : {}),
    variants: [{ optionIds: [], openingStock: 50 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const body = made.body as { id: string; variants: { id: string }[] };
  return { id: body.id, variantId: body.variants[0]?.id ?? '' };
}

async function place(shop: ShopClient, variantId: string, quantity = 1): Promise<Order> {
  const made = await postJson(
    port,
    '/orders',
    {
      customerName: 'Rahima Akter',
      phone: freshMobile(),
      locationId: await mirpur(shop),
      deliveryAddress: 'House 12, Road 3',
      items: [{ variantId, quantity }],
    },
    shop.headers({ 'idempotency-key': randomUUID() }),
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as Order;
}

function pathOf(address: string): string {
  const { pathname } = new URL(address);
  expect(pathname.startsWith('/api/v1/webhooks/couriers/')).toBe(true);
  return pathname.replace('/api/v1', '');
}

async function connect(shop: ShopClient): Promise<Connected> {
  const made = await shop.post('/couriers/connections', {
    courierKey: 'pathao',
    credentials: PATHAO_FIELDS,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  const { message } = made.body as { message: { address: string; token: string } };
  pathao.calls.length = 0;
  return { shop, address: pathOf(message.address), token: message.token };
}

async function connectedShop(): Promise<Connected> {
  const shop = await openShop(port, texts, 'cpa');
  await seedBalance(admin, shop.tenantId, '500.00');
  return connect(shop);
}

function bookIt(shop: ShopClient, order: { id: string }, weightKg = 1): Promise<HttpResult> {
  return shop.post(`/orders/${order.id}/book`, { weightKg });
}

async function booked(shop: ShopClient, order: { id: string }): Promise<Order> {
  const answered = await bookIt(shop, order);
  expect(answered.status, JSON.stringify(answered.body)).toBe(200);
  pathao.calls.length = 0;
  return answered.body as Order;
}

async function read(shop: ShopClient, orderId: string): Promise<Order> {
  return (await shop.get(`/orders/${orderId}`)).body as Order;
}

async function connection(shop: ShopClient): Promise<{
  state: string;
  messages: string;
  pickupStore: { id: string; name: string } | null;
}> {
  const { connections } = (await shop.get('/couriers/connections')).body as {
    connections: { state: string; messages: string; pickupStore: null }[];
  };
  const [only] = connections;
  if (!only) throw new Error('no connection');
  return only;
}

/** What is really kept, opened the way the server opens it. */
async function kept(tenantId: string): Promise<Record<string, string>> {
  const { rows } = await admin.query<{ credentials: Buffer }>(
    "SELECT credentials FROM tenant.courier_connections WHERE tenant_id = $1 AND courier_key = 'pathao'",
    [tenantId],
  );
  const [row] = rows;
  if (!row) throw new Error('nothing kept');
  return JSON.parse(
    app.get(SecretBox).open(row.credentials, SecretPurpose.CourierCredentials, tenantId),
  ) as Record<string, string>;
}

function postMessage(
  to: Connected,
  body: Record<string, unknown>,
  headers: Record<string, string> = { 'x-pathao-signature': to.token },
): Promise<HttpResult> {
  return postJson(port, to.address, body, { host: 'localhost', ...headers });
}

let tick = 0;
function messageOf(order: Order, event: string, extra: Record<string, unknown> = {}) {
  tick += 1;
  return {
    consignment_id: order.parcel?.consignmentId,
    merchant_order_id: order.orderNumber,
    updated_at: new Date(Date.UTC(2026, 10, 6, 0, 0, tick)).toISOString(),
    store_id: 2,
    event,
    delivery_fee: 60,
    ...extra,
  };
}

async function applied(tenantId: string): Promise<void> {
  await vi.waitFor(
    async () => {
      const { rows } = await admin.query(
        'SELECT 1 FROM tenant.courier_events WHERE tenant_id = $1 AND applied_at IS NULL',
        [tenantId],
      );
      expect(rows).toHaveLength(0);
    },
    { timeout: 10_000, interval: 50 },
  );
}

async function send(
  to: Connected,
  order: Order,
  event: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const answered = await postMessage(to, messageOf(order, event, extra));
  expect(answered.status, JSON.stringify(answered.body)).toBe(202);
  await applied(to.shop.tenantId);
}

describeIfDatabase('connecting Pathao (Slice 6.3, read agreed 2026-11-05)', () => {
  it('offers Pathao, saying what it needs', async () => {
    const shop = await openShop(port, texts, 'cpa');
    const { adapters } = (await shop.get('/couriers/adapters')).body as {
      adapters: Record<string, unknown>[];
    };
    expect(adapters.find((each) => each['key'] === 'pathao')).toEqual({
      key: 'pathao',
      name: 'Pathao',
      credentialFields: ['clientId', 'clientSecret', 'username', 'password'],
      needsArea: false,
      needsThana: true,
      hasStores: true,
      takesWeight: true,
      canCancel: false,
      retiring: false,
    });
    expect(adapters.find((each) => each['key'] === 'steadfast')).toMatchObject({
      needsThana: false,
      hasStores: false,
    });
  });

  it('logs in once and keeps the tokens, never the password or the email', async () => {
    const shop = await openShop(port, texts, 'cpa');
    await connect(shop);
    const what = await kept(shop.tenantId);
    expect(Object.keys(what).sort()).toEqual([
      'accessToken',
      'clientId',
      'clientSecret',
      'expiresAt',
      'refreshToken',
      'storeId',
      'storeName',
    ]);
    expect(JSON.stringify(what)).not.toContain(PATHAO_PASSWORD);
    expect(JSON.stringify(what)).not.toContain(PATHAO_USERNAME);
    const listed = await shop.get('/couriers/connections');
    expect(JSON.stringify(listed.body)).not.toContain(PATHAO_CLIENT_SECRET);
    expect(JSON.stringify(listed.body)).not.toContain(what['accessToken']);
  });

  it('saves nothing for a wrong login, and says so in Pathao’s words', async () => {
    const shop = await openShop(port, texts, 'cpa');
    const refused = await shop.post('/couriers/connections', {
      courierKey: 'pathao',
      credentials: { ...PATHAO_FIELDS, password: 'wrong' },
    });
    expect(refused.status).toBe(409);
    expect(errorOf(refused).message).toContain('The user credentials were incorrect');
    const listed = (await shop.get('/couriers/connections')).body as { connections: unknown[] };
    expect(listed.connections).toHaveLength(0);
  });

  it('asks for the password again to reconnect, and keeps the client ID and the store', async () => {
    const to = await connectedShop();
    const { clientId, clientSecret, username } = PATHAO_FIELDS;
    const noPassword = await to.shop.post('/couriers/connections', {
      courierKey: 'pathao',
      credentials: { clientId, clientSecret, username },
    });
    expect(noPassword.status).toBe(400);
    expect(fieldsOf(noPassword)).toHaveProperty(['credentials.password']);

    pathao.stores.push({
      store_id: 7,
      store_name: 'Uttara',
      store_address: 'Uttara, Dhaka',
      is_active: 1,
    });
    expect((await to.shop.put('/couriers/connections/pathao/store', { storeId: '7' })).status).toBe(
      200,
    );
    const again = await to.shop.post('/couriers/connections', {
      courierKey: 'pathao',
      credentials: {
        clientId: '',
        clientSecret: '',
        username: PATHAO_USERNAME,
        password: PATHAO_PASSWORD,
      },
    });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect((again.body as { pickupStore: unknown }).pickupStore).toEqual({
      id: '7',
      name: 'Uttara',
    });
  });

  it('uses the one active store by itself', async () => {
    const shop = await openShop(port, texts, 'cpa');
    pathao.stores.push({
      store_id: 9,
      store_name: 'Closed',
      store_address: 'Agrabad',
      is_active: 0,
    });
    await connect(shop);
    expect((await connection(shop)).pickupStore).toEqual({ id: '2', name: 'Mirpur warehouse' });
  });

  it('leaves the choice to the owner when there are several, and books only once one is chosen', async () => {
    const shop = await openShop(port, texts, 'cpa');
    await seedBalance(admin, shop.tenantId, '500.00');
    pathao.stores.push({
      store_id: 7,
      store_name: 'Uttara',
      store_address: 'Uttara, Dhaka',
      is_active: 1,
    });
    pathao.stores.push({
      store_id: 9,
      store_name: 'Closed',
      store_address: 'Agrabad',
      is_active: 0,
    });
    await connect(shop);
    expect((await connection(shop)).pickupStore).toBeNull();

    const { variantId } = await product(shop);
    const order = await place(shop, variantId);
    const noStore = await bookIt(shop, order);
    expect(noStore.status).toBe(409);
    expect(errorOf(noStore).message).toContain('স্টোর');
    expect(pathao.bookings()).toHaveLength(0);
    expect((await read(shop, order.id)).parcel).toBeNull();

    const listed = await shop.get('/couriers/connections/pathao/stores');
    expect(listed.body).toEqual({
      stores: [
        { id: '2', name: 'Mirpur warehouse', address: 'House 1, Mirpur, Dhaka', active: true },
        { id: '7', name: 'Uttara', address: 'Uttara, Dhaka', active: true },
        { id: '9', name: 'Closed', address: 'Agrabad', active: false },
      ],
      chosenId: null,
    });
    expect((await shop.put('/couriers/connections/pathao/store', { storeId: '9' })).status).toBe(
      409,
    );
    expect((await shop.put('/couriers/connections/pathao/store', { storeId: '55' })).status).toBe(
      409,
    );
    const chosen = await shop.put('/couriers/connections/pathao/store', { storeId: '7' });
    expect(chosen.status, JSON.stringify(chosen.body)).toBe(200);
    expect((chosen.body as { pickupStore: unknown }).pickupStore).toEqual({
      id: '7',
      name: 'Uttara',
    });
    const { rows } = await admin.query(
      "SELECT 1 FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'courier_pickup_store_changed'",
      [shop.tenantId],
    );
    expect(rows).toHaveLength(1);

    await booked(shop, order);
    const sent = pathao.parcels.at(-1);
    expect(sent?.body['store_id']).toBe(7);
  });

  it('says a courier with no stores has none to list', async () => {
    const shop = await openShop(port, texts, 'cpa');
    expect((await shop.get('/couriers/connections/steadfast/stores')).status).toBe(404);
  });
});

describeIfDatabase('booking with Pathao (D6-5, D6-14, read agreed 2026-11-05)', () => {
  it('sends the address with its thana and district, and records Pathao’s charge', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, variantId, 3));
    expect(order.parcel).toMatchObject({
      state: 'booked',
      courierStatus: 'pending',
      deliveryCharge: '60.00',
    });
    expect(pathao.parcels.at(-1)?.body).toMatchObject({
      recipient_address: 'House 12, Road 3, Mirpur, Dhaka',
      item_quantity: 3,
      store_id: 2,
      merchant_order_id: order.orderNumber,
    });
    expect(pathao.parcels.at(-1)?.body).not.toHaveProperty('recipient_city');
  });

  it('refuses an order whose thana isn’t in the list, sending nothing and setting nothing aside', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop);
    const order = await place(to.shop, variantId);
    await admin.query('UPDATE tenant.orders SET location_id = 999999 WHERE id = $1', [order.id]);
    const refused = await bookIt(to.shop, order);
    expect(refused.status).toBe(409);
    expect(errorOf(refused).message).toContain('থানা');
    expect(pathao.bookings()).toHaveLength(0);
    expect((await read(to.shop, order.id)).parcel).toBeNull();
  });

  it('asks the next whole taka, and the order keeps its exact amount', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop, 299.5);
    const placed = await place(to.shop, variantId);
    expect(Number(placed.due) % 1).toBeCloseTo(0.5);
    const order = await booked(to.shop, placed);
    const askedFor = Math.ceil(Number(placed.due));
    expect(pathao.parcels.at(-1)?.body['amount_to_collect']).toBe(askedFor);
    expect(Number(order.parcel?.cod)).toBe(askedFor);
    expect(order.due).toBe(placed.due);
  });

  it('counts an order paid in full when the whole taka asked for arrives, telling nobody', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop, 299.5);
    const placed = await place(to.shop, variantId);
    const order = await booked(to.shop, placed);
    await send(to, order, 'order.delivered', { collected_amount: Math.ceil(Number(placed.due)) });
    const done = await read(to.shop, order.id);
    expect(done.fulfillmentStatus).toBe('delivered');
    expect(done.paymentStatus).toBe('paid');
    expect(Number(done.due)).toBe(0);
    expect(done.payments.map((each) => each.amount)).toEqual([placed.due]);
    expect(done.parcel?.attention).toBeNull();
    expect(attention).toHaveLength(0);
  });

  it('still tells staff when less than it asked for arrives, and leaves the rest due', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop, 299.5);
    const placed = await place(to.shop, variantId);
    const order = await booked(to.shop, placed);
    await send(to, order, 'order.delivered', { collected_amount: Number(placed.due) - 50.5 });
    const done = await read(to.shop, order.id);
    expect(Number(done.due)).toBeCloseTo(50.5);
    expect(done.parcel?.attention).toBe('cash_differs');
    expect(attention).toHaveLength(1);
  });

  it('still tells staff when more than the next taka arrives', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop, 299.5);
    const placed = await place(to.shop, variantId);
    const order = await booked(to.shop, placed);
    await send(to, order, 'order.delivered', {
      collected_amount: Math.ceil(Number(placed.due)) + 100,
    });
    const done = await read(to.shop, order.id);
    expect(done.parcel?.attention).toBe('cash_differs');
    expect(done.payments.map((each) => each.amount)).toEqual([placed.due]);
  });

  it('still tells staff when the cash falls between what is due and what it asked for', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop, 299.5);
    const placed = await place(to.shop, variantId);
    const order = await booked(to.shop, placed);
    await send(to, order, 'order.delivered', { collected_amount: Number(placed.due) + 0.25 });
    const done = await read(to.shop, order.id);
    expect(done.parcel?.attention).toBe('cash_differs');
    expect(done.payments.map((each) => each.amount)).toEqual([placed.due]);
  });

  it('still tells staff when a payment since booking leaves it collecting well over what is due', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop);
    const placed = await place(to.shop, variantId);
    const order = await booked(to.shop, placed);
    const paid = await to.shop.post(`/orders/${order.id}/payments`, {
      method: 'bkash',
      amount: 100,
      senderNumber: freshMobile(),
      transactionId: `TRX${String(randomInt(10_000_000, 99_999_999))}`,
    });
    expect(paid.status, JSON.stringify(paid.body)).toBe(201);
    await send(to, order, 'order.delivered', { collected_amount: Number(placed.due) });
    const done = await read(to.shop, order.id);
    expect(done.parcel?.attention).toBe('cash_differs');
    expect(Number(done.due)).toBe(0);
  });

  it('uses what the items weigh, and asks staff when one has no weight', async () => {
    const to = await connectedShop();
    const weighed = await product(to.shop, 300, 2);
    const order = await place(to.shop, weighed.variantId, 2);
    const answered = await to.shop.post(`/orders/${order.id}/book`, {});
    expect(answered.status, JSON.stringify(answered.body)).toBe(200);
    expect(pathao.parcels.at(-1)?.body['item_weight']).toBe(4);

    const { variantId } = await product(to.shop);
    const noWeight = await place(to.shop, variantId);
    pathao.calls.length = 0;
    const refused = await to.shop.post(`/orders/${noWeight.id}/book`, {});
    expect(refused.status).toBe(409);
    expect(errorOf(refused).message).toContain('ওজন');
    expect(pathao.bookings()).toHaveLength(0);
  });

  it('raises a light parcel to half a kilo, and refuses one over ten', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop);
    await booked(to.shop, await place(to.shop, variantId));
    const light = await place(to.shop, variantId);
    expect((await bookIt(to.shop, light, 0.2)).status).toBe(200);
    expect(pathao.parcels.at(-1)?.body['item_weight']).toBe(0.5);

    const heavy = await place(to.shop, variantId);
    pathao.calls.length = 0;
    const refused = await bookIt(to.shop, heavy, 11);
    expect(refused.status).toBe(409);
    expect(errorOf(refused).details).toMatchObject({ limit: 10 });
    expect(pathao.bookings()).toHaveLength(0);
  });

  it('leaves a lost answer for staff, as it can’t be asked by our number', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop);
    const order = await place(to.shop, variantId);
    pathao.behaviour = { bookingTimesOut: { madeIt: true } };
    const lost = await bookIt(to.shop, order);
    expect(lost.status).toBe(503);
    pathao.behaviour = {};
    pathao.calls.length = 0;
    clockShift = 10 * 60 * 1000;
    await app.get(CourierBookingPass).runTick();
    expect((await read(to.shop, order.id)).parcel?.state).toBe('unknown');
    expect(pathao.calls).toHaveLength(0);

    const settled = await to.shop.post(`/orders/${order.id}/parcel/settle`, {
      outcome: 'booked',
      consignmentId: pathao.parcels.at(-1)?.consignmentId,
    });
    expect(settled.status, JSON.stringify(settled.body)).toBe(200);
    expect((settled.body as Order).parcel?.state).toBe('booked');
  });

  it('lets its own message settle a lost answer, by our number', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop);
    const order = await place(to.shop, variantId);
    pathao.behaviour = { bookingTimesOut: { madeIt: true } };
    expect((await bookIt(to.shop, order)).status).toBe(503);
    pathao.behaviour = {};
    const consignment = pathao.parcels.at(-1)?.consignmentId;
    await send(to, order, 'order.pickup-requested', { consignment_id: consignment });
    const found = await read(to.shop, order.id);
    expect(found.parcel).toMatchObject({ state: 'booked', consignmentId: consignment });
  });

  it('asks staff to confirm a cancel, since it has no cancel call', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, variantId));
    const unconfirmed = await to.shop.post(`/orders/${order.id}/parcel/cancel`, {});
    expect(unconfirmed.status).toBe(409);
    const confirmed = await to.shop.post(`/orders/${order.id}/parcel/cancel`, {
      courierCancelled: true,
    });
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
    expect(pathao.calls).toHaveLength(0);
  });
});

describeIfDatabase('renewing Pathao’s login (read agreed 2026-11-05)', () => {
  it('leaves a token with time left alone', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop);
    await booked(to.shop, await place(to.shop, variantId));
    expect(pathao.refreshes()).toHaveLength(0);
  });

  it('renews one nearly ended before booking, and keeps the new pair', async () => {
    const to = await connectedShop();
    const before = await kept(to.shop.tenantId);
    const { variantId } = await product(to.shop);
    const order = await place(to.shop, variantId);
    clockShift = NEARLY_ENDED;
    const answered = await bookIt(to.shop, order);
    expect(answered.status, JSON.stringify(answered.body)).toBe(200);
    expect(pathao.refreshes()).toHaveLength(1);
    expect(pathao.refreshes()[0]?.body).toMatchObject({ refresh_token: before['refreshToken'] });
    expect(pathao.refreshes()[0]?.body).not.toHaveProperty('password');
    const after = await kept(to.shop.tenantId);
    expect(after['refreshToken']).not.toBe(before['refreshToken']);
    expect(pathao.bookings().at(-1)?.bearer).toBe(after['accessToken']);
    expect(after['storeId']).toBe('2');
  });

  it('renews once when two bookings need it together, and both go through', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop);
    const first = await place(to.shop, variantId);
    const second = await place(to.shop, variantId);
    clockShift = NEARLY_ENDED;
    pathao.behaviour = {
      whileRefreshing: async () => {
        await wait(200);
      },
    };
    const answers = await Promise.all([bookIt(to.shop, first), bookIt(to.shop, second)]);
    expect(answers.map((each) => each.status)).toEqual([200, 200]);
    expect(pathao.refreshes()).toHaveLength(1);
    expect((await connection(to.shop)).state).toBe('active');
  });

  it('stops and tells the owner when Pathao refuses, booking nothing, until they log in again', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop);
    const order = await place(to.shop, variantId);
    pathao.reset(); // Its tokens are gone, say because the merchant changed something in the panel.
    clockShift = NEARLY_ENDED;
    const refused = await bookIt(to.shop, order);
    expect(refused.status).toBe(409);
    expect(errorOf(refused).message).toContain('লগইন');
    expect(pathao.bookings()).toHaveLength(0);
    expect((await read(to.shop, order.id)).parcel).toBeNull();
    expect(trouble).toEqual([
      { tenantId: to.shop.tenantId, courierKey: 'pathao', trouble: 'login_refused' },
    ]);
    expect((await connection(to.shop)).state).toBe('login_refused');

    pathao.calls.length = 0;
    expect((await bookIt(to.shop, order)).status).toBe(409);
    expect(pathao.calls).toHaveLength(0);
    expect(trouble).toHaveLength(1);

    await connect(to.shop);
    expect((await connection(to.shop)).state).toBe('active');
    expect((await bookIt(to.shop, order)).status).toBe(200);
  });

  it('tells the owner once when two bookings find the login refused together', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop);
    const first = await place(to.shop, variantId);
    const second = await place(to.shop, variantId);
    pathao.reset();
    clockShift = NEARLY_ENDED;
    pathao.behaviour = {
      whileRefreshing: async () => {
        await wait(200);
      },
    };
    const answers = await Promise.all([bookIt(to.shop, first), bookIt(to.shop, second)]);
    expect(answers.map((each) => each.status)).toEqual([409, 409]);
    expect(pathao.refreshes()).toHaveLength(1);
    expect(trouble).toHaveLength(1);
  });

  it('sets nothing aside when a renewal gets no answer, and tries again next time if the old pair still works', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop);
    const order = await place(to.shop, variantId);
    clockShift = NEARLY_ENDED;
    pathao.behaviour = { refreshTimesOut: { used: false } };
    const lost = await bookIt(to.shop, order);
    expect(lost.status).toBe(503);
    expect((await read(to.shop, order.id)).parcel).toBeNull();
    expect(pathao.bookings()).toHaveLength(0);
    expect((await connection(to.shop)).state).toBe('active');

    pathao.behaviour = {};
    expect((await bookIt(to.shop, order)).status).toBe(200);
  });

  it('asks the owner to log in when a lost renewal did end the old pair', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop);
    const order = await place(to.shop, variantId);
    clockShift = NEARLY_ENDED;
    pathao.behaviour = { refreshTimesOut: { used: true } };
    expect((await bookIt(to.shop, order)).status).toBe(503);
    pathao.behaviour = {};
    const refused = await bookIt(to.shop, order);
    expect(refused.status).toBe(409);
    expect(errorOf(refused).message).toContain('লগইন');
    expect(trouble).toHaveLength(1);
  });

  it('renews before Sync', async () => {
    const to = await connectedShop();
    const { variantId } = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, variantId));
    clockShift = NEARLY_ENDED;
    const synced = await to.shop.post(`/orders/${order.id}/parcel/sync`, {});
    expect(synced.status, JSON.stringify(synced.body)).toBe(200);
    expect(pathao.refreshes()).toHaveLength(1);
    expect(pathao.statusCalls()).toHaveLength(1);
    expect(pathao.statusCalls()[0]?.bearer).toBe((await kept(to.shop.tenantId))['accessToken']);
  });

  it('renews before the night check, once however many parcels it asks after', async () => {
    // Shorter than the sandbox's 90 days, as its document says a token may be, so the parcels are still young enough to ask after.
    pathao.lastsSeconds = 2.5 * 24 * 60 * 60;
    const to = await connectedShop();
    const { variantId } = await product(to.shop);
    await booked(to.shop, await place(to.shop, variantId));
    await booked(to.shop, await place(to.shop, variantId));
    clockShift = 2 * DAY_MS;
    await app.get(CourierChecks).runNight();
    expect(pathao.refreshes()).toHaveLength(1);
    expect(pathao.statusCalls()).toHaveLength(2);
    const { accessToken } = await kept(to.shop.tenantId);
    expect(pathao.statusCalls().every((call) => call.bearer === accessToken)).toBe(true);
  });

  it('makes no calls that night for a login that has ended, and goes on to other shops', async () => {
    const dead = await connectedShop();
    const first = await product(dead.shop);
    const deadOrder = await booked(dead.shop, await place(dead.shop, first.variantId));
    await admin.query(
      "UPDATE tenant.courier_connections SET state = 'login_refused' WHERE tenant_id = $1",
      [dead.shop.tenantId],
    );
    const live = await connectedShop();
    const second = await product(live.shop);
    const liveOrder = await booked(live.shop, await place(live.shop, second.variantId));
    clockShift = 2 * DAY_MS;
    await app.get(CourierChecks).runNight();
    const asked = pathao.statusCalls().map((call) => call.path);
    expect(asked).toContain(`/orders/${liveOrder.parcel?.consignmentId ?? ''}/info`);
    expect(asked).not.toContain(`/orders/${deadOrder.parcel?.consignmentId ?? ''}/info`);
  });
});

describeIfDatabase(
  'Pathao’s messages (CRR-11 to CRR-13, CRR-27, CRR-29, read agreed 2026-11-05)',
  () => {
    it('answers its test of an address with what it asks for, with or without the secret', async () => {
      const to = await connectedShop();
      const answered = await postJson(
        port,
        to.address,
        { event: 'webhook_integration' },
        { host: 'localhost' },
      );
      expect(answered.status).toBe(202);
      expect(answered.headers['x-pathao-merchant-webhook-integration-secret']).toBe(ANSWER_VALUE);
    });

    it('doesn’t count that test as a message arriving, or let it clear a missing token', async () => {
      const to = await connectedShop();
      const test = { event: 'webhook_integration' };
      await postJson(port, to.address, test, { host: 'localhost' });
      expect((await connection(to.shop)).messages).toBe('none_yet');

      expect((await postMessage(to, { event: 'order.picked' }, {})).status).toBe(401);
      expect((await connection(to.shop)).messages).toBe('token_missing');
      await postJson(port, to.address, test, { host: 'localhost' });
      expect((await connection(to.shop)).messages).toBe('token_missing');
    });

    it('answers nothing at an address it doesn’t know, test or not', async () => {
      const answered = await postJson(
        port,
        '/webhooks/couriers/not-a-real-address',
        { event: 'webhook_integration' },
        { host: 'localhost' },
      );
      expect(answered.status).toBe(404);
      expect(answered.headers['x-pathao-merchant-webhook-integration-secret']).toBeUndefined();
    });

    it('refuses a message without the secret, or with another, moving nothing', async () => {
      const to = await connectedShop();
      const { variantId } = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, variantId));
      const body = messageOf(order, 'order.delivered', { collected_amount: 300 });
      expect((await postMessage(to, body, {})).status).toBe(401);
      expect((await postMessage(to, body, { 'x-pathao-signature': 'wrong' })).status).toBe(401);
      expect((await read(to.shop, order.id)).fulfillmentStatus).not.toBe('delivered');
      expect((await connection(to.shop)).messages).toBe('token_missing');
    });

    it('answers a real message with what it asks for, within its own proof', async () => {
      const to = await connectedShop();
      const { variantId } = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, variantId));
      const answered = await postMessage(to, messageOf(order, 'order.pickup-requested'));
      expect(answered.status).toBe(202);
      expect(answered.headers['x-pathao-merchant-webhook-integration-secret']).toBe(ANSWER_VALUE);
      await applied(to.shop.tenantId);
      expect((await connection(to.shop)).messages).toBe('arriving');
    });

    it('takes one message once, however many times it comes', async () => {
      const to = await connectedShop();
      const { variantId } = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, variantId));
      const body = messageOf(order, 'order.picked');
      await Promise.all([postMessage(to, body), postMessage(to, body), postMessage(to, body)]);
      await applied(to.shop.tenantId);
      const after = await read(to.shop, order.id);
      expect(after.parcel?.news.filter((each) => each.rawStatus === 'picked')).toHaveLength(1);
      expect(moved).toHaveLength(1);
    });

    it('moves an order only when Pathao has really picked it up', async () => {
      const to = await connectedShop();
      const { variantId } = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, variantId));
      await send(to, order, 'order.created');
      await send(to, order, 'order.pickup-requested');
      await send(to, order, 'order.assigned-for-pickup');
      let now = await read(to.shop, order.id);
      expect(now.fulfillmentStatus).toBe('processing');
      expect(now.parcel?.reading).toBe('booked');

      await send(to, order, 'order.picked');
      now = await read(to.shop, order.id);
      expect(now.fulfillmentStatus).toBe('shipped');
      expect(now.parcel?.reading).toBe('with_courier');
    });

    it('shows a failed delivery, a hold or a cancelled pickup and moves nothing', async () => {
      const to = await connectedShop();
      const { variantId } = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, variantId));
      await send(to, order, 'order.pickup-failed');
      expect((await read(to.shop, order.id)).parcel?.reading).toBe('hold');
      await send(to, order, 'order.pickup-cancelled');
      const after = await read(to.shop, order.id);
      expect(after.parcel?.reading).toBe('problem');
      expect(after.fulfillmentStatus).toBe('processing');
    });

    it('marks the parcel paid with its invoice and moves nothing else (CRR-12, CRR-17)', async () => {
      const to = await connectedShop();
      const { variantId } = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, variantId));
      const body = messageOf(order, 'order.paid', { invoice_id: 'INV-9' });
      expect((await postMessage(to, body)).status).toBe(202);
      await applied(to.shop.tenantId);
      const after = await read(to.shop, order.id);
      expect(after.parcel?.reading).not.toBe('delivered');
      expect(after.parcel?.courierStatus).toBe('pending');
      expect(after.parcel).toMatchObject({ paidAt: body.updated_at, payoutId: 'INV-9' });
      // Being paid goes to the payout records, not the parcel's journey.
      expect(after.parcel?.news).toEqual([]);
      // The first word of it stands.
      await send(to, order, 'order.paid', { invoice_id: 'INV-10' });
      expect((await read(to.shop, order.id)).parcel).toMatchObject({ payoutId: 'INV-9' });
    });

    it('records a partly delivered parcel with the cash it says, and stock waits for staff', async () => {
      const to = await connectedShop();
      const { variantId } = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, variantId, 2));
      await send(to, order, 'order.partial-delivery', { collected_amount: 300 });
      const after = await read(to.shop, order.id);
      expect(after.fulfillmentStatus).toBe('partially_delivered');
      expect(after.payments.map((each) => each.amount)).toEqual(['300.00']);
      expect(after.parcel?.cashCollected).toBe('300.00');
    });

    it('takes a message about a parcel coming back and stops asking after it', async () => {
      const to = await connectedShop();
      const { variantId } = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, variantId));
      await send(to, order, 'order.returned');
      expect((await read(to.shop, order.id)).parcel?.reading).toBe('returning');
      clockShift = 2 * DAY_MS;
      pathao.calls.length = 0;
      await app.get(CourierChecks).runNight();
      expect(pathao.statusCalls().map((call) => call.path)).not.toContain(
        `/orders/${order.parcel?.consignmentId ?? ''}/info`,
      );
    });

    it('runs the whole way by message: booked, picked up, delivered, paid', async () => {
      const to = await connectedShop();
      const { variantId } = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, variantId));
      for (const event of ['order.picked', 'order.in-transit', 'order.assigned-for-delivery']) {
        await send(to, order, event);
      }
      await send(to, order, 'order.delivered', { collected_amount: Number(order.due) });
      const done = await read(to.shop, order.id);
      expect(done.fulfillmentStatus).toBe('delivered');
      expect(done.paymentStatus).toBe('paid');
      expect(done.parcel?.reading).toBe('delivered');
      expect(moved.map((each) => each.reading)).toEqual(['with_courier', 'delivered']);
    });

    it('runs the whole way by the night check alone, recording what’s due', async () => {
      const to = await connectedShop();
      const { variantId } = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, variantId));
      const consignment = order.parcel?.consignmentId ?? '';
      clockShift = 2 * DAY_MS;
      pathao.statuses.set(consignment, 'Picked');
      await app.get(CourierChecks).runNight();
      expect((await read(to.shop, order.id)).fulfillmentStatus).toBe('shipped');

      clockShift = 4 * DAY_MS;
      pathao.statuses.set(consignment, 'Delivered');
      await app.get(CourierChecks).runNight();
      const done = await read(to.shop, order.id);
      expect(done.fulfillmentStatus).toBe('delivered');
      expect(done.paymentStatus).toBe('paid');
    });

    it('runs the whole way by Sync', async () => {
      const to = await connectedShop();
      const { variantId } = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, variantId));
      const consignment = order.parcel?.consignmentId ?? '';
      pathao.statuses.set(consignment, 'In_Transit');
      await to.shop.post(`/orders/${order.id}/parcel/sync`, {});
      expect((await read(to.shop, order.id)).fulfillmentStatus).toBe('shipped');
      clockShift = DAY_MS;
      pathao.statuses.set(consignment, 'Delivered');
      await to.shop.post(`/orders/${order.id}/parcel/sync`, {});
      expect((await read(to.shop, order.id)).fulfillmentStatus).toBe('delivered');
    });

    it('marks a login Pathao refuses during a check, and tells the owner', async () => {
      const to = await connectedShop();
      const { variantId } = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, variantId));
      pathao.behaviour = { tokensRevoked: true };
      const synced = await to.shop.post(`/orders/${order.id}/parcel/sync`, {});
      expect(synced.status).toBe(409);
      expect((await connection(to.shop)).state).toBe('login_refused');
      expect(trouble).toEqual([
        { tenantId: to.shop.tenantId, courierKey: 'pathao', trouble: 'login_refused' },
      ]);

      // Its token still has time left by its date, and it still isn't asked again until the owner logs in.
      pathao.calls.length = 0;
      const another = await place(to.shop, variantId);
      const refused = await bookIt(to.shop, another);
      expect(refused.status).toBe(409);
      expect(errorOf(refused).message).toContain('লগইন');
      expect(pathao.calls).toHaveLength(0);
    });
  },
);
