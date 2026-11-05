import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../src/common/time';
import type {
  ConnectionTroubleNotice,
  ParcelAttentionNotice,
  ParcelMovedNotice,
} from '../src/modules/couriers/ports/courier-notifier';
import { CourierBookingPass } from '../src/modules/couriers/services/courier-booking-pass';
import { CourierChecks } from '../src/modules/couriers/services/courier-checks';
import { CourierConnections } from '../src/modules/couriers/services/courier-connections';
import { CourierMessages } from '../src/modules/couriers/services/courier-messages';
import { CourierNewsPath } from '../src/modules/couriers/services/courier-news-path';
import {
  COURIER_CLOCK,
  COURIER_FETCH,
  COURIER_NOTIFIER,
  COURIER_PAUSE,
} from '../src/modules/couriers/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { CourierBookingTickWorker } from '../src/modules/shared/queue-workers/services/courier-booking-tick-worker';
import { CourierNightTickWorker } from '../src/modules/shared/queue-workers/services/courier-night-tick-worker';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import {
  FakeSteadfast,
  RIGHT_API_KEY,
  RIGHT_SECRET_KEY,
  signatureOf,
} from './support/fake-steadfast';
import { getJson, postJson, sendExact, type HttpResult } from './support/http';
import { openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';
import { expectLedgerAgrees } from './support/stock-ledger';

// Phase 6 Slice 6.2, read agreed 2026-11-05: the courier's news. Steadfast's messages, the night check and Sync all end in one path that
// moves an order only on what the courier stands behind (CRR-11 to CRR-15, CRR-27, CRR-29, ORD-42, ORD-43, D6-3, D6-4, D6-6, D6-12), and the
// plan's exit criteria 2, 4, 5 and 7 for Steadfast. A fake stands in, as it has no sandbox. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_courier_news_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 40_000 });

let app: INestApplication;
let port: number;
let admin: pg.Client;
let clockShift = 0;
const steadfast = new FakeSteadfast();
const texts = new SmsCapture();
const attention: ParcelAttentionNotice[] = [];
const moved: ParcelMovedNotice[] = [];
const trouble: ConnectionTroubleNotice[] = [];

const KEYS = { apiKey: RIGHT_API_KEY, secretKey: RIGHT_SECRET_KEY };
const AT = '2026-11-05 10:00:00';
const SITE = 'https://myshop.com';

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'courier-news-e2e-otp-secret-0123456789012345';
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
  steadfast.reset();
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
  cashCollected: string | null;
  codAtCourier: string | null;
  noNews: boolean;
  attention: string | null;
  deliveryCharge: string | null;
  news: { source: string; rawStatus: string | null; message: { en: string | null } }[];
}

interface Order {
  id: string;
  orderNumber: string;
  trackingId: string;
  status: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  due: string;
  grandTotal: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  items: { id: string; quantity: string }[];
  parcel: Parcel | null;
  payments: { amount: string; method: string }[];
  history: { field: string; to: string | null; note: string | null }[];
}

interface Connected {
  shop: ShopClient;
  address: string;
  token: string;
}

