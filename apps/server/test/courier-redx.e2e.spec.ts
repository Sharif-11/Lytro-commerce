import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { DAY_MS } from '../src/common/time';
import type {
  ConnectionTroubleNotice,
  ParcelAttentionNotice,
  ParcelMovedNotice,
} from '../src/modules/couriers/ports/courier-notifier';
import { CourierChecks } from '../src/modules/couriers/services/courier-checks';
import {
  COURIER_CLOCK,
  COURIER_FETCH,
  COURIER_NOTIFIER,
  COURIER_PAUSE,
} from '../src/modules/couriers/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { CourierAreasTickWorker } from '../src/modules/shared/queue-workers/services/courier-areas-tick-worker';
import { CourierBookingTickWorker } from '../src/modules/shared/queue-workers/services/courier-booking-tick-worker';
import { CourierNightTickWorker } from '../src/modules/shared/queue-workers/services/courier-night-tick-worker';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import {
  FakeRedx,
  REDX_LYTRO_TOKEN,
  REDX_SHOP_TOKEN,
  freshRedxToken,
  type FakeRedxArea,
} from './support/fake-redx';
import {
  GOLDEN_WAYS,
  payAsYouGo as payAsYouGoPlan,
  walkGoldenPath,
  type GoldenOrder,
  type GoldenWay,
} from './support/courier-golden-path';
import { cookieFrom, getJson, postJson, putJson, type HttpResult } from './support/http';
import { errorOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 6 Slice 6.4, read agreed 2026-11-06: RedX and its areas, through the real routes and database, with a fake built from its document
// and what its sandbox showed: the area list read with Lytro's own token, matched to thanas and placed by the operator; booking with one
// of its areas, picked by itself in one case only; its cancel call; and its unsigned, two-language news. Runs only with
// DATABASE_TEST_ADMIN_URL.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_courier_redx_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 40_000 });
const PASSWORD = 'redx-operator-9';

let app: INestApplication;
let port: number;
let admin: pg.Client;
let clockShift = 0;
let operator: Record<string, string> = {};
const redx = new FakeRedx();
const texts = new SmsCapture();
const attention: ParcelAttentionNotice[] = [];
const moved: ParcelMovedNotice[] = [];
const trouble: ConnectionTroubleNotice[] = [];

// Where the areas sit: Mirpur has two named after it, Banani only a suggestion, Chitalmari one named after it, Shyamoli none.
const AREAS: FakeRedxArea[] = [
  {
    id: 101,
    name: 'Mirpur 1',
    post_code: 1216,
    district_name: 'Dhaka',
    division_name: 'Dhaka',
    zone_id: 1,
  },
  {
    id: 110,
    name: 'Mirpur 10',
    post_code: 1216,
    district_name: 'Dhaka',
    division_name: 'Dhaka',
    zone_id: 1,
  },
  {
    id: 120,
    name: 'Kakoli(Banani)',
    post_code: 1213,
    district_name: 'Dhaka',
    division_name: 'Dhaka',
    zone_id: 1,
  },
  {
    id: 130,
    name: 'Shyamoli(Dhaka)',
    post_code: 1207,
    district_name: 'Dhaka',
    division_name: 'Dhaka',
    zone_id: 1,
  },
  {
    id: 140,
    name: 'Chitalmari',
    post_code: null,
    district_name: 'Bagerhat',
    division_name: 'Khulna',
    zone_id: 4,
  },
  {
    id: 150,
    name: 'Agrabad (Chittagong)',
    post_code: 4100,
    district_name: 'Chittagong',
    division_name: 'Chittagong',
    zone_id: 2,
  },
];

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'courier-redx-e2e-otp-secret-0123456789012345';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['REDX_AREAS_TOKEN'] = REDX_LYTRO_TOKEN;
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(COURIER_FETCH)
    .useValue(redx.fetch)
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
  operator = await operatorHeaders();
  redx.areas = AREAS.map((area) => ({ ...area }));
  const refreshed = await postJson(
    port,
    '/operator/courier-areas/refresh',
    { courierKey: 'redx' },
    operator,
  );
  expect(refreshed.status, JSON.stringify(refreshed.body)).toBe(200);
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

beforeEach(async () => {
  clockShift = 0;
  redx.reset();
  redx.areas = AREAS.map((area) => ({ ...area }));
  attention.length = 0;
  moved.length = 0;
  trouble.length = 0;
  if (!ADMIN_URL) return;
  await admin.query(
    'UPDATE tenant.courier_parcels SET checks_stopped_at = now() WHERE checks_stopped_at IS NULL',
  );
  await admin.query('UPDATE tenant.courier_events SET applied_at = now() WHERE applied_at IS NULL');
});

async function operatorHeaders(): Promise<Record<string, string>> {
  const email = `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
  await admin.query(
    'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2)',
    [email, await hash(PASSWORD, 12)],
  );
  const signedIn = await postJson(port, '/auth/operator/signin', { email, password: PASSWORD });
  expect(signedIn.status, JSON.stringify(signedIn.body)).toBeLessThan(300);
  const code = await generate({ secret: (signedIn.body as { secret: string }).secret });
  const enrolled = await postJson(port, '/auth/operator/enroll', {
    email,
    password: PASSWORD,
    code,
  });
  return {
    cookie: cookieFrom(enrolled),
    'x-csrf-token': (enrolled.body as { csrfToken: string }).csrfToken,
  };
}

interface Area {
  id: string;
  areaCode: string;
  name: string;
  thanaId: number | null;
  suggestedThanaId: number | null;
  match: string;
  retiredAt: string | null;
}

interface Order {
  id: string;
  orderNumber: string;
  fulfillmentStatus: string;
  paymentStatus: string;
  status: string;
  due: string;
  parcel: {
    state: string;
    consignmentId: string | null;
    reading: string | null;
    areaCode: string | null;
    paidAt: string | null;
    payoutId: string | null;
    news: { rawStatus: string | null; message: { en: string | null; bn: string | null } }[];
  } | null;
  payments: { amount: string }[];
}

let places: Record<string, number> | null = null;
async function thanas(shop: ShopClient): Promise<Record<string, number>> {
  if (places) return places;
  const { zillas } = (await shop.get('/locations')).body as {
    zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
  };
  const find = (zilla: string, thana: string): number => {
    const found = zillas
      .find((row) => row.nameEn === zilla)
      ?.thanas.find((row) => row.nameEn === thana);
    if (!found) throw new Error(`no thana ${zilla}/${thana}`);
    return found.id;
  };
  places = {
    mirpur: find('Dhaka', 'Mirpur'),
    banani: find('Dhaka', 'Banani'),
    gulshan: find('Dhaka', 'Gulshan'),
    chitalmari: find('Bagerhat', 'Chitalmari'),
  };
  return places;
}

async function areas(state?: string, q?: string): Promise<Area[]> {
  const query = new URLSearchParams({ courierKey: 'redx', limit: '200' });
  if (state) query.set('state', state);
  if (q) query.set('q', q);
  const listed = await getJson(port, `/operator/courier-areas?${query.toString()}`, operator);
  expect(listed.status, JSON.stringify(listed.body)).toBe(200);
  return (listed.body as { areas: Area[] }).areas;
}

async function areaNamed(name: string): Promise<Area> {
  const found = (await areas(undefined, name)).find((area) => area.name === name);
  if (!found) throw new Error(`no area ${name}`);
  return found;
}

async function connectedShop(): Promise<ShopClient> {
  const shop = await openShop(port, texts, 'crx');
  await seedBalance(admin, shop.tenantId, '500.00');
  const made = await shop.post('/couriers/connections', {
    courierKey: 'redx',
    credentials: { apiToken: freshRedxToken() },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  redx.calls.length = 0;
  return shop;
}

async function variant(shop: ShopClient, price = 300): Promise<string> {
  const made = await shop.post('/products', {
    name: 'Lamp',
    basePrice: price,
    variants: [{ optionIds: [], openingStock: 50 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '';
}

async function place(shop: ShopClient, locationId: number, variantId: string): Promise<Order> {
  const made = await postJson(
    port,
    '/orders',
    {
      customerName: 'Rahima Akter',
      phone: `017${String(randomInt(10_000_000, 99_999_999))}`,
      locationId,
      deliveryAddress: 'House 12, Road 3',
      items: [{ variantId, quantity: 1 }],
    },
    shop.headers({ 'idempotency-key': randomUUID() }),
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as Order;
}

function book(
  shop: ShopClient,
  order: { id: string },
  extra: Record<string, unknown> = {},
): Promise<HttpResult> {
  return shop.post(`/orders/${order.id}/book`, { courierKey: 'redx', weightKg: 1.25, ...extra });
}

async function booked(
  shop: ShopClient,
  order: { id: string },
  extra: Record<string, unknown> = {},
): Promise<Order> {
  const answered = await book(shop, order, extra);
  expect(answered.status, JSON.stringify(answered.body)).toBe(200);
  return answered.body as Order;
}

async function read(shop: ShopClient, orderId: string): Promise<Order> {
  return (await shop.get(`/orders/${orderId}`)).body as Order;
}

async function addressOf(shop: ShopClient): Promise<string> {
  const shown = await shop.get('/couriers/connections/redx/address');
  const { pathname } = new URL((shown.body as { address: string }).address);
  return pathname.replace('/api/v1', '');
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

let tick = 0;
async function send(
  shop: ShopClient,
  order: Order,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  tick += 1;
  const answered = await postJson(
    port,
    await addressOf(shop),
    {
      tracking_number: order.parcel?.consignmentId,
      timestamp: new Date(Date.UTC(2026, 10, 7, 0, 0, tick)).toISOString(),
      status,
      message_en: `Parcel is ${status}.`,
      message_bn: `পার্সেল ${status}।`,
      invoice_number: order.orderNumber,
      delivery_type: 'regular',
      ...extra,
    },
    { host: 'localhost' },
  );
  expect(answered.status, JSON.stringify(answered.body)).toBe(202);
  await applied(shop.tenantId);
}

describeIfDatabase('RedX’s area list (CUS-10, read agreed 2026-11-06)', () => {
  it('is read with Lytro’s own token, and matched: own names count, brackets are suggestions', async () => {
    const shop = await openShop(port, texts, 'crx');
    const at = await thanas(shop);
    expect((await areaNamed('Mirpur 10')).thanaId).toBe(at['mirpur']);
    expect(await areaNamed('Mirpur 10')).toMatchObject({ match: 'own_name' });
    expect(await areaNamed('Kakoli(Banani)')).toMatchObject({
      match: 'suggested',
      thanaId: null,
      suggestedThanaId: at['banani'],
    });
    expect(await areaNamed('Shyamoli(Dhaka)')).toMatchObject({ match: 'none', thanaId: null });
    expect((await areas('suggested')).map((area) => area.name)).toContain('Kakoli(Banani)');
    expect((await areas('unassigned')).map((area) => area.name)).toContain('Shyamoli(Dhaka)');

    redx.calls.length = 0;
    await app.get(CourierAreasTickWorker).run();
    expect(redx.areaCalls().map((call) => call.token)).toEqual([REDX_LYTRO_TOKEN]);
  });

  it('retires an area it stops listing, renames one, keeps what the operator placed, and brings one back', async () => {
    const shop = await openShop(port, texts, 'crx');
    const at = await thanas(shop);
    const shyamoli = await areaNamed('Shyamoli(Dhaka)');
    const placed = await putJson(
      port,
      `/operator/courier-areas/${shyamoli.id}`,
      { thanaId: at['gulshan'] },
      operator,
    );
    expect(placed.status, JSON.stringify(placed.body)).toBe(200);

    redx.areas = AREAS.filter((area) => area.id !== 120).map((area) =>
      area.id === 130 ? { ...area, name: 'Shyamoli' } : { ...area },
    );
    const again = await postJson(
      port,
      '/operator/courier-areas/refresh',
      { courierKey: 'redx' },
      operator,
    );
    expect(again.body).toMatchObject({ listed: 5, added: 0, renamed: 1, retired: 1 });
    expect((await areas('retired')).map((area) => area.name)).toEqual(['Kakoli(Banani)']);
    expect(await areaNamed('Shyamoli')).toMatchObject({
      thanaId: at['gulshan'],
      match: 'operator',
    });

    redx.areas = AREAS.map((area) => ({ ...area }));
    const back = await postJson(
      port,
      '/operator/courier-areas/refresh',
      { courierKey: 'redx' },
      operator,
    );
    expect(back.body).toMatchObject({ back: 1, retired: 0 });
    expect(await areaNamed('Shyamoli(Dhaka)')).toMatchObject({
      thanaId: at['gulshan'],
      match: 'operator',
    });
    const undone = await putJson(
      port,
      `/operator/courier-areas/${shyamoli.id}`,
      { thanaId: null },
      operator,
    );
    expect(undone.body).toMatchObject({ thanaId: null, match: 'none' });
  });

  it('refuses an empty list, changing nothing', async () => {
    redx.behaviour = { emptyAreas: true };
    const refused = await postJson(
      port,
      '/operator/courier-areas/refresh',
      { courierKey: 'redx' },
      operator,
    );
    expect(refused.status).toBe(409);
    expect(await areas('retired')).toHaveLength(0);
  });

  it('confirms suggestions many at a time, and records who did each thing', async () => {
    const kakoli = await areaNamed('Kakoli(Banani)');
    const confirmed = await postJson(
      port,
      '/operator/courier-areas/confirm',
      { ids: [kakoli.id] },
      operator,
    );
    expect(confirmed.body).toEqual({ confirmed: 1 });
    expect(await areaNamed('Kakoli(Banani)')).toMatchObject({
      match: 'operator',
      thanaId: kakoli.suggestedThanaId,
    });
    const twice = await postJson(
      port,
      '/operator/courier-areas/confirm',
      { ids: [kakoli.id] },
      operator,
    );
    expect(twice.body).toEqual({ confirmed: 0 });
    const { rows } = await admin.query<{ action: string }>(
      "SELECT DISTINCT action FROM control.platform_audit_log WHERE action LIKE 'courier_area%' ORDER BY action",
    );
    expect(rows.map((row) => row.action)).toEqual([
      'courier_area_assigned',
      'courier_areas_confirmed',
      'courier_areas_refreshed',
    ]);
    // Put it back as a suggestion, for the booking cases.
    await admin.query(
      "UPDATE control.courier_areas SET match = 'suggested', suggested_thana_id = thana_id, thana_id = NULL WHERE id = $1",
      [kakoli.id],
    );
  });

  it('is only for the operator', async () => {
    expect((await getJson(port, '/operator/courier-areas?courierKey=redx')).status).toBe(401);
  });
});

describeIfDatabase('booking with RedX (CUS-12, CRR-10, read agreed 2026-11-06)', () => {
  it('asks staff to choose where the thana has several, offering the thana’s areas first', async () => {
    const shop = await connectedShop();
    const at = await thanas(shop);
    const order = await place(shop, at['mirpur'] ?? 0, await variant(shop));
    const refused = await book(shop, order);
    expect(refused.status).toBe(409);
    expect(errorOf(refused).details).toMatchObject({ courierKey: 'redx' });
    expect(redx.bookings()).toHaveLength(0);
    expect((await read(shop, order.id)).parcel).toBeNull();

    const choices = await shop.get(`/couriers/redx/areas?orderId=${order.id}`);
    expect(choices.body).toEqual({
      thana: [
        { areaCode: '101', name: 'Mirpur 1', suggested: false },
        { areaCode: '110', name: 'Mirpur 10', suggested: false },
      ],
      zilla: [
        { areaCode: '120', name: 'Kakoli(Banani)', suggested: true },
        { areaCode: '130', name: 'Shyamoli(Dhaka)', suggested: false },
      ],
    });
  });

  it('books with the chosen area, weight in grams, the goods’ worth and the exact cash', async () => {
    const shop = await connectedShop();
    const at = await thanas(shop);
    const order = await booked(shop, await place(shop, at['mirpur'] ?? 0, await variant(shop)), {
      areaCode: '110',
    });
    expect(order.parcel).toMatchObject({ state: 'booked', areaCode: '110' });
    expect(redx.bookings()[0]?.body).toMatchObject({
      delivery_area: 'Mirpur 10',
      delivery_area_id: 110,
      parcel_weight: 1250,
      value: 300,
      cash_collection_amount: order.due,
      pickup_store_id: 1,
      merchant_invoice_id: order.orderNumber,
    });
    expect(redx.bookings()[0]?.token).toMatch(new RegExp(`^${REDX_SHOP_TOKEN}-`));
  });

  it('offers a thana’s suggested areas first, marked as suggestions', async () => {
    const shop = await connectedShop();
    const at = await thanas(shop);
    const order = await place(shop, at['banani'] ?? 0, await variant(shop));
    const choices = await shop.get(`/couriers/redx/areas?orderId=${order.id}&q=Mirpur`);
    expect(choices.body).toEqual({
      thana: [{ areaCode: '120', name: 'Kakoli(Banani)', suggested: true }],
      zilla: [
        { areaCode: '101', name: 'Mirpur 1', suggested: false },
        { areaCode: '110', name: 'Mirpur 10', suggested: false },
      ],
    });
  });

  it('picks the area by itself only where the thana’s one area is named after it', async () => {
    const shop = await connectedShop();
    const at = await thanas(shop);
    const lamp = await variant(shop);
    const rural = await booked(shop, await place(shop, at['chitalmari'] ?? 0, lamp));
    expect(rural.parcel?.areaCode).toBe('140');
    const suggestedOnly = await book(shop, await place(shop, at['banani'] ?? 0, lamp));
    expect(suggestedOnly.status).toBe(409);
  });

  it('refuses an area from another zilla, a retired one, or one it doesn’t have', async () => {
    const shop = await connectedShop();
    const at = await thanas(shop);
    const lamp = await variant(shop);
    const order = await place(shop, at['mirpur'] ?? 0, lamp);
    expect((await book(shop, order, { areaCode: '150' })).status).toBe(409);
    expect((await book(shop, order, { areaCode: '999' })).status).toBe(409);
    await admin.query(
      "UPDATE control.courier_areas SET retired_at = now() WHERE area_code = '101'",
    );
    try {
      expect((await book(shop, order, { areaCode: '101' })).status).toBe(409);
    } finally {
      await admin.query(
        "UPDATE control.courier_areas SET retired_at = NULL WHERE area_code = '101'",
      );
    }
    expect(redx.bookings()).toHaveLength(0);
  });

  it('changes no address data: the location list and the order’s address stay as they were (CUS-11, close-out)', async () => {
    const shop = await connectedShop();
    const at = await thanas(shop);
    const before = (await shop.get('/locations')).body;
    const placed = (await place(shop, at['mirpur'] ?? 0, await variant(shop))) as unknown as Record<
      string,
      unknown
    >;
    const refreshed = await postJson(
      port,
      '/operator/courier-areas/refresh',
      { courierKey: 'redx' },
      operator,
    );
    expect(refreshed.status, JSON.stringify(refreshed.body)).toBe(200);
    const order = await booked(shop, { id: String(placed['id']) }, { areaCode: '110' });
    expect((await shop.get('/locations')).body).toEqual(before);
    const after = (await shop.get(`/orders/${order.id}`)).body as Record<string, unknown>;
    for (const field of ['location', 'deliveryAddress', 'deliveryCharge', 'deliveryZone']) {
      expect(after[field], field).toEqual(placed[field]);
    }
  });

  it('never waits on a store: with several and none chosen, its own default is used', async () => {
    redx.stores.push({
      id: 2,
      name: 'Uttara',
      address: 'Uttara',
      area_name: 'Uttara',
      area_id: 1,
      phone: '8801700000000',
    });
    const shop = await connectedShop();
    const at = await thanas(shop);
    await booked(shop, await place(shop, at['mirpur'] ?? 0, await variant(shop)), {
      areaCode: '110',
    });
    expect(redx.bookings()[0]?.body).not.toHaveProperty('pickup_store_id');
  });
});

describeIfDatabase('cancelling a RedX booking (D6-8, CRR-28, read agreed 2026-11-06)', () => {
  it('cancels at RedX on a clear yes', async () => {
    const shop = await connectedShop();
    const at = await thanas(shop);
    const order = await booked(shop, await place(shop, at['mirpur'] ?? 0, await variant(shop)), {
      areaCode: '110',
    });
    const cancelled = await shop.post(`/orders/${order.id}/parcel/cancel`, {});
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect(redx.cancels()).toHaveLength(1);
    expect((cancelled.body as Order).parcel?.state).toBe('cancelled');
    expect(redx.parcels[0]?.status).toBe('cancelled');
  });

  it('treats a 503 saying success, as its sandbox answers, as no answer: staff confirm in its panel', async () => {
    const shop = await connectedShop();
    const at = await thanas(shop);
    const order = await booked(shop, await place(shop, at['mirpur'] ?? 0, await variant(shop)), {
      areaCode: '110',
    });
    redx.behaviour = { cancel: 'sandbox' };
    const unclear = await shop.post(`/orders/${order.id}/parcel/cancel`, {});
    expect(unclear.status).toBe(409);
    expect(errorOf(unclear).details).toMatchObject({
      courierKey: 'redx',
      courierNotAnswering: true,
    });
    expect((await read(shop, order.id)).parcel?.state).toBe('booked');
    const confirmed = await shop.post(`/orders/${order.id}/parcel/cancel`, {
      courierCancelled: true,
    });
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
  });

  it('keeps the booking when RedX refuses, in its words', async () => {
    const shop = await connectedShop();
    const at = await thanas(shop);
    const order = await booked(shop, await place(shop, at['mirpur'] ?? 0, await variant(shop)), {
      areaCode: '110',
    });
    redx.behaviour = { cancel: 'refused' };
    const refused = await shop.post(`/orders/${order.id}/parcel/cancel`, {});
    expect(refused.status).toBe(409);
    expect(errorOf(refused).message).toContain('Parcel can not be cancelled now');
    expect((await read(shop, order.id)).parcel?.state).toBe('booked');
  });

  it('takes staff’s word that it is cancelled in RedX’s panel, asking RedX nothing (agreed 2026-11-07)', async () => {
    const shop = await connectedShop();
    const at = await thanas(shop);
    const order = await booked(shop, await place(shop, at['mirpur'] ?? 0, await variant(shop)), {
      areaCode: '110',
    });
    redx.behaviour = { cancel: 'refused' };
    redx.calls.length = 0;
    const cancelled = await shop.post(`/orders/${order.id}/parcel/cancel`, {
      courierCancelled: true,
    });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect((cancelled.body as Order).parcel?.state).toBe('cancelled');
    expect(redx.cancels()).toEqual([]);
  });
});

describeIfDatabase('RedX’s news (CRR-11 to CRR-13, CRR-29, read agreed 2026-11-06)', () => {
  it('moves an order on its word alone, keeping both languages', async () => {
    const shop = await connectedShop();
    const at = await thanas(shop);
    const order = await booked(shop, await place(shop, at['mirpur'] ?? 0, await variant(shop)), {
      areaCode: '110',
    });
    await send(shop, order, 'pickup-pending');
    expect((await read(shop, order.id)).fulfillmentStatus).toBe('processing');
    await send(shop, order, 'ready-for-delivery');
    const shipped = await read(shop, order.id);
    expect(shipped.fulfillmentStatus).toBe('shipped');
    expect(
      shipped.parcel?.news.find((each) => each.rawStatus === 'ready_for_delivery')?.message,
    ).toMatchObject({
      en: 'Parcel is ready-for-delivery.',
      bn: 'পার্সেল ready-for-delivery।',
    });
    await send(shop, order, 'delivered');
    const done = await read(shop, order.id);
    expect(done.fulfillmentStatus).toBe('delivered');
    expect(done.paymentStatus).toBe('paid');
  });

  it('marks a part delivery partly delivered, records no cash by itself, and tells staff', async () => {
    const shop = await connectedShop();
    const at = await thanas(shop);
    const order = await booked(shop, await place(shop, at['mirpur'] ?? 0, await variant(shop)), {
      areaCode: '110',
    });
    await send(shop, order, 'ready-for-delivery');
    await send(shop, order, 'delivered', { delivery_type: 'partial-delivery' });
    const after = await read(shop, order.id);
    expect(after.fulfillmentStatus).toBe('partially_delivered');
    expect(after.payments).toHaveLength(0);
    expect(moved.map((notice) => notice.reading)).toEqual(['with_courier', 'partly_delivered']);
  });

  it('marks the parcel paid with no amount or payout, and moves nothing else (CRR-12, CRR-17)', async () => {
    const shop = await connectedShop();
    const at = await thanas(shop);
    const order = await booked(shop, await place(shop, at['mirpur'] ?? 0, await variant(shop)), {
      areaCode: '110',
    });
    await send(shop, order, 'ready-for-delivery');
    await send(shop, order, 'paid');
    const after = await read(shop, order.id);
    expect(after.fulfillmentStatus).toBe('shipped');
    expect(after.parcel?.paidAt).not.toBeNull();
    expect(after.parcel?.payoutId).toBeNull();
    // Its words about being paid stay off the parcel's journey.
    expect(after.parcel?.news.map((each) => each.message.en)).toEqual([
      'Parcel is ready-for-delivery.',
    ]);
  });

  it('brings the status by the night check, from its parcel details', async () => {
    const shop = await connectedShop();
    const at = await thanas(shop);
    const order = await booked(shop, await place(shop, at['mirpur'] ?? 0, await variant(shop)), {
      areaCode: '110',
    });
    const parcel = redx.parcels.find((each) => each.trackingId === order.parcel?.consignmentId);
    if (!parcel) throw new Error('no parcel');
    parcel.status = 'delivered';
    clockShift = 2 * DAY_MS;
    await app.get(CourierChecks).runNight();
    expect((await read(shop, order.id)).fulfillmentStatus).toBe('delivered');
  });

  it('never writes the address’s token to a log', async () => {
    const shop = await connectedShop();
    const at = await thanas(shop);
    const order = await booked(shop, await place(shop, at['mirpur'] ?? 0, await variant(shop)), {
      areaCode: '110',
    });
    const address = await addressOf(shop);
    const token = address.split('/').at(-1) ?? '';
    expect(token.length).toBeGreaterThan(20);
    // Every way a line can be logged: the server's logger (switched off in tests, so watched where it is called) and the streams.
    const written: string[] = [];
    const watched = (['log', 'warn', 'error', 'debug', 'verbose', 'fatal'] as const).map((level) =>
      vi.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        written.push(
          args
            .map((arg) =>
              arg instanceof Error ? `${arg.message} ${arg.stack ?? ''}` : String(arg),
            )
            .join(' '),
        );
      }),
    );
    const streams = [process.stdout, process.stderr].map((stream) =>
      vi.spyOn(stream, 'write').mockImplementation((chunk: unknown) => {
        written.push(String(chunk));
        return true;
      }),
    );
    try {
      await send(shop, order, 'not-a-status-it-knows');
      await postJson(port, address, 'not json', { host: 'localhost' });
    } finally {
      for (const spy of [...watched, ...streams]) spy.mockRestore();
    }
    expect(written.length).toBeGreaterThan(0);
    expect(written.join('')).not.toContain(token);
  });
});

describeIfDatabase('the golden path with RedX, three ways (exit criterion 2)', () => {
  function news(shop: ShopClient) {
    return async (order: GoldenOrder, stage: 'shipped' | 'delivered', way: GoldenWay) => {
      const status = stage === 'shipped' ? 'ready-for-delivery' : 'delivered';
      if (way === 'by message') {
        await send(shop, order as unknown as Order, status);
        return;
      }
      const parcel = redx.parcels.find((each) => each.trackingId === order.parcel?.consignmentId);
      if (!parcel) throw new Error('no parcel');
      parcel.status = status;
      if (way === 'by the night check alone') {
        clockShift += 2 * DAY_MS;
        await app.get(CourierChecks).runNight();
        return;
      }
      clockShift += DAY_MS;
      const synced = await shop.post(`/orders/${order.id}/parcel/sync`, {});
      expect(synced.status, JSON.stringify(synced.body)).toBe(200);
    };
  }

  it.each(GOLDEN_WAYS)(
    'takes a pay-as-you-go order from its confirming call to delivered %s',
    async (way) => {
      const shop = await connectedShop();
      await payAsYouGoPlan(admin, shop.tenantId);
      const at = await thanas(shop);
      await walkGoldenPath(
        shop,
        {
          port,
          admin,
          locationId: at['mirpur'] ?? 0,
          booking: { courierKey: 'redx', weightKg: 1.25, areaCode: '110' },
          news: news(shop),
        },
        way,
      );
      expect(moved.map((notice) => notice.reading)).toEqual(['with_courier', 'delivered']);
    },
  );
});
