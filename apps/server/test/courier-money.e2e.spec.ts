import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { HOUR_MS } from '../src/common/time';
import { CourierConnections } from '../src/modules/couriers/services/courier-connections';
import { CourierPayouts } from '../src/modules/couriers/services/courier-payouts';
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
import { prepareTestDatabase } from './support/database';
import { FakeSteadfast, freshSteadfastKeys, signatureOf } from './support/fake-steadfast';
import { getJson, postJson } from './support/http';
import { openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 6 Slice 6.5, read agreed 2026-11-06: courier money (CRR-17, D6-9, INV-18). Steadfast's payouts are read on the night run, oldest
// first as its live list ran, only while a parcel waits to be paid; each payout's parcels take its ID and date and the payout keeps its
// figures, shown and never checked. The sales figures show couriers' charges beside the delivery charges, with how many orders have none,
// and profit is unchanged. A fake stands in. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_courier_money_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 40_000 });

let app: INestApplication;
let port: number;
let admin: pg.Client;
let clockShift = 0;
const steadfast = new FakeSteadfast();
const texts = new SmsCapture();
const NOTIFIER = {
  parcelNeedsAttention: () => Promise.resolve(),
  parcelMoved: () => Promise.resolve(),
  connectionTrouble: () => Promise.resolve(),
};

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'courier-money-e2e-otp-secret-0123456789012345';
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
    .useValue(NOTIFIER)
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
  if (!ADMIN_URL) return;
  // The night run goes through every shop, so parcels an earlier test left waiting are paid for it first.
  await admin.query('UPDATE tenant.courier_parcels SET paid_at = now() WHERE paid_at IS NULL');
});

interface Parcel {
  cod: string;
  consignmentId: string | null;
  deliveryCharge: string | null;
  paidAt: string | null;
  payoutId: string | null;
  news: { rawStatus: string | null }[];
}

interface Order {
  id: string;
  orderNumber: string;
  due: string;
  status: string;
  parcel: Parcel | null;
}

interface Connected {
  shop: ShopClient;
  address: string;
  token: string;
}

interface Payout {
  id: string;
  courierKey: string;
  payoutId: string;
  amount: string;
  charges: string | null;
  total: string | null;
  method: string | null;
  paidAt: string;
  madeAt: string | null;
  parcels: number;
  ours: number;
}

/** Steadfast writes its times as Dhaka's, with no zone. */
function dhaka(at: Date): string {
  return new Date(at.getTime() + 6 * HOUR_MS).toISOString().slice(0, 19).replace('T', ' ');
}

/** A payout made and paid a little after now, so it can hold today's parcels. */
const SOON = (): string => dhaka(new Date(Date.now() + HOUR_MS));
// Long before any parcel here was booked.
const LONG_AGO = '2026-01-01 10:00:00';

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