/** Where a message goes, as the test's helpers want it: they add the /api/v1 the real address has. */
function pathOf(address: string): string {
  const { pathname } = new URL(address);
  expect(pathname.startsWith('/api/v1/webhooks/couriers/')).toBe(true);
  return pathname.replace('/api/v1', '');
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
  stock = 20,
): Promise<{ id: string; variantId: string }> {
  const made = await shop.post('/products', {
    name: 'Lamp',
    basePrice: price,
    variants: [{ optionIds: [], openingStock: stock }],
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

async function connect(shop: ShopClient): Promise<Connected> {
  const made = await shop.post('/couriers/connections', {
    courierKey: 'steadfast',
    credentials: KEYS,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  const { message } = made.body as { message: { address: string; token: string } };
  steadfast.calls.length = 0;
  return { shop, address: pathOf(message.address), token: message.token };
}

async function connectedShop(): Promise<Connected> {
  return connect(await openShop(port, texts, 'cnw'));
}

async function booked(shop: ShopClient, order: { id: string }): Promise<Order> {
  const answered = await shop.post(`/orders/${order.id}/book`, {});
  expect(answered.status, JSON.stringify(answered.body)).toBe(200);
  steadfast.calls.length = 0;
  return answered.body as Order;
}

async function read(shop: ShopClient, orderId: string): Promise<Order> {
  return (await shop.get(`/orders/${orderId}`)).body as Order;
}

function messageOf(order: Order, status: string, extra: Record<string, unknown> = {}) {
  return {
    notification_type: 'delivery_status',
    consignment_id: Number(order.parcel?.consignmentId),
    invoice: order.parcel ? order.orderNumber : undefined,
    cod_amount: Number(order.due),
    status,
    delivery_charge: 60,
    tracking_message: `Your parcel is ${status}.`,
    updated_at: AT,
    ...extra,
  };
}

function postMessage(
  to: Connected,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<HttpResult> {
  return postJson(port, to.address, body, {
    host: 'localhost',
    'x-signature': signatureOf(JSON.stringify(body), to.token),
    'idempotency-key': randomUUID(),
    ...headers,
  });
}

/** A message answered is applied just after; this waits until nothing the shop was sent is left to apply. */
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
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<void> {
  const answered = await postMessage(to, body, headers);
  expect(answered.status, JSON.stringify(answered.body)).toBe(200);
  await applied(to.shop.tenantId);
}

async function stockOf(shop: ShopClient, productId: string): Promise<string[]> {
  const found = (await shop.get(`/products/${productId}/stock`)).body as {
    variants: { onHand: string; reserved: string }[];
  };
  return [found.variants[0]?.onHand ?? '', found.variants[0]?.reserved ?? ''];
}

async function fees(tenantId: string): Promise<string[]> {
  const { rows } = await admin.query<{ amount: string }>(
    "SELECT amount FROM tenant.balance_ledger WHERE tenant_id = $1 AND type = 'order_fee' ORDER BY id",
    [tenantId],
  );
  return rows.map((row) => row.amount);
}

async function handled(tenantId: string): Promise<number> {
  const { rows } = await admin.query<{ total: string }>(
    'SELECT count(*)::text AS total FROM tenant.orders WHERE tenant_id = $1 AND handled_at IS NOT NULL',
    [tenantId],
  );
  return Number(rows[0]?.total);
}

async function eventsOf(tenantId: string): Promise<number> {
  const { rows } = await admin.query<{ total: string }>(
    'SELECT count(*)::text AS total FROM tenant.courier_events WHERE tenant_id = $1',
    [tenantId],
  );
  return Number(rows[0]?.total);
}

async function payAsYouGo(): Promise<Connected> {
  const shop = await openShop(port, texts, 'cnw');
  await admin.query(
    `UPDATE control.tenants SET state = 'pay_as_you_go',
       plan_id = (SELECT id FROM control.plans WHERE name = 'Pay-as-you-go'),
       plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Pay-as-you-go')
     WHERE id = $1`,
    [shop.tenantId],
  );
  await seedBalance(admin, shop.tenantId, '500.00');
  return connect(shop);
}

/** Moves the fake's record of the parcel, as if the courier's own status had changed. */
function standsAt(order: Order, status: string): void {
  steadfast.statuses.set(order.parcel?.consignmentId ?? '', status);
}

async function nightAfter(hours: number): Promise<void> {
  clockShift = hours * HOUR_MS;
  await app.get(CourierChecks).runNight();
}

describeIfDatabase('the golden path, three ways (exit criterion 2)', () => {
  const ways: [string, (to: Connected, order: Order, status: string) => Promise<void>][] = [
    [
      'by message',
      async (to, order, status) => {
        await send(to, messageOf(order, status));
      },
    ],
    [
      'by the night check alone',
      async (_to, order, status) => {
        standsAt(order, status);
        clockShift += 30 * HOUR_MS;
        await app.get(CourierChecks).runNight();
      },
    ],
    [
      'by Sync',
      async (to, order, status) => {
        standsAt(order, status);
        clockShift += 11 * MINUTE_MS;
        const synced = await to.shop.post(`/orders/${order.id}/parcel/sync`, {});
        expect(synced.status, JSON.stringify(synced.body)).toBe(200);
      },
    ],
  ];

  it.each(ways)('takes a pay-as-you-go order from booked to delivered %s', async (_how, news) => {
    const to = await payAsYouGo();
    const { shop } = to;
    const lamp = await product(shop);
    const order = await booked(shop, await place(shop, lamp.variantId));
    expect(order).toMatchObject({ status: 'processing', fulfillmentStatus: 'processing' });
    const charged = await fees(shop.tenantId);
    expect(charged).toHaveLength(1);
    const stock = ['19.000', '0.000'];
    expect(await stockOf(shop, lamp.id)).toEqual(stock);

    await news(to, order, 'pending');
    const shipped = await read(shop, order.id);
    expect(shipped).toMatchObject({ status: 'shipped', fulfillmentStatus: 'shipped' });
    expect(shipped.shippedAt).not.toBeNull();
    expect(shipped.parcel).toMatchObject({ reading: 'with_courier', courierStatus: 'pending' });
    expect(shipped.due).toBe(order.due);
    expect(await stockOf(shop, lamp.id)).toEqual(stock);

    await news(to, order, 'delivered');
    const delivered = await read(shop, order.id);
    expect(delivered).toMatchObject({
      status: 'delivered',
      fulfillmentStatus: 'delivered',
      paymentStatus: 'paid',
      due: '0.00',
    });
    expect(delivered.deliveredAt).not.toBeNull();
    expect(delivered.parcel).toMatchObject({ reading: 'delivered', courierStatus: 'delivered' });
    expect(delivered.payments).toEqual([
      expect.objectContaining({ method: 'cash_on_delivery', amount: order.due }),
    ]);
    // The stock, the count and the fee happened once, at booking.
    expect(await stockOf(shop, lamp.id)).toEqual(stock);
    expect(await handled(shop.tenantId)).toBe(1);
    expect(await fees(shop.tenantId)).toEqual(charged);
    await expectLedgerAgrees(admin, shop.tenantId);
    expect(moved.map((notice) => notice.reading)).toEqual(['with_courier', 'delivered']);
  });
});

describeIfDatabase(
  'news can’t be forged or counted twice (exit criterion 4, CRR-11, CRR-13)',
  () => {
    it('refuses an address it doesn’t know before anything else', async () => {
      const answered = await postJson(
        port,
        '/webhooks/couriers/not-a-real-address',
        { status: 'delivered' },
        { host: 'localhost' },
      );
      expect(answered.status).toBe(404);
    });

    it('refuses a wrong or missing signature, changes nothing, and tells the owner once', async () => {
      const to = await connectedShop();
      const lamp = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, lamp.variantId));
      const body = messageOf(order, 'delivered');
      const forged = await postMessage(to, body, { 'x-signature': signatureOf('x', 'wrong') });
      expect(forged.status).toBe(401);
      const unsigned = await postJson(port, to.address, body, { host: 'localhost' });
      expect(unsigned.status).toBe(401);
      expect(await eventsOf(to.shop.tenantId)).toBe(0);
      expect(await read(to.shop, order.id)).toMatchObject({ status: 'processing', due: order.due });
      expect(trouble).toEqual([
        { tenantId: to.shop.tenantId, courierKey: 'steadfast', trouble: 'token_missing' },
      ]);
      const { connections } = (await to.shop.get('/couriers/connections')).body as {
        connections: { messages: string }[];
      };
      expect(connections[0]?.messages).toBe('token_missing');
      // With the token pasted, its next message clears that.
      await send(to, messageOf(order, 'pending'));
      const after = (await to.shop.get('/couriers/connections')).body as {
        connections: { messages: string; lastMessageAt: string | null }[];
      };
      expect(after.connections[0]?.messages).toBe('arriving');
      expect(after.connections[0]?.lastMessageAt).not.toBeNull();
    });

    it('adds nothing for a repeat with the same key, even two at once (CRR-13)', async () => {
      const to = await connectedShop();
      const lamp = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, lamp.variantId));
      const body = messageOf(order, 'delivered');
      const key = { 'idempotency-key': 'one-delivery' };
      const answers = await Promise.all([
        postMessage(to, body, key),
        postMessage(to, body, key),
        postMessage(to, body, key),
      ]);
      expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200]);
      await applied(to.shop.tenantId);
      expect(await eventsOf(to.shop.tenantId)).toBe(1);
      const after = await read(to.shop, order.id);
      expect(after.payments).toHaveLength(1);
      expect(after.history.filter((row) => row.to === 'delivered')).toHaveLength(1);
    });

    it('records one payment when two different deliveries of one result arrive at once', async () => {
      const to = await connectedShop();
      const lamp = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, lamp.variantId));
      const body = messageOf(order, 'delivered');
      await Promise.all([postMessage(to, body), postMessage(to, body)]);
      await applied(to.shop.tenantId);
      const after = await read(to.shop, order.id);
      expect(after).toMatchObject({ status: 'delivered', due: '0.00' });
      expect(after.payments).toHaveLength(1);
      expect(after.history.filter((row) => row.to === 'delivered')).toHaveLength(1);
    });

    it('never lets a late report move an order backwards (CRR-29)', async () => {
      const to = await connectedShop();
      const lamp = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, lamp.variantId));
      await send(to, messageOf(order, 'delivered', { updated_at: '2026-11-05 12:00:00' }));
      await send(to, messageOf(order, 'pending', { updated_at: '2026-11-05 09:00:00' }));
      const after = await read(to.shop, order.id);
      expect(after).toMatchObject({ status: 'delivered', due: '0.00' });
      expect(after.parcel).toMatchObject({ courierStatus: 'delivered', reading: 'delivered' });
      // Kept, as news, though it changed nothing.
      expect(after.parcel?.news.map((row) => row.rawStatus)).toContain('pending');
    });

    it('shows a status it doesn’t know, and moves nothing (CRR-29)', async () => {
      const to = await connectedShop();
      const lamp = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, lamp.variantId));
      await send(to, messageOf(order, 'teleported'));
      const after = await read(to.shop, order.id);
      expect(after).toMatchObject({ status: 'processing', due: order.due });
      expect(after.parcel).toMatchObject({ courierStatus: 'teleported', reading: null });
    });

    it('settles nothing on the rider’s word, then records the cash when the courier confirms (CRR-29)', async () => {
      const to = await connectedShop();
      const lamp = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, lamp.variantId));
      await send(to, messageOf(order, 'pending'));
      await send(to, messageOf(order, 'delivered_approval_pending'));
      const waiting = await read(to.shop, order.id);
      expect(waiting).toMatchObject({ status: 'shipped', due: order.due, payments: [] });
      expect(waiting.parcel?.reading).toBe('unconfirmed');
      await send(to, messageOf(order, 'delivered'));
      expect(await read(to.shop, order.id)).toMatchObject({ status: 'delivered', due: '0.00' });
    });

    it('moves nothing for a message about a parcel Lytro didn’t book', async () => {
      const to = await connectedShop();
      const lamp = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, lamp.variantId));
      await send(to, {
        ...messageOf(order, 'delivered'),
        consignment_id: 999,
        invoice: 'NOT-OURS',
      });
      expect(await read(to.shop, order.id)).toMatchObject({ status: 'processing', due: order.due });
    });

    it('keeps another shop’s news out, whatever the message claims', async () => {
      const owner = await connectedShop();
      const other = await connectedShop();
      const lamp = await product(owner.shop);
      const order = await booked(owner.shop, await place(owner.shop, lamp.variantId));
      await send(other, messageOf(order, 'delivered'));
      expect((await read(owner.shop, order.id)).status).toBe('processing');
    });
  },
);

