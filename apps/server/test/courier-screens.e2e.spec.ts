import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app/app.module';
import {
  COURIER_AREA_TOKENS,
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
import { prepareTestDatabase } from './support/database';
import { FakeSteadfast, RIGHT_API_KEY, RIGHT_SECRET_KEY } from './support/fake-steadfast';
import { cookieFrom, getJson, postJson, type HttpResult } from './support/http';
import { errorOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 6 Slice 6.7's build, read agreed 2026-11-06: what the screens read that the server didn't yet give. Each order row's live
// parcel and Needs a look with its filter; Mark as seen; the night check's missed messages on a connection; the operator's area
// counts, last read and token; the thanas for placing an area; and the order's number in a shop's courier key log. Runs only with
// DATABASE_TEST_ADMIN_URL.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_courier_screens_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 60_000 });

const PASSWORD = 'screens-operator-9';
let app: INestApplication;
let port: number;
let admin: pg.Client;
let operator: Record<string, string> = {};
const steadfast = new FakeSteadfast();
const texts = new SmsCapture();
// Lytro's own area token, which a test takes away to see the console say so.
const areaTokens: Record<string, string> = {};

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'courier-screens-e2e-otp-secret-01234567890123';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(COURIER_FETCH)
    .useValue((input: string | URL | Request, init?: RequestInit) => steadfast.fetch(input, init))
    .overrideProvider(COURIER_CLOCK)
    .useValue(() => new Date())
    .overrideProvider(COURIER_PAUSE)
    .useValue(() => Promise.resolve())
    .overrideProvider(COURIER_AREA_TOKENS)
    .useValue(areaTokens)
    .overrideProvider(COURIER_NOTIFIER)
    .useValue({
      parcelNeedsAttention: () => Promise.resolve(),
      parcelMoved: () => Promise.resolve(),
      connectionTrouble: () => Promise.resolve(),
      courierRetiring: () => Promise.resolve(),
      courierBack: () => Promise.resolve(),
    })
    .overrideProvider(CourierBookingTickWorker)
    .useValue({})
    .overrideProvider(CourierNightTickWorker)
    .useValue({})
    .overrideProvider(CourierAreasTickWorker)
    .useValue({})
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  operator = await operatorHeaders();
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

beforeEach(() => {
  steadfast.reset();
  areaTokens['redx'] = 'lytro-area-token';
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

function freshMobile(): string {
  return `017${String(randomInt(10_000_000, 99_999_999))}`;
}

async function steadfastShop(): Promise<ShopClient> {
  const shop = await openShop(port, texts, 'scr');
  const made = await shop.post('/couriers/connections', {
    courierKey: 'steadfast',
    credentials: { apiKey: RIGHT_API_KEY, secretKey: RIGHT_SECRET_KEY },
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  return shop;
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

/** A new delivery order on a new product; its id and number. */
async function placed(shop: ShopClient): Promise<{ id: string; orderNumber: string }> {
  const made = await shop.post('/products', {
    name: 'Lamp',
    basePrice: 500,
    variants: [{ optionIds: [], openingStock: 20 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const variantId = (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '';
  const order = await postJson(
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
  expect(order.status, JSON.stringify(order.body)).toBe(201);
  return order.body as { id: string; orderNumber: string };
}

async function booked(shop: ShopClient): Promise<{ id: string; orderNumber: string }> {
  const order = await placed(shop);
  const answered = await shop.post(`/orders/${order.id}/book`, { courierKey: 'steadfast' });
  expect(answered.status, JSON.stringify(answered.body)).toBe(200);
  return order;
}

interface Row {
  id: string;
  parcel: { courierKey: string; state: string; reading: string | null } | null;
  attention: string | null;
}

async function rows(shop: ShopClient, query = ''): Promise<{ orders: Row[]; total: number }> {
  const listed = await shop.get(`/orders${query}`);
  expect(listed.status, JSON.stringify(listed.body)).toBe(200);
  return listed.body as { orders: Row[]; total: number };
}

/** What a courier reported, as Slice 6.2's news path leaves it on the parcel. */
async function report(
  shop: ShopClient,
  orderId: string,
  attention: string,
  state?: string,
): Promise<void> {
  await admin.query(
    `UPDATE tenant.courier_parcels SET attention = $3, state = coalesce($4, state)
      WHERE tenant_id = $1 AND order_id = $2`,
    [shop.tenantId, orderId, attention, state ?? null],
  );
}

interface Connection {
  courierKey: string;
  lastMessageAt: string | null;
  messagesMissedAt: string | null;
}

async function steadfastConnection(shop: ShopClient): Promise<Connection> {
  const listed = (await shop.get('/couriers/connections')).body as { connections: Connection[] };
  const found = listed.connections.find((each) => each.courierKey === 'steadfast');
  if (!found) throw new Error('no steadfast connection');
  return found;
}

describeIfDatabase("each order's parcel in the list, and Needs a look (Slice 6.7)", () => {
  it("carries a booked order's live parcel, and nothing for one not booked", async () => {
    const shop = await steadfastShop();
    const order = await booked(shop);
    const waiting = await placed(shop);
    const view = (await shop.get(`/orders/${order.id}`)).body as {
      parcel: { state: string; reading: string | null };
    };
    const listed = await rows(shop);
    expect(listed.orders.find((row) => row.id === order.id)).toMatchObject({
      parcel: { courierKey: 'steadfast', state: view.parcel.state, reading: view.parcel.reading },
      attention: null,
    });
    expect(listed.orders.find((row) => row.id === waiting.id)).toMatchObject({
      parcel: null,
      attention: null,
    });
  });

  it('a cancelled booking is no live parcel', async () => {
    const shop = await steadfastShop();
    const order = await booked(shop);
    await admin.query(
      `UPDATE tenant.courier_parcels SET state = 'cancelled' WHERE tenant_id = $1 AND order_id = $2`,
      [shop.tenantId, order.id],
    );
    expect((await rows(shop)).orders.find((row) => row.id === order.id)?.parcel).toBeNull();
  });

  it('Needs a look lists only the orders a courier reported something on, a cancelled booking too', async () => {
    const shop = await steadfastShop();
    const cash = await booked(shop);
    const afterCancel = await booked(shop);
    const quiet = await booked(shop);
    await report(shop, cash.id, 'cash_differs');
    await report(shop, afterCancel.id, 'delivered_after_cancel', 'cancelled');
    const looks = await rows(shop, '?attention=any');
    expect(looks.total).toBe(2);
    expect(looks.orders.map((row) => row.id).sort()).toEqual([cash.id, afterCancel.id].sort());
    expect(looks.orders.find((row) => row.id === cash.id)?.attention).toBe('cash_differs');
    // The cancelled booking is no live parcel, and still needs a look.
    expect(looks.orders.find((row) => row.id === afterCancel.id)).toMatchObject({
      parcel: null,
      attention: 'delivered_after_cancel',
    });
    expect((await rows(shop)).orders.find((row) => row.id === quiet.id)?.attention).toBeNull();
    // It narrows the other filters, and a value it doesn't know is refused.
    expect((await rows(shop, '?attention=any&q=nobody-by-this-name')).total).toBe(0);
    expect((await shop.get('/orders?attention=all')).status).toBe(400);
  });

  it('Mark as seen takes it out of Needs a look and keeps its news', async () => {
    const shop = await steadfastShop();
    const order = await booked(shop);
    const other = await booked(shop);
    await report(shop, order.id, 'cod_changed');
    await report(shop, other.id, 'cash_differs');
    const newsBefore = await admin.query(
      'SELECT count(*)::int AS n FROM tenant.courier_events WHERE tenant_id = $1',
      [shop.tenantId],
    );
    const seen = await shop.post(`/orders/${order.id}/parcel/seen`, {});
    expect(seen.status, JSON.stringify(seen.body)).toBe(200);
    expect((seen.body as { parcel: { attention: string | null } }).parcel.attention).toBeNull();
    const looks = await rows(shop, '?attention=any');
    expect(looks.orders.map((row) => row.id)).toEqual([other.id]);
    const newsAfter = await admin.query(
      'SELECT count(*)::int AS n FROM tenant.courier_events WHERE tenant_id = $1',
      [shop.tenantId],
    );
    expect(newsAfter.rows).toEqual(newsBefore.rows);
    // Marking it again changes nothing; another shop's order isn't found.
    expect((await shop.post(`/orders/${order.id}/parcel/seen`, {})).status).toBe(200);
    const stranger = await steadfastShop();
    const refused = await stranger.post(`/orders/${other.id}/parcel/seen`, {});
    expect(refused.status).toBe(404);
    expect(errorOf(refused).code).toBe('not_found');
    expect((await rows(shop, '?attention=any')).total).toBe(1);
  });

  it("clears it on a cancelled booking's parcel too", async () => {
    const shop = await steadfastShop();
    const order = await booked(shop);
    await report(shop, order.id, 'delivered_after_cancel', 'cancelled');
    expect((await shop.post(`/orders/${order.id}/parcel/seen`, {})).status).toBe(200);
    expect((await rows(shop, '?attention=any')).total).toBe(0);
  });
});

describeIfDatabase("a connection's missed messages (CRR-15, Slice 6.7)", () => {
  it('says when the night check found news no message brought, until a message comes', async () => {
    const shop = await steadfastShop();
    expect((await steadfastConnection(shop)).messagesMissedAt).toBeNull();
    const warned = new Date(Date.now() - 60_000);
    await admin.query(
      `UPDATE tenant.courier_connections SET last_message_at = $2, paste_warned_at = $3
        WHERE tenant_id = $1 AND courier_key = 'steadfast'`,
      [shop.tenantId, new Date(warned.getTime() - 3_600_000), warned],
    );
    const missed = await steadfastConnection(shop);
    expect(new Date(missed.messagesMissedAt ?? 0).getTime()).toBe(warned.getTime());
    // A message after the warning: arriving again.
    await admin.query(
      `UPDATE tenant.courier_connections SET last_message_at = now()
        WHERE tenant_id = $1 AND courier_key = 'steadfast'`,
      [shop.tenantId],
    );
    expect((await steadfastConnection(shop)).messagesMissedAt).toBeNull();
  });
});

describeIfDatabase("the operator's area list and its thanas (CUS-10, Slice 6.7)", () => {
  interface AreaPage {
    total: number;
    counts: Record<string, number>;
    lastReadAt: string | null;
    tokenSet: boolean;
  }

  async function areaPage(query = ''): Promise<AreaPage> {
    const listed = await getJson(port, `/operator/courier-areas?courierKey=redx${query}`, operator);
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    return listed.body as AreaPage;
  }

  it('counts each filter, says when the list was read and whether the token is set', async () => {
    await admin.query("DELETE FROM control.courier_areas WHERE courier_key = 'redx'");
    expect(await areaPage()).toMatchObject({
      total: 0,
      counts: { all: 0, suggested: 0, unassigned: 0, assigned: 0, retired: 0 },
      lastReadAt: null,
      tokenSet: true,
    });
    const thana = await admin.query<{ id: number }>(
      'SELECT id FROM control.locations ORDER BY id LIMIT 1',
    );
    const thanaId = thana.rows[0]?.id ?? 0;
    const lastRead = new Date('2026-11-01T21:00:00Z');
    const earlier = new Date('2026-10-25T21:00:00Z');
    const area = (
      code: string,
      match: string,
      placed: number | null,
      suggested: number | null,
      retired: Date | null,
      read: Date,
    ): Promise<unknown> =>
      admin.query(
        `INSERT INTO control.courier_areas (courier_key, area_code, name, district_name, thana_id, suggested_thana_id, match,
           retired_at, refreshed_at)
         VALUES ('redx', $1, $1, 'Dhaka', $2, $3, $4, $5, $6)`,
        [code, placed, suggested, match, retired, read],
      );
    await area('own-1', 'own_name', thanaId, null, null, lastRead);
    await area('placed-1', 'operator', thanaId, null, null, lastRead);
    await area('sugg-1', 'suggested', null, thanaId, null, lastRead);
    await area('sugg-2', 'suggested', null, thanaId, null, lastRead);
    await area('none-1', 'none', null, null, null, lastRead);
    await area('none-2', 'none', null, null, null, lastRead);
    await area('none-3', 'none', null, null, null, lastRead);
    // Areas RedX dropped count only as retired, whatever they matched.
    const dropped = new Date('2026-10-30T00:00:00Z');
    await area('gone-1', 'own_name', thanaId, null, dropped, earlier);
    await area('gone-2', 'suggested', null, thanaId, dropped, earlier);
    await area('gone-3', 'none', null, null, dropped, earlier);
    const page = await areaPage('&state=suggested');
    expect(page.total).toBe(2);
    expect(page.counts).toEqual({ all: 10, suggested: 2, unassigned: 3, assigned: 2, retired: 3 });
    expect(new Date(page.lastReadAt ?? 0).toISOString()).toBe(lastRead.toISOString());
    // Each count is what its own filter lists.
    for (const state of ['suggested', 'unassigned', 'assigned', 'retired'] as const) {
      expect((await areaPage(`&state=${state}`)).total).toBe(page.counts[state]);
    }
    expect((await areaPage()).total).toBe(page.counts['all']);
    delete areaTokens['redx'];
    expect((await areaPage()).tokenSet).toBe(false);
  });

  it('lists the thanas with their districts for the operator alone', async () => {
    const listed = await getJson(port, '/operator/locations', operator);
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    const { zillas } = listed.body as {
      zillas: { nameEn: string; thanas: { nameEn: string }[] }[];
    };
    expect(zillas.find((row) => row.nameEn === 'Dhaka')?.thanas.map((row) => row.nameEn)).toContain(
      'Mirpur',
    );
    expect((await getJson(port, '/operator/locations')).status).toBe(401);
  });
});

describeIfDatabase("a shop's courier key log names the order (SEC-11, Slice 6.7)", () => {
  it('gives each use for an order its number, and none for the rest', async () => {
    const shop = await steadfastShop();
    const order = await booked(shop);
    const listed: HttpResult = await getJson(
      port,
      `/operator/tenants/${shop.tenantId}/courier-credential-uses`,
      operator,
    );
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    const { uses } = listed.body as {
      uses: { action: string; orderId: string | null; orderNumber: string | null }[];
    };
    expect(uses.find((use) => use.action === 'book')).toMatchObject({
      orderId: order.id,
      orderNumber: order.orderNumber,
    });
    expect(uses.find((use) => use.action === 'test')).toMatchObject({
      orderId: null,
      orderNumber: null,
    });
  });
});
