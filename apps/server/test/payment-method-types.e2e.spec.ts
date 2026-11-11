import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app/app.module';
import type { PaymentMethodTypeNotice } from '../src/modules/payment-method-types/ports/payment-method-notifier';
import { PAYMENT_METHOD_NOTIFIER } from '../src/modules/payment-method-types/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import {
  cookieFrom,
  getJson,
  patchJson,
  postJson,
  sendExact,
  type HttpResult,
} from './support/http';
import { seedOrderFor } from './support/orders';
import { errorOf, openShop, type ShopClient } from './support/shop-client';
import { slowWrites, untilSome } from './support/slow-write';
import { SmsCapture } from './support/sms-capture';

// Phase 8 Slice 8.7, read agreed 2026-11-10 (WAL-18, D8-18, D8-65 to D8-67): the operator retiring a payment method type, the couriers'
// way. Retiring hides it from every shop that never set it up, while one that did keeps it, checkout included, and is told; undoing
// tells the same shops. Removal waits for no shop to have it on, no payment open on it and Lytro's own page not to take it, then takes
// every shop's accounts for it and keeps past payments. Runs only with DATABASE_TEST_ADMIN_URL.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_payment_method_types_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 60_000 });

const PASSWORD = 'wallet-operator-9';
let app: INestApplication;
let port: number;
let admin: pg.Client;
let operator: Record<string, string> = {};
let adminDbUrl = '';
const texts = new SmsCapture();
const retiring: PaymentMethodTypeNotice[] = [];
const back: PaymentMethodTypeNotice[] = [];

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'wallet-types-e2e-otp-secret-0123456789012345';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  adminDbUrl = urls.adminDbUrl;
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(PAYMENT_METHOD_NOTIFIER)
    .useValue({
      methodRetiring: (notice: PaymentMethodTypeNotice) => {
        retiring.push(notice);
        return Promise.resolve();
      },
      methodBack: (notice: PaymentMethodTypeNotice) => {
        back.push(notice);
        return Promise.resolve();
      },
    })
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
  retiring.length = 0;
  back.length = 0;
  if (!ADMIN_URL) return;
  // Every test starts with every type active, no shop using any, and Lytro's own page on its defaults (every method on).
  await admin.query('DELETE FROM control.payment_method_types');
  await admin.query('DELETE FROM tenant.payment_sessions');
  await admin.query('DELETE FROM tenant.wallet_accounts');
  await admin.query('DELETE FROM tenant.payment_methods_on');
  await admin.query('DELETE FROM tenant.payment_method_ways');
  await admin.query('DELETE FROM control.platform_payment_methods');
});

interface TypeRow {
  method: string;
  kind: string;
  state: string;
  retiringSince: string | null;
  removedAt: string | null;
  shopsOn: number;
  shopsWithAccounts: number;
  openPayments: number;
  shopsSetUp: number;
  lytroTakes: boolean;
}