describeIfDatabase('the cash a courier reports (read agreed 2026-11-05, ORD-43)', () => {
  it('records what it says when that’s short, leaves the rest due, and tells staff', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop, 1000);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    const short = Number(order.due) - 100;
    await send(to, messageOf(order, 'delivered', { cod_amount: short }));
    const after = await read(to.shop, order.id);
    expect(after).toMatchObject({
      status: 'delivered',
      paymentStatus: 'partially_paid',
      due: '100.00',
    });
    expect(after.payments[0]?.amount).toBe(short.toFixed(2));
    expect(after.parcel).toMatchObject({ attention: 'cash_differs' });
    expect(Number(after.parcel?.cashCollected)).toBe(short);
    expect(attention.map((notice) => notice.why)).toEqual(['cash_differs']);
  });

  it('records what’s due when it says more, and tells staff of the extra', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop, 1000);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    await send(to, messageOf(order, 'delivered', { cod_amount: Number(order.due) + 50 }));
    const after = await read(to.shop, order.id);
    expect(after).toMatchObject({ paymentStatus: 'paid', due: '0.00' });
    expect(after.payments[0]?.amount).toBe(order.due);
    expect(after.parcel?.attention).toBe('cash_differs');
  });

  it('records what’s due when it says nothing, as Mark delivered does', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop, 1000);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    await send(to, messageOf(order, 'delivered', { cod_amount: undefined }));
    const after = await read(to.shop, order.id);
    expect(after).toMatchObject({ paymentStatus: 'paid', due: '0.00' });
    expect(after.parcel?.attention).toBeNull();
  });

  it('agrees with a delivery marked by hand, and only notes a different amount (D6-13)', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop, 1000);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    await to.shop.post(`/orders/${order.id}/ship`, { courierName: 'Steadfast', trackingCode: 'T' });
    await to.shop.post(`/orders/${order.id}/deliver`, {});
    const payments = (await read(to.shop, order.id)).payments;
    await send(to, messageOf(order, 'delivered'));
    const agreed = await read(to.shop, order.id);
    expect(agreed.payments).toEqual(payments);
    expect(agreed.parcel?.attention).toBeNull();
    expect(agreed.history.filter((row) => row.to === 'delivered')).toHaveLength(1);
    await send(
      to,
      messageOf(order, 'delivered', { cod_amount: 1, updated_at: '2026-11-05 11:00:00' }),
    );
    const differs = await read(to.shop, order.id);
    expect(differs.payments).toEqual(payments);
    expect(differs.parcel?.attention).toBe('cash_differs');
  });

  it('keeps a delivered order delivered when the courier later says otherwise, and tells staff', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    await send(to, messageOf(order, 'delivered'));
    const stock = await stockOf(to.shop, lamp.id);
    await send(to, messageOf(order, 'cancelled', { updated_at: '2026-11-05 15:00:00' }));
    const after = await read(to.shop, order.id);
    expect(after).toMatchObject({ status: 'delivered', due: '0.00' });
    expect(after.payments).toHaveLength(1);
    expect(after.parcel).toMatchObject({
      courierStatus: 'cancelled',
      reading: 'returning',
      attention: 'report_after_delivered',
    });
    expect(attention.map((notice) => notice.why)).toEqual(['report_after_delivered']);
    expect(await stockOf(to.shop, lamp.id)).toEqual(stock);
  });
});

