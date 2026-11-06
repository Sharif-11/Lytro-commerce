import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app/app.module';
import type {
  CourierBackNotice,
  CourierRetiringNotice,
} from '../src/modules/couriers/ports/courier-notifier';
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
import { prepareTestDatabase } from './support/database';
import { FakePathao, PATHAO_FIELDS } from './support/fake-pathao';
import { FakeRedx, REDX_SHOP_TOKEN } from './support/fake-redx';
import { FakeSteadfast, RIGHT_API_KEY, RIGHT_SECRET_KEY } from './support/fake-steadfast';
import { cookieFrom, getJson, postJson, type HttpResult } from './support/http';
import { errorOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 6 Slice 6.6, read agreed 2026-11-06: retiring a courier (CRR-23 to CRR-25). The operator retires one, suggesting another; every
// shop connected is told and a default on it moves; no new shop connects it while connected shops keep booking and may replace keys.
// Undoing tells them it's back, defaults staying. Removal waits for every order still on it, a payout included for 30 days, then takes
// every shop's keys and address; a booking's claim refuses a removed courier. Fakes stand in. Runs only with DATABASE_TEST_ADMIN_URL.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_courier_retiring_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 60_000 });

const PASSWORD = 'retire-operator-9';
let app: INestApplication;
let port: number;
let admin: pg.Client;
let operator: Record<string, string> = {};
let adminDbUrl = '';
const steadfast = new FakeSteadfast();
const redx = new FakeRedx();
const pathao = new FakePathao();
const texts = new SmsCapture();
const retiring: CourierRetiringNotice[] = [];
const back: CourierBackNotice[] = [];

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'courier-retiring-e2e-otp-secret-0123456789012';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  adminDbUrl = urls.adminDbUrl;
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(COURIER_FETCH)
    .useValue((input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('packzy')) return steadfast.fetch(input, init);
      return url.includes('pathao') ? pathao.fetch(input, init) : redx.fetch(input, init);
    })
    .overrideProvider(COURIER_CLOCK)
    .useValue(() => new Date())
    .overrideProvider(COURIER_PAUSE)
    .useValue(() => Promise.resolve())
    .overrideProvider(COURIER_NOTIFIER)
    .useValue({
      parcelNeedsAttention: () => Promise.resolve(),
      parcelMoved: () => Promise.resolve(),
      connectionTrouble: () => Promise.resolve(),
      courierRetiring: (notice: CourierRetiringNotice) => {
        retiring.push(notice);
        return Promise.resolve();
      },
      courierBack: (notice: CourierBackNotice) => {
        back.push(notice);
        return Promise.resolve();
      },
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

beforeEach(async () => {
  steadfast.reset();
  retiring.length = 0;
  back.length = 0;
  if (!ADMIN_URL) return;
  // Every test starts with every courier active.
  await admin.query('DELETE FROM control.courier_adapters');
});

interface Courier {
  key: string;
  state: string;
  suggestedKey: string | null;
  shops: number;
  defaultFor: number;
  onTheirWay: number;
}

interface Connection {
  courierKey: string;
  isDefault: boolean;
  retiring: boolean;
  suggestedKey: string | null;
}

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

const retire = (key: string, suggestedKey: string): Promise<HttpResult> =>
  postJson(
    port,
    `/operator/couriers/${key}/retire`,
    { suggestedKey, reason: 'Its API has stopped answering' },
    operator,
  );
const undo = (key: string): Promise<HttpResult> =>
  postJson(port, `/operator/couriers/${key}/undo-retire`, { reason: 'It answers again' }, operator);
const remove = (key: string): Promise<HttpResult> =>
  postJson(port, `/operator/couriers/${key}/remove`, { reason: 'Nothing waits on it' }, operator);

async function couriers(): Promise<Courier[]> {
  const listed = await getJson(port, '/operator/couriers', operator);
  expect(listed.status, JSON.stringify(listed.body)).toBe(200);
  return (listed.body as { couriers: Courier[] }).couriers;
}

function freshMobile(): string {
  return `017${String(randomInt(10_000_000, 99_999_999))}`;
}

type Key = 'steadfast' | 'redx' | 'pathao';
const CREDENTIALS: Record<Key, Record<string, string>> = {
  steadfast: { apiKey: RIGHT_API_KEY, secretKey: RIGHT_SECRET_KEY },
  redx: { apiToken: REDX_SHOP_TOKEN },
  pathao: PATHAO_FIELDS,
};

async function connect(shop: ShopClient, courierKey: Key): Promise<HttpResult> {
  return shop.post('/couriers/connections', { courierKey, credentials: CREDENTIALS[courierKey] });
}

async function shopWith(...keys: Key[]): Promise<ShopClient> {
  const shop = await openShop(port, texts, 'crt');
  for (const key of keys) {
    const made = await connect(shop, key);
    expect(made.status, JSON.stringify(made.body)).toBe(200);
  }
  return shop;
}

async function connections(shop: ShopClient): Promise<Connection[]> {
  return ((await shop.get('/couriers/connections')).body as { connections: Connection[] })
    .connections;
}

async function adapterKeys(shop: ShopClient): Promise<string[]> {
  return (
    (await shop.get('/couriers/adapters')).body as { adapters: { key: string }[] }
  ).adapters.map((each) => each.key);
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

/** A Steadfast booking on a new order, so the shop has a parcel on its way. */
async function booked(shop: ShopClient): Promise<{ id: string; orderNumber: string }> {
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
  const placed = order.body as { id: string; orderNumber: string };
  const answered = await shop.post(`/orders/${placed.id}/book`, { courierKey: 'steadfast' });
  expect(answered.status, JSON.stringify(answered.body)).toBe(200);
  return placed;
}

/** A new order on a new product, not yet booked; its id. */
async function placed36(shop: ShopClient): Promise<string> {
  const made = await shop.post('/products', {
    name: 'Lamp',
    basePrice: 500,
    variants: [{ optionIds: [], openingStock: 5 }],
  });
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
  return (order.body as { id: string }).id;
}

async function activity(
  tenantId: string,
  action: string,
): Promise<{ summary: Record<string, unknown> }[]> {
  const { rows } = await admin.query<{ summary: Record<string, unknown> }>(
    'SELECT summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2',
    [tenantId, action],
  );
  return rows;
}

describeIfDatabase('retiring a courier (CRR-23, CRR-25)', () => {
  it('lists every courier with its state and the shops that lean on it', async () => {
    const before = await couriers();
    await shopWith('steadfast', 'redx');
    await shopWith('steadfast');
    const after = await couriers();
    const steadfastOf = (list: Courier[]) => list.find((each) => each.key === 'steadfast');
    expect(after.map((each) => each.key).sort()).toEqual(['pathao', 'redx', 'steadfast']);
    expect(steadfastOf(after)).toMatchObject({ state: 'active', suggestedKey: null });
    expect((steadfastOf(after)?.shops ?? 0) - (steadfastOf(before)?.shops ?? 0)).toBe(2);
    expect((steadfastOf(after)?.defaultFor ?? 0) - (steadfastOf(before)?.defaultFor ?? 0)).toBe(2);
    expect((await getJson(port, '/operator/couriers')).status).toBe(401);
  });

  it('moves the defaults, tells every shop connected, takes no new shop, and lets connected shops book and replace keys', async () => {
    const both = await shopWith('steadfast', 'redx');
    const only = await shopWith('steadfast');
    const none = await openShop(port, texts, 'crt');

    const answered = await retire('steadfast', 'redx');
    expect(answered.status, JSON.stringify(answered.body)).toBe(200);
    expect(answered.body).toMatchObject({
      courier: { key: 'steadfast', state: 'retiring', suggestedKey: 'redx' },
    });

    // The suggested courier takes over where the shop has it; a shop with no other keeps it.
    expect((await connections(both)).find((each) => each.isDefault)?.courierKey).toBe('redx');
    expect((await connections(only)).find((each) => each.isDefault)?.courierKey).toBe('steadfast');
    expect(retiring).toEqual(
      expect.arrayContaining([
        {
          tenantId: both.tenantId,
          courierKey: 'steadfast',
          suggestedKey: 'redx',
          defaultMovedTo: 'redx',
        },
        {
          tenantId: only.tenantId,
          courierKey: 'steadfast',
          suggestedKey: 'redx',
          defaultMovedTo: null,
        },
      ]),
    );
    expect(retiring.some((notice) => notice.tenantId === none.tenantId)).toBe(false);
    const told = await activity(both.tenantId, 'courier_retiring');
    expect(told).toHaveLength(1);
    expect(told[0]?.summary).toMatchObject({
      courierKey: 'steadfast',
      suggestedKey: 'redx',
      defaultMovedTo: 'redx',
    });
    const { rows } = await admin.query<{ summary: Record<string, unknown> }>(
      "SELECT summary FROM control.platform_audit_log WHERE action = 'courier_retired' ORDER BY created_at DESC LIMIT 1",
    );
    expect(rows[0]?.summary).toMatchObject({
      courierKey: 'steadfast',
      suggestedKey: 'redx',
      reason: 'Its API has stopped answering',
    });

    // A shop not connected isn't offered it, and can't connect it.
    expect(await adapterKeys(none)).not.toContain('steadfast');
    const refused = await connect(none, 'steadfast');
    expect(refused.status).toBe(409);
    expect(errorOf(refused).details).toMatchObject({ courierKey: 'steadfast' });
    expect(errorOf(refused).message).toMatch(/being retired|রিটায়ার হচ্ছে/);

    // A shop connected sees it marked, keeps booking with it, and may replace its keys.
    expect(await adapterKeys(only)).toContain('steadfast');
    expect((await connections(only))[0]).toMatchObject({
      courierKey: 'steadfast',
      retiring: true,
      suggestedKey: 'redx',
    });
    expect((await connect(only, 'steadfast')).status).toBe(200);
    await booked(only);
  });

  it('moves a default to the longest-connected other courier when the suggested one isn’t connected', async () => {
    const shop = await shopWith('steadfast', 'redx');
    expect((await retire('steadfast', 'pathao')).status).toBe(200);
    expect((await connections(shop)).find((each) => each.isDefault)?.courierKey).toBe('redx');
    expect(retiring.find((notice) => notice.tenantId === shop.tenantId)).toMatchObject({
      suggestedKey: 'pathao',
      defaultMovedTo: 'redx',
    });
  });

  it('moves a default to the suggested courier before the longest-connected other', async () => {
    const shop = await shopWith('steadfast', 'redx', 'pathao');
    expect((await retire('steadfast', 'pathao')).status).toBe(200);
    expect((await connections(shop)).find((each) => each.isDefault)?.courierKey).toBe('pathao');
  });

  it('refuses a suggestion that is the same courier or not active, retiring twice, and undoing or removing an active one', async () => {
    const same = await retire('steadfast', 'steadfast');
    expect(same.status).toBe(409);
    expect(errorOf(same).details).toMatchObject({ suggestedKey: 'steadfast' });
    expect((await retire('redx', 'pathao')).status).toBe(200);
    const onRetiring = await retire('steadfast', 'redx');
    expect(onRetiring.status).toBe(409);
    expect(errorOf(onRetiring).details).toMatchObject({ suggestedKey: 'redx' });
    const twice = await retire('redx', 'steadfast');
    expect(twice.status).toBe(409);
    expect(errorOf(twice).message).toMatch(/already being retired|আগেই রিটায়ার/);
    for (const answer of [await undo('pathao'), await remove('pathao')]) {
      expect(answer.status).toBe(409);
      expect(errorOf(answer).message).toMatch(/isn’t being retired|রিটায়ার হচ্ছে না/);
    }
    expect(
      (
        await postJson(
          port,
          '/operator/couriers/dhl/retire',
          { suggestedKey: 'redx', reason: 'x' },
          operator,
        )
      ).status,
    ).toBe(404);
  });

  it('brings it back: the same shops are told, defaults stay, and new shops can connect again', async () => {
    const both = await shopWith('steadfast', 'redx');
    const none = await openShop(port, texts, 'crt');
    expect((await retire('steadfast', 'redx')).status).toBe(200);
    const answered = await undo('steadfast');
    expect(answered.status, JSON.stringify(answered.body)).toBe(200);
    expect(answered.body).toMatchObject({ courier: { state: 'active', suggestedKey: null } });
    expect(back).toEqual(
      expect.arrayContaining([{ tenantId: both.tenantId, courierKey: 'steadfast' }]),
    );
    expect(back.some((notice) => notice.tenantId === none.tenantId)).toBe(false);
    expect((await connections(both)).find((each) => each.isDefault)?.courierKey).toBe('redx');
    expect((await connections(both)).every((each) => !each.retiring)).toBe(true);
    expect(await activity(both.tenantId, 'courier_retiring_undone')).toHaveLength(1);
    expect((await connect(none, 'steadfast')).status).toBe(200);
  });
});

describeIfDatabase('removing a courier (CRR-24)', () => {
  it('waits for parcels on their way and unpaid deliveries, then takes every shop’s keys and address, keeping its parcels', async () => {
    const shop = await shopWith('steadfast', 'redx');
    const order = await booked(shop);
    // A shop with no other courier when it was retired keeps it as its default, then connects another.
    const kept = await shopWith('steadfast');
    expect((await retire('steadfast', 'redx')).status).toBe(200);
    expect((await connect(kept, 'redx')).status).toBe(200);
    expect((await connections(kept)).find((each) => each.isDefault)?.courierKey).toBe('steadfast');

    // On its way.
    const listed = await getJson(port, '/operator/couriers/steadfast/blocking', operator);
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    const blocking = listed.body as {
      total: number;
      orders: {
        tenantId: string;
        orderId: string;
        orderNumber: string;
        reason: string;
        waitsUntil: string | null;
      }[];
    };
    expect(blocking.orders).toContainEqual(
      expect.objectContaining({
        tenantId: shop.tenantId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        reason: 'on_its_way',
        waitsUntil: null,
      }),
    );
    const refused = await remove('steadfast');
    expect(refused.status).toBe(409);
    expect(errorOf(refused).details['blocking']).toBeGreaterThan(0);

    // Delivered, its payout not yet read: it waits until 30 days after its last change.
    await admin.query(
      "UPDATE tenant.orders SET fulfillment_status = 'delivered', delivered_at = now() WHERE id = $1",
      [order.id],
    );
    await admin.query(
      "UPDATE tenant.courier_parcels SET reading = 'delivered', last_change_at = now() - interval '1 day' WHERE order_id = $1",
      [order.id],
    );
    const waiting = (await getJson(port, '/operator/couriers/steadfast/blocking', operator))
      .body as typeof blocking;
    const mine = waiting.orders.find((each) => each.orderId === order.id);
    expect(mine?.reason).toBe('awaiting_payout');
    expect(new Date(mine?.waitsUntil ?? 0).getTime()).toBeGreaterThan(Date.now() + 28 * 86_400_000);
    expect((await remove('steadfast')).status).toBe(409);

    // Past the 30 days, a payout that never came no longer holds it back; every other shop's parcels are cleared for this test.
    await admin.query(
      "UPDATE tenant.courier_parcels SET last_change_at = now() - interval '31 days' WHERE order_id = $1",
      [order.id],
    );
    await admin.query(
      "UPDATE tenant.courier_parcels SET state = 'cancelled' WHERE courier_key = 'steadfast' AND order_id <> $1",
      [order.id],
    );
    expect(
      (
        (await getJson(port, '/operator/couriers/steadfast/blocking', operator))
          .body as typeof blocking
      ).total,
    ).toBe(0);

    const removed = await remove('steadfast');
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect(removed.body).toMatchObject({ courier: { state: 'removed' } });
    expect((removed.body as { disconnected: number }).disconnected).toBeGreaterThan(0);
    expect((await connections(shop)).map((each) => each.courierKey)).toEqual(['redx']);
    expect((await connections(shop))[0]?.isDefault).toBe(true);
    // Its default goes to the courier it has left.
    expect(await connections(kept)).toEqual([
      expect.objectContaining({ courierKey: 'redx', isDefault: true }),
    ]);
    const { rows } = await admin.query(
      'SELECT 1 FROM control.courier_message_routes WHERE tenant_id = $1 AND courier_key = $2',
      [shop.tenantId, 'steadfast'],
    );
    expect(rows).toHaveLength(0);
    // Its parcel keeps its record; nobody can connect it again; asked again, removal finds nothing left.
    expect(
      ((await shop.get(`/orders/${order.id}`)).body as { parcel: { courierKey: string } | null })
        .parcel?.courierKey,
    ).toBe('steadfast');
    expect(await adapterKeys(shop)).not.toContain('steadfast');
    expect((await connect(shop, 'steadfast')).status).toBe(404);
    expect(await remove('steadfast')).toMatchObject({ status: 200, body: { disconnected: 0 } });
  });

  it('counts a booking not yet settled as holding it back', async () => {
    const shop = await shopWith('steadfast');
    const order = await booked(shop);
    await admin.query("UPDATE tenant.courier_parcels SET state = 'unknown' WHERE order_id = $1", [
      order.id,
    ]);
    expect((await retire('steadfast', 'redx')).status).toBe(200);
    const listed = (await getJson(port, '/operator/couriers/steadfast/blocking', operator))
      .body as { orders: { orderId: string; reason: string }[] };
    expect(listed.orders).toContainEqual(
      expect.objectContaining({ orderId: order.id, reason: 'not_settled' }),
    );
  });

  it('waits for a booking being claimed, and counts its parcel', async () => {
    const shop = await shopWith('steadfast');
    const order = await booked(shop);
    await admin.query(
      "UPDATE tenant.courier_parcels SET state = 'cancelled' WHERE courier_key = 'steadfast'",
    );
    expect((await retire('steadfast', 'redx')).status).toBe(200);
    // A claim in flight, as a booking holds it: the courier's state read shared, its parcel not yet written.
    const claim = new pg.Client({ connectionString: adminDbUrl });
    await claim.connect();
    try {
      await claim.query('BEGIN');
      await claim.query(
        "SELECT state FROM control.courier_adapters WHERE courier_key = 'steadfast' FOR SHARE",
      );
      let settled = false;
      const removal = remove('steadfast').then((answer) => {
        settled = true;
        return answer;
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(settled).toBe(false);
      await claim.query(
        `INSERT INTO tenant.courier_parcels (tenant_id, order_id, courier_key, state, invoice, cod)
         VALUES ($1, $2, 'steadfast', 'booking', $3, 0)`,
        [shop.tenantId, order.id, `${order.orderNumber}-2`],
      );
      await claim.query('COMMIT');
      const answer = await removal;
      expect(answer.status).toBe(409);
      expect(errorOf(answer).details['blocking']).toBeGreaterThan(0);
    } finally {
      await claim.end();
    }
  });

  it('holds a booking at its claim while removal holds the courier', async () => {
    const shop = await shopWith('steadfast');
    const placed = await placed36(shop);
    // The courier's row exists and is committed, as it is once retired; removal then holds it.
    await admin.query(
      "INSERT INTO control.courier_adapters (courier_key, state) VALUES ('steadfast', 'retiring')",
    );
    const removal = new pg.Client({ connectionString: adminDbUrl });
    await removal.connect();
    try {
      await removal.query('BEGIN');
      await removal.query(
        "SELECT state FROM control.courier_adapters WHERE courier_key = 'steadfast' FOR UPDATE",
      );
      let settled = false;
      const booking = shop.post(`/orders/${placed}/book`, {}).then((answer) => {
        settled = true;
        return answer;
      });
      // Long past what a booking takes here, so it can only still be open because its claim is waiting.
      await new Promise((resolve) => setTimeout(resolve, 2500));
      expect(settled).toBe(false);
      await removal.query('ROLLBACK');
      const answer = await booking;
      expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    } finally {
      await removal.end();
    }
  });

  it('refuses a booking with a courier marked removed, at the claim', async () => {
    const shop = await shopWith('steadfast');
    await admin.query(
      "INSERT INTO control.courier_adapters (courier_key, state) VALUES ('steadfast', 'removed')",
    );
    const made = await shop.post('/products', {
      name: 'Lamp',
      basePrice: 500,
      variants: [{ optionIds: [], openingStock: 5 }],
    });
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
    const answered = await shop.post(`/orders/${(order.body as { id: string }).id}/book`, {});
    expect(answered.status).toBe(409);
    expect(errorOf(answered).message).toMatch(/isn’t available|পাওয়া যাচ্ছে না/);
    expect(steadfast.bookings()).toHaveLength(0);
  });
});