interface MethodRow {
  method: string;
  enabled: boolean;
  retiring: boolean;
  accounts: { id: string; number: string | null }[];
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

// What each refusal says, in either language.
const SAYS = {
  PaymentMethodNotFound: /no such payment method|এমন কোনো পেমেন্ট মেথড নেই/,
  PaymentMethodRetiring: /retiring this payment method|মেথডটি রিটায়ার করছে/,
  PaymentMethodAlreadyRetiring: /already being retired|আগেই রিটায়ার/,
  PaymentMethodNotRetiring: /isn’t being retired|রিটায়ার হচ্ছে না/,
  PaymentMethodRemovalBlocked: /can’t be removed yet|রিমুভ করা যাবে না/,
} as const;

const retire = (method: string): Promise<HttpResult> =>
  postJson(
    port,
    `/operator/payment-method-types/${method}/retire`,
    { reason: 'The wallet is closing its merchant service' },
    operator,
  );
const undo = (method: string): Promise<HttpResult> =>
  postJson(
    port,
    `/operator/payment-method-types/${method}/undo-retire`,
    { reason: 'It stays open after all' },
    operator,
  );
const remove = (method: string): Promise<HttpResult> =>
  postJson(
    port,
    `/operator/payment-method-types/${method}/remove`,
    { reason: 'Nothing uses it now' },
    operator,
  );

async function types(): Promise<TypeRow[]> {
  const listed = await getJson(port, '/operator/payment-method-types', operator);
  expect(listed.status, JSON.stringify(listed.body)).toBe(200);
  return (listed.body as { types: TypeRow[] }).types;
}

async function typeOf(method: string): Promise<TypeRow | undefined> {
  return (await types()).find((row) => row.method === method);
}

function nagadBody(enabled: boolean, number = texts.freshPhone()): Record<string, unknown> {
  return {
    enabled,
    accounts: [{ accountName: 'Rahim Store', number, accountType: 'personal', active: true }],
  };
}

/** A shop with Nagad set up: switched on with an account, or only an account saved. */
async function shopWithNagad(enabled: boolean): Promise<ShopClient> {
  const shop = await openShop(port, texts, 'pmt');
  const saved = await shop.put('/payment-methods/nagad', nagadBody(enabled));
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  return shop;
}

async function methodsOf(shop: ShopClient): Promise<MethodRow[]> {
  const read = await shop.get('/payment-methods');
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return (read.body as { methods: MethodRow[] }).methods;
}

async function shopperMethods(shop: ShopClient): Promise<string[]> {
  const key = await shop.post('/api-keys', { name: 'Website', websites: ['https://myshop.com'] });
  const read = await sendExact(port, 'GET', '/v1/payment-methods', undefined, {
    host: 'api.localhost',
    authorization: `Bearer ${(key.body as { key: string }).key}`,
    origin: 'https://myshop.com',
  });
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return (read.body as { methods: { method: string }[] }).methods.map((row) => row.method);
}

/** A shopper's payment on the method, open in this state: an order and its session, as checkout leaves them. */
async function openPayment(shop: ShopClient, method: string, state: string): Promise<string> {
  const orderId = randomUUID();
  await seedOrderFor(admin, shop.tenantId, orderId, []);
  const submitted = state === 'awaiting_payment' ? null : `T${randomUUID().slice(0, 9)}`;
  const made = await admin.query<{ id: string }>(
    `INSERT INTO tenant.payment_sessions (tenant_id, ref, order_id, source, amount, method, state, expires_at,
       transaction_id, submitted_at)
     VALUES ($1, $2, $3, 'checkout', 300, $4, $5, now() + interval '1 hour', $6, $7) RETURNING id`,
    [
      shop.tenantId,
      randomUUID().replace(/-/g, '').slice(0, 22),
      orderId,
      method,
      state,
      submitted,
      submitted === null ? null : new Date(),
    ],
  );
  return made.rows[0]?.id ?? '';
}

async function lytroTakes(method: string, enabled: boolean): Promise<HttpResult> {
  return patchJson(port, `/operator/payment-methods/${method}`, { enabled }, operator);
}

async function activityOf(shop: ShopClient): Promise<{ action: string; summary: unknown }[]> {
  const rows = await admin.query<{ action: string; summary: unknown }>(
    "SELECT action, summary FROM tenant.activity_log WHERE tenant_id = $1 AND action LIKE 'payment_method_%' ORDER BY created_at",
    [shop.tenantId],
  );
  return rows.rows;
}

describeIfDatabase('wallet types: the list (WAL-18)', () => {
  it('lists every type, active, with the shops that set it up, payments open on it and Lytro’s own page', async () => {
    const on = await shopWithNagad(true);
    await shopWithNagad(false);
    await openShop(port, texts, 'pmt');
    await openPayment(on, 'nagad', 'checking');
    await openPayment(on, 'bkash', 'awaiting_payment');
    const listed = await types();
    expect(listed.map((row) => [row.method, row.kind, row.state])).toEqual([
      ['bkash', 'wallet', 'active'],
      ['nagad', 'wallet', 'active'],
      ['rocket', 'wallet', 'active'],
      ['upay', 'wallet', 'active'],
      ['bank', 'bank', 'active'],
    ]);
    expect(listed.find((row) => row.method === 'nagad')).toMatchObject({
      shopsOn: 1,
      shopsWithAccounts: 2,
      openPayments: 1,
      lytroTakes: true,
      retiringSince: null,
      removedAt: null,
    });
    expect(listed.find((row) => row.method === 'bkash')).toMatchObject({
      shopsOn: 0,
      shopsWithAccounts: 0,
      openPayments: 1,
      shopsSetUp: 0,
    });
  });

  it('counts the shops that set a type up once each, one on with no account too: the shops told (D8-66, §142)', async () => {
    await shopWithNagad(true);
    await shopWithNagad(false);
    // WAL-05: switched on with no account saved.
    const onAlone = await openShop(port, texts, 'pmt');
    const switched = await onAlone.put('/payment-methods/nagad', { enabled: true, accounts: [] });
    expect(switched.status, JSON.stringify(switched.body)).toBe(200);
    expect(await typeOf('nagad')).toMatchObject({
      shopsOn: 2,
      shopsWithAccounts: 2,
      shopsSetUp: 3,
    });
    // More than either count alone, and exactly the shops a retire tells.
    const retired = await retire('nagad');
    expect(retired.status, JSON.stringify(retired.body)).toBe(200);
    expect(retired.body).toMatchObject({ told: 3, type: { shopsSetUp: 3 } });
    expect(retiring.map((notice) => notice.tenantId)).toContain(onAlone.tenantId);
  });

  it('is the operator’s only, and names a type it knows', async () => {
    const anonymous = await getJson(port, '/operator/payment-method-types');
    expect(anonymous.status).toBe(401);
    const unknown = await retire('paypal');
    expect(unknown.status).toBe(404);
    expect(errorOf(unknown).message).toMatch(SAYS.PaymentMethodNotFound);
    const cash = await retire('cash_on_delivery');
    expect(cash.status).toBe(404);
    const noReason = await postJson(
      port,
      '/operator/payment-method-types/nagad/retire',
      { reason: ' ' },
      operator,
    );
    expect(noReason.status).toBe(400);
    expect((await typeOf('nagad'))?.state).toBe('active');
  });
});

describeIfDatabase('wallet types: retiring and undoing (WAL-18, D8-65, D8-66)', () => {
  it('hides a retiring type from a shop that never set it up, and keeps it for those that did, checkout included', async () => {
    const on = await shopWithNagad(true);
    const saved = await shopWithNagad(false);
    const fresh = await openShop(port, texts, 'pmt');

    const retired = await retire('nagad');
    expect(retired.status, JSON.stringify(retired.body)).toBe(200);
    const body = retired.body as { type: TypeRow; told: number };
    expect(body.told).toBe(2);
    expect(body.type).toMatchObject({ method: 'nagad', state: 'retiring', shopsOn: 1 });
    expect(body.type.retiringSince).not.toBeNull();
    expect(retiring.map((notice) => notice.tenantId).sort()).toEqual(
      [on.tenantId, saved.tenantId].sort(),
    );
    expect(retiring.map((notice) => notice.method)).toEqual(['nagad', 'nagad']);

    // A shop that never set it up no longer sees it, and can't start.
    expect((await methodsOf(fresh)).map((row) => row.method)).toEqual([
      'bkash',
      'rocket',
      'upay',
      'bank',
    ]);
    const start = await fresh.put('/payment-methods/nagad', nagadBody(true));
    expect(start.status).toBe(409);
    expect(errorOf(start).message).toMatch(SAYS.PaymentMethodRetiring);
    const way = await fresh.put('/payment-methods/nagad/way', { way: 'manual' });
    expect(way.status).toBe(409);
    expect(errorOf(way).message).toMatch(SAYS.PaymentMethodRetiring);

    // A shop that has it on keeps it, marked, takes payments by it, and may change its accounts and switch it.
    const kept = (await methodsOf(on)).find((row) => row.method === 'nagad');
    expect(kept).toMatchObject({ enabled: true, retiring: true });
    expect((await methodsOf(on)).find((row) => row.method === 'bkash')?.retiring).toBe(false);
    expect(await shopperMethods(on)).toContain('nagad');
    const changed = await on.put('/payment-methods/nagad', nagadBody(true));
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    const off = await on.put('/payment-methods/nagad', nagadBody(false));
    expect(off.status).toBe(200);

    // A shop with only an account saved may still switch it on.
    expect((await methodsOf(saved)).find((row) => row.method === 'nagad')?.retiring).toBe(true);
    const switched = await saved.put('/payment-methods/nagad', nagadBody(true));
    expect(switched.status, JSON.stringify(switched.body)).toBe(200);

    // Each shop told has it in its activity log; the operator's reason is in the platform audit log only.
    expect((await activityOf(on)).map((row) => row.action)).toContain('payment_method_retiring');
    expect(await activityOf(fresh)).toEqual([]);
    const audit = await admin.query<{ summary: Record<string, unknown> }>(
      "SELECT summary FROM control.platform_audit_log WHERE action = 'payment_method_type_retired' ORDER BY created_at DESC LIMIT 1",
    );
    expect(audit.rows[0]?.summary).toEqual({
      method: 'nagad',
      reason: 'The wallet is closing its merchant service',
    });

    const again = await retire('nagad');
    expect(again.status).toBe(409);
    expect(errorOf(again).message).toMatch(SAYS.PaymentMethodAlreadyRetiring);
  });

  it('brings a retiring type back, telling the same shops, and lets every shop set it up again', async () => {
    const on = await shopWithNagad(true);
    const fresh = await openShop(port, texts, 'pmt');
    expect((await retire('nagad')).status).toBe(200);

    const undone = await undo('nagad');
    expect(undone.status, JSON.stringify(undone.body)).toBe(200);
    expect(undone.body).toMatchObject({ told: 1, type: { state: 'active', retiringSince: null } });
    expect(back).toEqual([{ tenantId: on.tenantId, method: 'nagad' }]);
    expect((await activityOf(on)).map((row) => row.action)).toEqual([
      'payment_method_saved',
      'payment_method_retiring',
      'payment_method_retiring_undone',
    ]);
    expect((await methodsOf(on)).find((row) => row.method === 'nagad')?.retiring).toBe(false);
    const start = await fresh.put('/payment-methods/nagad', nagadBody(true));
    expect(start.status, JSON.stringify(start.body)).toBe(200);

    const again = await undo('nagad');
    expect(again.status).toBe(409);
    expect(errorOf(again).message).toMatch(SAYS.PaymentMethodNotRetiring);
  });

  it('makes a shop switching a type on wait for its first retire in flight, then refuses it (review C, S2)', async () => {
    const fresh = await openShop(port, texts, 'pmt');
    // Never retired, so the type has no row yet; the retire is slow to commit.
    const release = await slowWrites(admin, {
      name: 'p8cr_slow_retire',
      table: 'control.payment_method_types',
      on: 'UPDATE',
      when: "NEW.state = 'retiring'",
    });
    try {
      const retiringNow = retire('nagad');
      await untilSome(admin, 'asleep');
      const start = await fresh.put('/payment-methods/nagad', nagadBody(true));
      expect(start.status, JSON.stringify(start.body)).toBe(409);
      expect(errorOf(start).message).toMatch(SAYS.PaymentMethodRetiring);
      const retired = await retiringNow;
      expect(retired.status, JSON.stringify(retired.body)).toBe(200);
      expect(retired.body).toMatchObject({ told: 0 });
    } finally {
      await release();
    }
    expect((await methodsOf(fresh)).map((row) => row.method)).not.toContain('nagad');
  });

  it('makes the first retire of a type wait for a shop switching it on, then tells that shop (review C, S2)', async () => {
    const fresh = await openShop(port, texts, 'pmt');
    // The shop's switch-on is slow to commit; meanwhile the type, never retired before, is retired.
    const release = await slowWrites(admin, {
      name: 'p8cr_slow_switch_on',
      table: 'tenant.payment_methods_on',
      on: 'INSERT',
      when: "NEW.method = 'nagad'",
    });
    try {
      const starting = fresh.put('/payment-methods/nagad', nagadBody(true));
      await untilSome(admin, 'asleep');
      const retired = await retire('nagad');
      expect(retired.status, JSON.stringify(retired.body)).toBe(200);
      expect(retired.body).toMatchObject({ told: 1 });
      const started = await starting;
      expect(started.status, JSON.stringify(started.body)).toBe(200);
    } finally {
      await release();
    }
    expect(retiring).toEqual([{ tenantId: fresh.tenantId, method: 'nagad' }]);
    expect((await activityOf(fresh)).map((row) => row.action)).toEqual([
      'payment_method_saved',
      'payment_method_retiring',
    ]);
  });
});

describeIfDatabase('wallet types: removing (WAL-18, D8-67)', () => {
  it('waits for every shop to switch it off, every payment on it to close, and Lytro’s own page to stop taking it', async () => {
    const on = await shopWithNagad(true);
    const saved = await shopWithNagad(false);

    const early = await remove('nagad');
    expect(early.status).toBe(409);
    expect(errorOf(early).message).toMatch(SAYS.PaymentMethodNotRetiring);

    expect((await retire('nagad')).status).toBe(200);
    // Each holds it back on its own. First a shop with it on, Lytro's own page off.
    expect((await lytroTakes('nagad', false)).status).toBe(200);
    const blocked = await remove('nagad');
    expect(blocked.status).toBe(409);
    expect(errorOf(blocked).message).toMatch(SAYS.PaymentMethodRemovalBlocked);
    expect(errorOf(blocked).details).toEqual({ shopsOn: 1, openPayments: 0, lytroTakes: false });

    // Off in the shop, but a shopper's transaction ID still waits to be checked.
    expect((await on.put('/payment-methods/nagad', nagadBody(false))).status).toBe(200);
    const payment = await openPayment(on, 'nagad', 'checking');
    const waiting = await remove('nagad');
    expect(waiting.status).toBe(409);
    expect(errorOf(waiting).details).toEqual({ shopsOn: 0, openPayments: 1, lytroTakes: false });
    await admin.query(
      "UPDATE tenant.payment_sessions SET state = 'verified', decided_at = now() WHERE id = $1",
      [payment],
    );

    // Lytro's own page taking it, alone; a retiring type may still be turned on there.
    expect((await lytroTakes('nagad', true)).status).toBe(200);
    const lytroHolds = await remove('nagad');
    expect(lytroHolds.status).toBe(409);
    expect(errorOf(lytroHolds).details).toEqual({
      shopsOn: 0,
      openPayments: 0,
      lytroTakes: true,
    });
    expect((await lytroTakes('nagad', false)).status).toBe(200);
    expect((await typeOf('nagad'))?.lytroTakes).toBe(false);

    const removed = await remove('nagad');
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    const body = removed.body as { type: TypeRow; cleared: number };
    expect(body.cleared).toBe(2);
    expect(body.type).toMatchObject({ state: 'removed', shopsWithAccounts: 0 });
    expect(body.type.removedAt).not.toBeNull();
    expect(body.type.retiringSince).not.toBeNull();

    // Every shop's accounts for it are gone, and its past payment stays.
    const left = await admin.query(
      "SELECT id FROM tenant.wallet_accounts WHERE method = 'nagad' AND tenant_id = ANY($1)",
      [[on.tenantId, saved.tenantId]],
    );
    expect(left.rows).toEqual([]);
    const past = await admin.query<{ state: string }>(
      'SELECT state FROM tenant.payment_sessions WHERE id = $1',
      [payment],
    );
    expect(past.rows[0]?.state).toBe('verified');
    expect((await activityOf(saved)).map((row) => row.action)).toEqual([
      'payment_method_saved',
      'payment_method_retiring',
      'payment_method_removed',
    ]);
    expect((await activityOf(saved)).at(-1)?.summary).toEqual({ method: 'nagad', accounts: 1 });
  });

  it('makes a switch-on in flight, a shop’s or Lytro’s own, wait for it and then see it removed', async () => {
    const fresh = await openShop(port, texts, 'pmt');
    expect((await retire('nagad')).status).toBe(200);
    // Hold the type's row as a removal does while it checks.
    const removal = new pg.Client({ connectionString: adminDbUrl });
    await removal.connect();
    await removal.query('BEGIN');
    await removal.query(
      "SELECT state FROM control.payment_method_types WHERE method = 'nagad' FOR UPDATE",
    );
    let answered = 0;
    const saving = fresh.put('/payment-methods/nagad', nagadBody(true)).finally(() => {
      answered += 1;
    });
    const turning = lytroTakes('nagad', true).finally(() => {
      answered += 1;
    });
    await new Promise((resolve) => setTimeout(resolve, 750));
    expect(answered).toBe(0);
    await removal.query(
      "UPDATE control.payment_method_types SET state = 'removed', removed_at = now() WHERE method = 'nagad'",
    );
    await removal.query('COMMIT');
    await removal.end();
    const [saved, turned] = await Promise.all([saving, turning]);
    expect(saved.status).toBe(404);
    expect(turned.status).toBe(404);
  });

  it('is gone for good: from every shop, Lytro’s own page, and the operator’s other actions', async () => {
    const on = await shopWithNagad(false);
    expect((await retire('nagad')).status).toBe(200);
    expect((await lytroTakes('nagad', false)).status).toBe(200);
    expect((await remove('nagad')).status).toBe(200);

    expect((await methodsOf(on)).map((row) => row.method)).not.toContain('nagad');
    const fresh = await openShop(port, texts, 'pmt');
    const start = await fresh.put('/payment-methods/nagad', nagadBody(true));
    expect(start.status).toBe(404);
    expect(errorOf(start).message).toMatch(SAYS.PaymentMethodNotFound);
    expect(await shopperMethods(on)).not.toContain('nagad');

    const lytro = await getJson(port, '/operator/payment-methods', operator);
    expect(
      (lytro.body as { methods: { method: string }[] }).methods.map((row) => row.method),
    ).not.toContain('nagad');
    const turnOn = await lytroTakes('nagad', true);
    expect(turnOn.status).toBe(404);
    expect(errorOf(turnOn).message).toMatch(SAYS.PaymentMethodNotFound);

    expect((await retire('nagad')).status).toBe(404);
    expect(errorOf(await undo('nagad')).message).toMatch(SAYS.PaymentMethodNotRetiring);
    // Asked again, it finishes taking away whatever was left, and there is nothing.
    const again = await remove('nagad');
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ cleared: 0, type: { state: 'removed' } });
    const audit = await admin.query<{ action: string }>(
      "SELECT action FROM control.platform_audit_log WHERE action LIKE 'payment_method_type_%' ORDER BY created_at DESC LIMIT 1",
    );
    expect(audit.rows[0]?.action).toBe('payment_method_type_removed');
  });
});