describeIfDatabase('nothing comes back without a person (exit criterion 5, D6-6)', () => {
  it('shows a parcel partly delivered with its cash, and stock waits for staff to count', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop, 1000);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId, 2));
    expect(await stockOf(to.shop, lamp.id)).toEqual(['18.000', '0.000']);
    await send(to, messageOf(order, 'partial_delivered', { cod_amount: 1000 }));
    const partly = await read(to.shop, order.id);
    expect(partly).toMatchObject({
      status: 'partial_delivered',
      fulfillmentStatus: 'partially_delivered',
      paymentStatus: 'partially_paid',
    });
    expect(partly.deliveredAt).toBeNull();
    expect(partly.payments[0]?.amount).toBe('1000.00');
    expect(await stockOf(to.shop, lamp.id)).toEqual(['18.000', '0.000']);
    // Staff say what came back, and only then does it move.
    const counted = await to.shop.post(`/orders/${order.id}/returns`, {
      items: [{ lineId: partly.items[0]?.id, sellable: 1, damaged: 0 }],
    });
    expect(counted.status, JSON.stringify(counted.body)).toBe(200);
    expect(await stockOf(to.shop, lamp.id)).toEqual(['19.000', '0.000']);
    await expectLedgerAgrees(admin, to.shop.tenantId);
  });

  it('records no cash when a partly delivered report names none', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop, 1000);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId, 2));
    await send(to, messageOf(order, 'partial_delivered', { cod_amount: undefined }));
    expect(await read(to.shop, order.id)).toMatchObject({
      status: 'partial_delivered',
      due: order.due,
      payments: [],
    });
  });

  it('shows a parcel coming back and moves no stock until staff count it', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    await send(to, messageOf(order, 'pending'));
    await send(to, messageOf(order, 'cancelled'));
    const coming = await read(to.shop, order.id);
    expect(coming).toMatchObject({ status: 'shipped', due: order.due });
    expect(coming.parcel).toMatchObject({ reading: 'returning', attention: null });
    expect(await stockOf(to.shop, lamp.id)).toEqual(['19.000', '0.000']);
    const counted = await to.shop.post(`/orders/${order.id}/returns`, {
      items: [{ lineId: coming.items[0]?.id, sellable: 1, damaged: 0 }],
    });
    expect(counted.status, JSON.stringify(counted.body)).toBe(200);
    expect(counted.body).toMatchObject({ status: 'returned' });
    expect(await stockOf(to.shop, lamp.id)).toEqual(['20.000', '0.000']);
  });

  it('lets a parcel coming back before it shipped be cancelled with no confirmation, its stock back', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    await send(to, messageOf(order, 'cancelled'));
    const cancelled = await to.shop.post(`/orders/${order.id}/cancel`, { reason: 'unreachable' });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect(await stockOf(to.shop, lamp.id)).toEqual(['20.000', '0.000']);
  });
});