let lastProductId = '';
async function lamp(shop: ShopClient): Promise<string> {
  const made = await shop.post('/products', {
    name: 'Lamp',
    basePrice: 500,
    variants: [{ optionIds: [], openingStock: 50, openingUnitCost: 200 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const body = made.body as { id: string; variants: { id: string }[] };
  lastProductId = body.id;
  return body.variants[0]?.id ?? '';
}

async function place(shop: ShopClient, variantId: string): Promise<Order> {
  const made = await postJson(
    port,
    '/orders',
    {
      customerName: 'Rahima Akter',
      phone: freshMobile(),
      locationId: await mirpur(shop),
      deliveryAddress: 'House 12, Road 3',
      items: [{ variantId, quantity: 1 }],
    },
    shop.headers({ 'idempotency-key': randomUUID() }),
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as Order;
}

async function connected(): Promise<Connected> {
  const shop = await openShop(port, texts, 'cmo');
  const made = await shop.post('/couriers/connections', {
    courierKey: 'steadfast',
    credentials: freshSteadfastKeys(),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  const { message } = made.body as { message: { address: string; token: string } };
  return {
    shop,
    address: new URL(message.address).pathname.replace('/api/v1', ''),
    token: message.token,
  };
}

async function read(shop: ShopClient, orderId: string): Promise<Order> {
  return (await shop.get(`/orders/${orderId}`)).body as Order;
}

async function booked(to: Connected, variantId: string): Promise<Order> {
  const order = await place(to.shop, variantId);
  const answered = await to.shop.post(`/orders/${order.id}/book`, {});
  expect(answered.status, JSON.stringify(answered.body)).toBe(200);
  return answered.body as Order;
}

/** A Steadfast message, signed as its guide says, and applied before this returns. */
async function send(to: Connected, body: Record<string, unknown>): Promise<void> {
  const answered = await postJson(port, to.address, body, {
    host: 'localhost',
    'x-signature': signatureOf(JSON.stringify(body), to.token),
    'idempotency-key': randomUUID(),
  });
  expect(answered.status, JSON.stringify(answered.body)).toBe(202);
  await vi.waitFor(
    async () => {
      const { rows } = await admin.query(
        'SELECT 1 FROM tenant.courier_events WHERE tenant_id = $1 AND applied_at IS NULL',
        [to.shop.tenantId],
      );
      expect(rows).toHaveLength(0);
    },
    { timeout: 10_000, interval: 50 },
  );
}

/** Booked, with the courier, then delivered by its messages; the delivered message names its charge unless told not to. */
async function delivered(
  to: Connected,
  variantId: string,
  charge: number | null = 60,
): Promise<Order> {
  const order = await booked(to, variantId);
  const base = {
    notification_type: 'delivery_status',
    consignment_id: Number(order.parcel?.consignmentId),
    invoice: order.orderNumber,
    cod_amount: Number(order.due),
    updated_at: dhaka(new Date()),
  };
  await send(to, { ...base, status: 'pending' });
  await send(to, {
    ...base,
    status: 'delivered',
    ...(charge !== null ? { delivery_charge: charge } : {}),
  });
  const now = await read(to.shop, order.id);
  expect(now.status).toBe('delivered');
  return now;
}

function paidOf(order: Order): { consignmentId: string; invoice: string } {
  return { consignmentId: order.parcel?.consignmentId ?? '', invoice: order.orderNumber };
}

async function night(): Promise<void> {
  steadfast.calls.length = 0;
  await app.get(CourierPayouts).runNight();
}

async function pageOf(tenantId: string): Promise<{ page: number; size: number | null }> {
  const { rows } = await admin.query<{ page: number; size: number | null }>(
    'SELECT payout_page AS page, payout_page_size AS size FROM tenant.courier_connections WHERE tenant_id = $1',
    [tenantId],
  );
  return rows[0] ?? { page: 0, size: null };
}

describeIfDatabase('Steadfast’s payouts (CRR-17, D6-9)', () => {
  it('marks the parcels a payout settled paid with its ID, keeps its figures as given, and reads it once', async () => {
    const to = await connected();
    const { shop } = to;
    const variant = await lamp(shop);
    const first = await delivered(to, variant);
    const second = await delivered(to, variant);
    const third = await delivered(to, variant);
    const at = SOON();
    steadfast.pay(
      'PAY-1001',
      [paidOf(first), paidOf(second), { consignmentId: 999001, invoice: 'NOT-OURS' }],
      at,
    );

    await night();
    // One page shorter than a full one is the last, and the new payout costs one more call.
    expect(steadfast.payoutCalls()).toEqual(['/payments', '/payments/PAY-1001']);
    const paidAt = new Date(`${at.replace(' ', 'T')}+06:00`).toISOString();
    for (const order of [first, second]) {
      expect((await read(shop, order.id)).parcel).toMatchObject({ paidAt, payoutId: 'PAY-1001' });
    }
    expect((await read(shop, third.id)).parcel).toMatchObject({ paidAt: null, payoutId: null });

    const listed = await shop.get('/couriers/payouts');
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    const { payouts, total } = listed.body as { payouts: Payout[]; total: number };
    expect(total).toBe(1);
    expect(payouts[0]).toMatchObject({
      courierKey: 'steadfast',
      payoutId: 'PAY-1001',
      amount: '1840.00',
      charges: '160.00',
      total: '2000.00',
      method: 'Bank',
      paidAt,
      parcels: 3,
      ours: 2,
    });
    const one = await shop.get(`/couriers/payouts/${payouts[0]?.id ?? ''}`);
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    expect((one.body as { orders: { orderId: string; orderNumber: string }[] }).orders).toEqual([
      {
        orderId: first.id,
        orderNumber: first.orderNumber,
        cod: first.parcel?.cod,
        cashCollected: first.parcel?.cod,
        deliveryCharge: '60.00',
        reading: 'delivered',
      },
      expect.objectContaining({ orderId: second.id, orderNumber: second.orderNumber }),
    ]);

    // The third still waits, so the list is read again, and the payout already read costs nothing more.
    await night();
    expect(steadfast.payoutCalls()).toEqual(['/payments']);
    expect(((await shop.get('/couriers/payouts')).body as { total: number }).total).toBe(1);
    // SEC-11: every call is in the shop's credential log, never the keys.
    const { rows } = await admin.query<{ total: string }>(
      "SELECT count(*)::text AS total FROM tenant.courier_credential_uses WHERE tenant_id = $1 AND action = 'payouts'",
      [shop.tenantId],
    );
    expect(Number(rows[0]?.total)).toBe(3);
  });

  it('asks nothing while no parcel waits to be paid', async () => {
    const to = await connected();
    const variant = await lamp(to.shop);
    // On its way, its status just changed, but not finished: nothing can be paid for yet.
    const onItsWay = await booked(to, variant);
    await send(to, {
      notification_type: 'delivery_status',
      consignment_id: Number(onItsWay.parcel?.consignmentId),
      invoice: onItsWay.orderNumber,
      cod_amount: Number(onItsWay.due),
      status: 'pending',
      updated_at: dhaka(new Date()),
    });
    await night();
    expect(steadfast.payoutCalls()).toEqual([]);

    // A delivered one waits until a payout settles it, and then nothing waits again.
    const done = await delivered(to, variant);
    steadfast.pay('PAY-2001', [paidOf(done)], SOON());
    await night();
    expect(steadfast.payoutCalls()).toEqual(['/payments', '/payments/PAY-2001']);
    await night();
    expect(steadfast.payoutCalls()).toEqual([]);
  });

  it('walks its pages oldest first from where it stopped, learning how many a page holds', async () => {
    const to = await connected();
    const variant = await lamp(to.shop);
    const order = await delivered(to, variant);
    // A full page of payouts made long before this parcel: listed, but none can hold it, so none is opened.
    for (let n = 0; n < 8; n += 1) steadfast.pay(`OLD-${String(n)}`, [], LONG_AGO);
    steadfast.pay('PAY-3001', [paidOf(order)], SOON());

    await night();
    expect(steadfast.payoutCalls()).toEqual(['/payments', '/payments', '/payments/PAY-3001']);
    expect(steadfast.calls.map((call) => call.path)).toEqual([
      '/payments',
      '/payments',
      '/payments/PAY-3001',
    ]);
    expect((await read(to.shop, order.id)).parcel).toMatchObject({ payoutId: 'PAY-3001' });
    // Page 1 was followed by more, so it was full: 8 to a page, and tomorrow starts on page 2.
    expect(await pageOf(to.shop.tenantId)).toEqual({ page: 2, size: 8 });

    const next = await delivered(to, variant);
    steadfast.pay('PAY-3002', [paidOf(next)], SOON());
    await night();
    expect(steadfast.payoutCalls()).toEqual(['/payments', '/payments/PAY-3002']);
    expect(steadfast.calls.filter((call) => call.path === '/payments').length).toBe(1);
    expect((await read(to.shop, next.id)).parcel).toMatchObject({ payoutId: 'PAY-3002' });
    expect(await pageOf(to.shop.tenantId)).toEqual({ page: 2, size: 8 });
  });

  it('starts again from the first page when the one it stopped at is empty', async () => {
    const to = await connected();
    const variant = await lamp(to.shop);
    const order = await delivered(to, variant);
    await admin.query(
      'UPDATE tenant.courier_connections SET payout_page = 5 WHERE tenant_id = $1',
      [to.shop.tenantId],
    );
    steadfast.pay('PAY-4001', [paidOf(order)], SOON());
    await night();
    expect(steadfast.payoutCalls()).toEqual(['/payments']);
    expect(await pageOf(to.shop.tenantId)).toEqual({ page: 1, size: null });
    await night();
    expect(steadfast.payoutCalls()).toEqual(['/payments', '/payments/PAY-4001']);
    expect((await read(to.shop, order.id)).parcel).toMatchObject({ payoutId: 'PAY-4001' });
  });

  it('leaves a payout not yet paid to be read again once it is, holding its page', async () => {
    const to = await connected();
    const variant = await lamp(to.shop);
    const order = await delivered(to, variant);
    const later = await delivered(to, variant);
    const payout = steadfast.pay('PAY-5001', [paidOf(order)], SOON(), {
      status_label: 'processing',
      paid_at: null,
    });
    for (let n = 0; n < 7; n += 1) steadfast.pay(`OLD-${String(n)}`, [], LONG_AGO);
    steadfast.pay('PAY-5002', [paidOf(later)], SOON());
    await night();
    expect(steadfast.payoutCalls()).toEqual(['/payments', '/payments', '/payments/PAY-5002']);
    expect((await read(to.shop, order.id)).parcel).toMatchObject({ paidAt: null, payoutId: null });
    expect((await read(to.shop, later.id)).parcel).toMatchObject({ payoutId: 'PAY-5002' });
    // Page 1 still holds a payout being made up, so tomorrow starts there, not on page 2.
    expect(await pageOf(to.shop.tenantId)).toEqual({ page: 1, size: 8 });

    payout.status_label = 'paid';
    payout.paid_at = payout.created_at;
    await night();
    expect(steadfast.payoutCalls()).toEqual(['/payments', '/payments/PAY-5001', '/payments']);
    expect((await read(to.shop, order.id)).parcel).toMatchObject({ payoutId: 'PAY-5001' });
    expect(await pageOf(to.shop.tenantId)).toEqual({ page: 2, size: 8 });
  });

  it('matches a parcel by our number only where it never learned the courier’s, and fills that in', async () => {
    const to = await connected();
    const variant = await lamp(to.shop);
    const lost = await delivered(to, variant);
    const other = await delivered(to, variant);
    // As if its booking's answer were lost and found again by our number (D6-11).
    await admin.query(
      'UPDATE tenant.courier_parcels SET consignment_id = NULL WHERE order_id = $1',
      [lost.id],
    );
    steadfast.pay(
      'PAY-6001',
      [
        { consignmentId: 7770001, invoice: lost.orderNumber },
        // Our number on another parcel of the courier's: not ours.
        { consignmentId: 7770002, invoice: other.orderNumber },
      ],
      SOON(),
    );
    await night();
    expect((await read(to.shop, lost.id)).parcel).toMatchObject({
      consignmentId: '7770001',
      payoutId: 'PAY-6001',
    });
    expect((await read(to.shop, other.id)).parcel).toMatchObject({
      consignmentId: other.parcel?.consignmentId,
      payoutId: null,
    });
    const { payouts } = (await to.shop.get('/couriers/payouts')).body as { payouts: Payout[] };
    expect(payouts[0]).toMatchObject({ parcels: 2, ours: 1 });
  });

  it('stops a shop’s read when Steadfast doesn’t answer, and reads it the next night', async () => {
    const to = await connected();
    const variant = await lamp(to.shop);
    const order = await delivered(to, variant);
    steadfast.pay('PAY-7001', [paidOf(order)], SOON());
    steadfast.behaviour = { payoutsTimeOut: true };
    await night();
    expect(steadfast.payoutCalls()).toEqual(['/payments']);
    expect((await read(to.shop, order.id)).parcel).toMatchObject({ payoutId: null });
    steadfast.behaviour = {};
    await night();
    expect((await read(to.shop, order.id)).parcel).toMatchObject({ payoutId: 'PAY-7001' });
  });

  it('asks nothing for a lapsed shop', async () => {
    const to = await connected();
    const variant = await lamp(to.shop);
    const order = await delivered(to, variant);
    steadfast.pay('PAY-8001', [paidOf(order)], SOON());
    await admin.query("UPDATE control.tenants SET state = 'read_only' WHERE id = $1", [
      to.shop.tenantId,
    ]);
    await night();
    expect(steadfast.payoutCalls()).toEqual([]);
  });

  it('shows a shop only its own payouts, to whoever may read payments', async () => {
    const to = await connected();
    const variant = await lamp(to.shop);
    const order = await delivered(to, variant);
    steadfast.pay('PAY-9001', [paidOf(order)], SOON());
    await night();
    const { payouts } = (await to.shop.get('/couriers/payouts')).body as { payouts: Payout[] };
    const id = payouts[0]?.id ?? '';

    const stranger = await openShop(port, texts, 'cmo');
    expect(((await stranger.get('/couriers/payouts')).body as { total: number }).total).toBe(0);
    expect((await stranger.get(`/couriers/payouts/${id}`)).status).toBe(404);
    expect((await to.shop.get('/couriers/payouts/not-an-id')).status).toBe(404);
    expect((await to.shop.get(`/couriers/payouts/${randomUUID()}`)).status).toBe(404);
    expect((await to.shop.get('/couriers/payouts?courierKey=pathao')).body).toMatchObject({
      total: 0,
    });

    // Whoever books and reads orders still can't see what couriers paid without payments:read.
    const packer = await staffWith(port, texts, admin, to.shop, ['orders:read', 'orders:manage']);
    expect((await getJson(port, '/couriers/payouts', packer)).status).toBe(403);
    expect((await getJson(port, `/couriers/payouts/${id}`, packer)).status).toBe(403);
  });
});

describeIfDatabase('a shop’s payouts go with it at day 60 (LIF-19)', () => {
  it('clears its payouts with its other courier records', async () => {
    const to = await connected();
    const variant = await lamp(to.shop);
    const order = await delivered(to, variant);
    steadfast.pay('PAY-11001', [paidOf(order)], SOON());
    await night();
    const count = async (): Promise<number> => {
      const { rows } = await admin.query<{ total: string }>(
        'SELECT count(*)::text AS total FROM tenant.courier_payouts WHERE tenant_id = $1',
        [to.shop.tenantId],
      );
      return Number(rows[0]?.total);
    };
    expect(await count()).toBe(1);
    await app.get(CourierConnections).deleteAllForTenant(to.shop.tenantId);
    expect(await count()).toBe(0);
  });
});

describeIfDatabase('being paid is the payout’s news, not the parcel’s journey (CRR-12)', () => {
  it('keeps a paid parcel’s news list to its journey', async () => {
    const to = await connected();
    const variant = await lamp(to.shop);
    const order = await delivered(to, variant);
    steadfast.pay('PAY-10001', [paidOf(order)], SOON());
    await night();
    const parcel = (await read(to.shop, order.id)).parcel;
    expect(parcel?.news.map((each) => each.rawStatus)).toEqual(['delivered', 'pending']);
  });
});

describeIfDatabase('the sales figures name couriers’ charges (CRR-17, INV-18)', () => {
  it('shows what couriers charged beside the delivery charges, counts the orders with none, and leaves profit alone', async () => {
    const to = await connected();
    const { shop } = to;
    const variant = await lamp(shop);
    await delivered(to, variant, 60);
    await delivered(to, variant, 75);
    await delivered(to, variant, null);
    // Delivered by hand, with no courier booked: no courier charge to know.
    const byHand = await place(shop, variant);
    const handShipped = await shop.post(`/orders/${byHand.id}/ship`, {
      courierName: 'Own rider',
      trackingCode: 'OWN-1',
    });
    expect(handShipped.status, JSON.stringify(handShipped.body)).toBe(200);
    const handDelivered = await shop.post(`/orders/${byHand.id}/deliver`, {});
    expect(handDelivered.status, JSON.stringify(handDelivered.body)).toBe(200);
    // Booked and on its way: not counted until delivered.
    await booked(to, variant);

    const sales = await shop.get('/sales?bucket=month');
    expect(sales.status, JSON.stringify(sales.body)).toBe(200);
    const { totals } = sales.body as {
      totals: {
        orders: number;
        revenue: string;
        courierCharges: string | null;
        unknownCourierCharges: number | null;
        profit?: { revenueLessTax: string; costOfGoods: string; profit: string };
      };
    };
    expect(totals).toMatchObject({ orders: 4, courierCharges: '135.00', unknownCourierCharges: 1 });
    // Profit is the items less their tax and cost, as before: delivery stays out of it both ways.
    expect(totals.profit).toMatchObject({
      revenueLessTax: '2000.00',
      costOfGoods: '800.00',
      profit: '1200.00',
    });

    const one = await shop.get(`/sales?bucket=month&productId=${lastProductId}`);
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    expect((one.body as { totals: object }).totals).toMatchObject({
      courierCharges: null,
      unknownCourierCharges: null,
    });
  });
});