describeIfDatabase('a booked order cancelled, and news after it (exit criterion 6, CRR-28)', () => {
  it('sends a later delivered report to staff and reopens nothing', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    const cancelled = await to.shop.post(`/orders/${order.id}/cancel`, {
      reason: 'customer_cancelled',
      courierCancelled: true,
    });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    const stock = await stockOf(to.shop, lamp.id);
    await send(to, messageOf(order, 'delivered'));
    const after = await read(to.shop, order.id);
    expect(after).toMatchObject({ status: 'cancelled', payments: [] });
    expect(after.parcel).toMatchObject({
      state: 'cancelled',
      courierStatus: 'delivered',
      attention: 'delivered_after_cancel',
    });
    expect(attention.map((notice) => notice.why)).toEqual(['delivered_after_cancel']);
    expect(await stockOf(to.shop, lamp.id)).toEqual(stock);
  });
});

describeIfDatabase('calls stay down (exit criterion 7, D6-4)', () => {
  it('makes no call from any page, list or tracking view', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    await read(to.shop, order.id);
    await to.shop.get('/orders');
    await to.shop.get('/couriers/connections');
    expect(steadfast.calls).toEqual([]);
  });

  it('asks once a night, about a parcel old enough with no recent message, and not after it finishes', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    // Too young.
    await nightAfter(5);
    expect(steadfast.statusCalls()).toEqual([]);
    // Old enough, with no message ever.
    await nightAfter(7);
    expect(steadfast.statusCalls()).toHaveLength(1);
    // A recent message spares it.
    await send(to, messageOf(order, 'pending'));
    steadfast.calls.length = 0;
    clockShift = 7 * HOUR_MS;
    await app.get(CourierChecks).runNight();
    expect(steadfast.statusCalls()).toEqual([]);
    // Quiet for long enough, it is asked again, and a result finishes it.
    standsAt(order, 'delivered');
    await nightAfter(40);
    expect(steadfast.statusCalls()).toHaveLength(1);
    expect((await read(to.shop, order.id)).status).toBe('delivered');
    steadfast.calls.length = 0;
    await nightAfter(80);
    expect(steadfast.statusCalls()).toEqual([]);
  });

  it('stops asking after a parcel coming back (read agreed 2026-11-05)', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    standsAt(order, 'cancelled');
    await nightAfter(7);
    expect(steadfast.statusCalls()).toHaveLength(1);
    expect((await read(to.shop, order.id)).parcel?.reading).toBe('returning');
    steadfast.calls.length = 0;
    await nightAfter(60);
    expect(steadfast.statusCalls()).toEqual([]);
  });

  it('makes no second call for a Sync inside the limit, or for a finished parcel (CRR-14)', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    const sync = () => to.shop.post(`/orders/${order.id}/parcel/sync`, {});
    expect((await sync()).status).toBe(200);
    expect(steadfast.statusCalls()).toHaveLength(1);
    expect((await sync()).status).toBe(200);
    expect(steadfast.statusCalls()).toHaveLength(1);
    clockShift = 11 * MINUTE_MS;
    standsAt(order, 'delivered');
    expect((await sync()).status).toBe(200);
    expect(steadfast.statusCalls()).toHaveLength(2);
    clockShift = 30 * MINUTE_MS;
    expect((await sync()).status).toBe(200);
    expect(steadfast.statusCalls()).toHaveLength(2);
  });

  it('has no parcel to Sync on an order not booked', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await place(to.shop, lamp.variantId);
    expect((await to.shop.post(`/orders/${order.id}/parcel/sync`, {})).status).toBe(409);
    expect(steadfast.calls).toEqual([]);
  });

  it('stops after 30 days with no change and shows no news, and Sync starts it again', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    clockShift = 31 * DAY_MS;
    await app.get(CourierChecks).runNight();
    expect(steadfast.statusCalls()).toEqual([]);
    expect((await read(to.shop, order.id)).parcel?.noNews).toBe(true);
    const synced = await to.shop.post(`/orders/${order.id}/parcel/sync`, {});
    expect(synced.status, JSON.stringify(synced.body)).toBe(200);
    expect(steadfast.statusCalls()).toHaveLength(1);
    expect((synced.body as Order).parcel?.noNews).toBe(false);
  });

  it('asks nothing for a lapsed shop or a disconnected courier', async () => {
    const lapsed = await connectedShop();
    const gone = await connectedShop();
    for (const to of [lapsed, gone]) {
      const lamp = await product(to.shop);
      await booked(to.shop, await place(to.shop, lamp.variantId));
      // The fake holds one list of invoices; two shops' first orders share a number, on two real accounts.
      steadfast.consignments.length = 0;
    }
    await admin.query("UPDATE control.tenants SET state = 'read_only' WHERE id = $1", [
      lapsed.shop.tenantId,
    ]);
    await gone.shop.delete('/couriers/connections/steadfast');
    await nightAfter(7);
    expect(steadfast.statusCalls()).toEqual([]);
  });

  it('stops a connection whose login is refused, at the first refusal, and tells the owner (§3.6)', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    for (let index = 0; index < 3; index += 1) {
      await booked(to.shop, await place(to.shop, lamp.variantId));
    }
    steadfast.behaviour = { keysRevoked: true };
    await nightAfter(7);
    // One refused ask and the test call that confirms it, of three parcels.
    expect(steadfast.statusCalls()).toHaveLength(1);
    expect(steadfast.callsTo('/get_balance')).toHaveLength(1);
    expect(trouble).toEqual([
      { tenantId: to.shop.tenantId, courierKey: 'steadfast', trouble: 'login_refused' },
    ]);
    const { connections } = (await to.shop.get('/couriers/connections')).body as {
      connections: { state: string }[];
    };
    expect(connections[0]?.state).toBe('login_refused');
    // Nothing more until the keys change.
    steadfast.calls.length = 0;
    await nightAfter(40);
    expect(steadfast.statusCalls()).toEqual([]);
    steadfast.behaviour = {};
    await connect(to.shop);
    await nightAfter(70);
    expect(steadfast.statusCalls()).toHaveLength(3);
  });

  it('doesn’t blame the login when the test call passes: a parcel on another profile (§3.6)', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    await booked(to.shop, await place(to.shop, lamp.variantId));
    steadfast.behaviour = { otherProfile: true };
    await nightAfter(7);
    expect(steadfast.callsTo('/get_balance')).toHaveLength(1);
    expect(trouble).toEqual([]);
    const { connections } = (await to.shop.get('/couriers/connections')).body as {
      connections: { state: string }[];
    };
    expect(connections[0]?.state).toBe('active');
  });

  it('tells the owner, once a day, of news no working paste brought (CRR-15)', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const first = await booked(to.shop, await place(to.shop, lamp.variantId));
    const second = await booked(to.shop, await place(to.shop, lamp.variantId));
    await send(to, messageOf(first, 'in_review'));
    clockShift = 30 * HOUR_MS;
    standsAt(first, 'pending');
    standsAt(second, 'pending');
    await app.get(CourierChecks).runNight();
    expect(trouble).toEqual([
      { tenantId: to.shop.tenantId, courierKey: 'steadfast', trouble: 'paste_broken' },
    ]);
    // The check still moved the orders: the paste is only worth telling of.
    expect((await read(to.shop, first.id)).status).toBe('shipped');
    expect((await read(to.shop, second.id)).status).toBe('shipped');
  });

  it('says nothing of a broken paste to a shop that never pasted (D6-3)', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    standsAt(order, 'pending');
    await nightAfter(7);
    expect((await read(to.shop, order.id)).status).toBe('shipped');
    expect(trouble).toEqual([]);
    const { connections } = (await to.shop.get('/couriers/connections')).body as {
      connections: { messages: string }[];
    };
    expect(connections[0]?.messages).toBe('none_yet');
  });

  it('answers 503 and changes nothing when Sync gets no answer', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    steadfast.behaviour = { down: true };
    expect((await to.shop.post(`/orders/${order.id}/parcel/sync`, {})).status).toBe(503);
    expect((await read(to.shop, order.id)).status).toBe('processing');
  });
});

describeIfDatabase(
  'what’s pasted, and who sees it (CRR-02, CRR-03, CRR-20, read agreed 2026-11-05)',
  () => {
    it('shows the address and token when connecting and again, only to couriers:manage', async () => {
      const shop = await openShop(port, texts, 'cnw');
      const made = await connect(shop);
      const shown = await shop.get('/couriers/connections/steadfast/address');
      expect(shown.status, JSON.stringify(shown.body)).toBe(200);
      const again = shown.body as { address: string; token: string };
      expect(pathOf(again.address)).toBe(made.address);
      expect(again.token).toBe(made.token);
      expect(made.token).toMatch(/^[A-Za-z0-9._=-]+$/);
      const booker = await staffWith(port, texts, admin, shop, ['orders:read', 'orders:manage']);
      const refused = await getJson(port, '/couriers/connections/steadfast/address', booker);
      expect(refused.status).toBe(403);
      const { connections } = (await shop.get('/couriers/connections')).body as {
        connections: Record<string, unknown>[];
      };
      expect(JSON.stringify(connections)).not.toContain(made.token);
      const { rows } = await admin.query<{ message_secrets: Buffer; token_hash: string }>(
        `SELECT c.message_secrets, r.token_hash FROM tenant.courier_connections c
       JOIN control.courier_message_routes r ON r.connection_id = c.id WHERE c.tenant_id = $1`,
        [shop.tenantId],
      );
      expect(rows[0]?.message_secrets.toString('latin1')).not.toContain(made.token);
      expect(rows[0]?.token_hash).not.toContain(made.address.split('/').pop());
    });

    it('keeps the pair when the keys are replaced', async () => {
      const shop = await openShop(port, texts, 'cnw');
      const first = await connect(shop);
      const second = await connect(shop);
      expect(second.address).toBe(first.address);
      expect(second.token).toBe(first.token);
    });

    it('replaces the pair, and the old address and token stop working at once', async () => {
      const to = await connectedShop();
      const lamp = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, lamp.variantId));
      const replaced = await to.shop.post('/couriers/connections/steadfast/address', {});
      expect(replaced.status, JSON.stringify(replaced.body)).toBe(200);
      const fresh = replaced.body as { address: string; token: string };
      expect((await postMessage(to, messageOf(order, 'pending'))).status).toBe(404);
      const next: Connected = {
        shop: to.shop,
        address: pathOf(fresh.address),
        token: fresh.token,
      };
      await send(next, messageOf(order, 'pending'));
      expect((await read(to.shop, order.id)).status).toBe('shipped');
    });

    it('refuses a disconnected courier’s address and keeps its past news (CRR-20)', async () => {
      const to = await connectedShop();
      const lamp = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, lamp.variantId));
      await send(to, messageOf(order, 'pending'));
      expect((await to.shop.delete('/couriers/connections/steadfast')).status).toBe(200);
      expect((await postMessage(to, messageOf(order, 'delivered'))).status).toBe(404);
      const after = await read(to.shop, order.id);
      expect(after.status).toBe('shipped');
      expect(after.parcel?.news).toHaveLength(1);
      // Its address is gone, not just unanswered: connecting again makes a new pair, and the old one finds no shop.
      const { rows } = await admin.query(
        'SELECT 1 FROM control.courier_message_routes WHERE tenant_id = $1',
        [to.shop.tenantId],
      );
      expect(rows).toHaveLength(0);
      const again = await connect(to.shop);
      expect(again.address).not.toBe(to.address);
      expect((await postMessage(to, messageOf(order, 'delivered'))).status).toBe(404);
    });

    it('keeps another shop out of the address routes (SEC-02)', async () => {
      await connectedShop();
      const other = await openShop(port, texts, 'cnw');
      expect((await other.get('/couriers/connections/steadfast/address')).status).toBe(404);
      expect((await other.post('/couriers/connections/steadfast/address', {})).status).toBe(404);
    });

    it('clears its news and address with the shop at day 60 (LIF-19)', async () => {
      const to = await connectedShop();
      const lamp = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, lamp.variantId));
      await send(to, messageOf(order, 'pending'));
      await app.get(CourierConnections).deleteAllForTenant(to.shop.tenantId);
      expect(await eventsOf(to.shop.tenantId)).toBe(0);
      const { rows } = await admin.query(
        'SELECT 1 FROM control.courier_message_routes WHERE tenant_id = $1',
        [to.shop.tenantId],
      );
      expect(rows).toHaveLength(0);
      expect((await postMessage(to, messageOf(order, 'delivered'))).status).toBe(404);
    });

    it('records messages through locked, and ignores them from archived (LIF-13)', async () => {
      const to = await connectedShop();
      const lamp = await product(to.shop);
      const order = await booked(to.shop, await place(to.shop, lamp.variantId));
      await admin.query("UPDATE control.tenants SET state = 'locked' WHERE id = $1", [
        to.shop.tenantId,
      ]);
      await send(to, messageOf(order, 'pending'));
      await admin.query("UPDATE control.tenants SET state = 'archived' WHERE id = $1", [
        to.shop.tenantId,
      ]);
      const answered = await postMessage(to, messageOf(order, 'delivered'));
      expect(answered.status).toBe(200);
      await admin.query("UPDATE control.tenants SET state = 'active' WHERE id = $1", [
        to.shop.tenantId,
      ]);
      const { rows } = await admin.query<{ status: string }>(
        'SELECT fulfillment_status AS status FROM tenant.orders WHERE id = $1',
        [order.id],
      );
      expect(rows[0]?.status).toBe('shipped');
      expect(await eventsOf(to.shop.tenantId)).toBe(1);
    });
  },
);

describeIfDatabase('the rest of what a courier sends (read agreed 2026-11-05)', () => {
  it('shows other events and moves nothing, and flags a COD changed in its panel', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    await send(to, {
      notification_type: 'cancel_request',
      consignment_id: Number(order.parcel?.consignmentId),
      tracking_message: 'A cancel was requested.',
      updated_at: AT,
    });
    const shown = await read(to.shop, order.id);
    expect(shown).toMatchObject({ status: 'processing', due: order.due });
    expect(shown.parcel?.news[0]?.message.en).toBe('A cancel was requested.');
    await send(to, {
      notification_type: 'consignment_update',
      consignment_id: Number(order.parcel?.consignmentId),
      cod_amount: 123,
      updated_at: AT,
    });
    const changed = await read(to.shop, order.id);
    expect(changed).toMatchObject({ status: 'processing', due: order.due });
    expect(changed.parcel).toMatchObject({ attention: 'cod_changed' });
    expect(Number(changed.parcel?.codAtCourier)).toBe(123);
    expect(attention.map((notice) => notice.why)).toEqual(['cod_changed']);
  });

  it('stores the courier’s delivery charge (D6-9)', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    await send(to, messageOf(order, 'delivered', { delivery_charge: 80 }));
    expect(Number((await read(to.shop, order.id)).parcel?.deliveryCharge)).toBe(80);
  });

  it('settles a lost answer when a message proves the parcel exists (D6-11)', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await place(to.shop, lamp.variantId);
    steadfast.behaviour = { bookingTimesOut: { madeIt: true } };
    expect((await to.shop.post(`/orders/${order.id}/book`, {})).status).toBe(503);
    steadfast.behaviour = {};
    await send(to, {
      notification_type: 'delivery_status',
      consignment_id: 4242,
      invoice: order.orderNumber,
      status: 'pending',
      tracking_message: 'With us.',
      updated_at: AT,
    });
    const after = await read(to.shop, order.id);
    expect(after).toMatchObject({ status: 'shipped' });
    expect(after.parcel).toMatchObject({ state: 'booked', consignmentId: '4242' });
    expect(await stockOf(to.shop, lamp.id)).toEqual(['19.000', '0.000']);
  });

  it('applies one stored message once when two passes take it at once (CRR-13)', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop, 1000);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    // Short, so that applying it a second time would tell staff a second time.
    const body = JSON.stringify(messageOf(order, 'delivered', { cod_amount: 900 }));
    const route = to.address.split('/').pop() ?? '';
    const { stored } = await app.get(CourierMessages).receive(route, Buffer.from(body), {
      'x-signature': signatureOf(body, to.token),
      'idempotency-key': randomUUID(),
    });
    if (stored === null) throw new Error('it should have been stored');
    const news = app.get(CourierNewsPath);
    await Promise.all([
      news.apply(to.shop.tenantId, stored),
      news.apply(to.shop.tenantId, stored),
      news.apply(to.shop.tenantId, stored),
    ]);
    const after = await read(to.shop, order.id);
    expect(after).toMatchObject({ status: 'delivered' });
    expect(after.payments).toHaveLength(1);
    expect(after.history.filter((row) => row.to === 'delivered')).toHaveLength(1);
    expect(attention.map((notice) => notice.why)).toEqual(['cash_differs']);
    expect(moved.map((notice) => notice.reading)).toEqual(['delivered']);
  });

  it('applies what was stored if the server stopped just after answering', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    const body = JSON.stringify(messageOf(order, 'pending'));
    const route = to.address.split('/').pop() ?? '';
    const received = await app.get(CourierMessages).receive(route, Buffer.from(body), {
      'x-signature': signatureOf(body, to.token),
      'idempotency-key': randomUUID(),
    });
    expect(received.stored).not.toBeNull();
    expect((await read(to.shop, order.id)).status).toBe('processing');
    clockShift = 2 * MINUTE_MS;
    const pass = app.get(CourierBookingPass);
    await Promise.all([pass.runTick(), pass.runTick()]);
    const after = await read(to.shop, order.id);
    expect(after.status).toBe('shipped');
    expect(after.history.filter((row) => row.to === 'shipped')).toHaveLength(1);
  });
});

describeIfDatabase('what a shopper’s tracking shows (CRR-12, read agreed 2026-11-05)', () => {
  async function tracked(
    shop: ShopClient,
    trackingId: string,
  ): Promise<{ courierMessage: { en: string | null } | null; status: string }> {
    const key = await shop.post('/api-keys', { name: 'Tracking', websites: [SITE] });
    expect(key.status, JSON.stringify(key.body)).toBe(201);
    const { key: secret } = key.body as { key: string };
    const answered = await sendExact(port, 'GET', `/v1/track/${trackingId}`, undefined, {
      host: 'api.localhost',
      origin: SITE,
      authorization: `Bearer ${secret}`,
    });
    expect(answered.status, JSON.stringify(answered.body)).toBe(200);
    return answered.body as { courierMessage: { en: string | null } | null; status: string };
  }

  it('shows nothing before it ships, then the latest words, cut short, never a panel’s change', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    await send(to, messageOf(order, 'in_review', { tracking_message: 'Being reviewed.' }));
    expect((await tracked(to.shop, order.trackingId)).courierMessage).toBeNull();
    await send(to, messageOf(order, 'pending', { tracking_message: 'x'.repeat(400) }));
    const long = await tracked(to.shop, order.trackingId);
    expect(long.courierMessage?.en?.length).toBe(200);
    await send(to, {
      notification_type: 'tracking_update',
      consignment_id: Number(order.parcel?.consignmentId),
      tracking_message: 'With the rider.',
      updated_at: AT,
    });
    expect((await tracked(to.shop, order.trackingId)).courierMessage?.en).toBe('With the rider.');
    await send(to, {
      notification_type: 'consignment_update',
      consignment_id: Number(order.parcel?.consignmentId),
      cod_amount: 1,
      tracking_message: 'COD changed by the merchant.',
      updated_at: AT,
    });
    expect((await tracked(to.shop, order.trackingId)).courierMessage?.en).toBe('With the rider.');
  });

  it('shows staff the news with where it came from', async () => {
    const to = await connectedShop();
    const lamp = await product(to.shop);
    const order = await booked(to.shop, await place(to.shop, lamp.variantId));
    await send(to, messageOf(order, 'pending'));
    standsAt(order, 'delivered');
    clockShift = 30 * HOUR_MS;
    await app.get(CourierChecks).runNight();
    const after = await read(to.shop, order.id);
    expect(after.parcel?.news.map((row) => row.source)).toEqual(['check', 'message']);
    expect(steadfast.statusCalls()).toHaveLength(1);
  });
});

describeIfDatabase('the night check’s reach', () => {
  it('keeps going when one shop’s courier is down, and a second run adds nothing', async () => {
    const down = await connectedShop();
    const lamp = await product(down.shop);
    const order = await booked(down.shop, await place(down.shop, lamp.variantId));
    standsAt(order, 'pending');
    clockShift = 7 * HOUR_MS;
    const checks = app.get(CourierChecks);
    await Promise.all([checks.runNight(), checks.runNight()]);
    const after = await read(down.shop, order.id);
    expect(after.status).toBe('shipped');
    expect(after.history.filter((row) => row.to === 'shipped')).toHaveLength(1);
    expect(await eventsOf(down.shop.tenantId)).toBe(1);
  });
});
