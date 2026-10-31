import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { PaymentSessionExpiry } from '../src/modules/payment-sessions/services/payment-session-expiry';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { sendExact, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 5 Slice 5.2a, read agreed 2026-10-31: a shopper's order needing an advance is placed unverified with its
// payment page (PAY-01, LND-10, SFT-07); the page shows the shop, the amount and the methods (PAY-05, PAY-17) and takes
// the transaction ID once (PAY-07, PAY-16); the window's end cancels an order nobody paid (D5-4), while one whose ID
// was typed waits for staff (D5-5). Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_payment_sessions_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const WEBSITE = 'https://myshop.com';
const PAGE_URL = /^http:\/\/pay\.localhost\/([A-Za-z0-9_-]{22})$/;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'payment-sessions-e2e-otp-secret-0123456789a';
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

interface Placed {
  status: string;
  trackingId: string;
  payment: { paymentUrl: string; amount: string; expiresAt: string } | null;
}

interface Page {
  shop: { name: string };
  orderNumber: string;
  amount: string;
  state: string;
  method: string | null;
  methods: Record<string, unknown>[];
  submitted: { method: string; transactionId: string; senderNumber: string | null } | null;
}

/** A shop with a bKash account shoppers pay into, a key for its website, and a product needing a 300 TK advance. */
async function payingShop(): Promise<{
  shop: ShopClient;
  key: string;
  variantId: string;
  locationId: number;
}> {
  const shop = await openShop(port, texts, 'ses');
  const saved = await shop.put('/payment-methods/bkash', {
    enabled: true,
    accounts: [
      { accountName: 'Rahim Store', number: '01711000001', accountType: 'personal', active: true },
    ],
  });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const made = await shop.post('/products', {
    name: 'Saree',
    basePrice: 1000,
    paymentPolicy: 'partial_advance',
    advanceAmount: 300,
    variants: [{ optionIds: [], openingStock: 10 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const key = await shop.post('/api-keys', { name: 'Website', websites: [WEBSITE] });
  const locations = (await shop.get('/locations')).body as {
    zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
  };
  const mirpur = locations.zillas
    .find((row) => row.nameEn === 'Dhaka')
    ?.thanas.find((row) => row.nameEn === 'Mirpur');
  return {
    shop,
    key: (key.body as { key: string }).key,
    variantId: (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '',
    locationId: mirpur?.id ?? 0,
  };
}

function keyHeaders(key: string): Record<string, string> {
  return {
    host: 'api.localhost',
    authorization: `Bearer ${key}`,
    origin: WEBSITE,
    'content-type': 'application/json',
  };
}

function order(
  setup: { key: string; variantId: string; locationId: number },
  extra: Record<string, unknown> = {},
  idempotencyKey = randomUUID(),
  phone = texts.freshPhone(),
): Promise<HttpResult> {
  return sendExact(
    port,
    'POST',
    '/v1/orders',
    {
      customerName: 'Rahima',
      phone,
      locationId: setup.locationId,
      deliveryAddress: 'House 12',
      items: [{ variantId: setup.variantId, quantity: 1 }],
      ...extra,
    },
    { ...keyHeaders(setup.key), 'idempotency-key': idempotencyKey },
  );
}

function refOf(placed: Placed): string {
  const ref = PAGE_URL.exec(placed.payment?.paymentUrl ?? '')?.[1];
  if (!ref) throw new Error(`no payment page in ${JSON.stringify(placed)}`);
  return ref;
}

function page(ref: string): Promise<HttpResult> {
  return sendExact(port, 'GET', `/v1/pay/${ref}`, undefined, { host: 'api.localhost' });
}

function pay(ref: string, body: unknown): Promise<HttpResult> {
  return sendExact(port, 'POST', `/v1/pay/${ref}/transaction`, body, {
    host: 'api.localhost',
    'content-type': 'application/json',
  });
}

async function reserved(variantId: string): Promise<number> {
  const rows = await admin.query<{ reserved: string }>(
    'SELECT reserved FROM tenant.stock_levels WHERE variant_id = $1',
    [variantId],
  );
  return Number(rows.rows[0]?.reserved ?? 0);
}

async function staffOrder(shop: ShopClient, trackingId: string): Promise<Record<string, unknown>> {
  const listed = await admin.query<{ id: string }>(
    'SELECT id FROM tenant.orders WHERE tracking_id = $1',
    [trackingId],
  );
  return (await shop.get(`/orders/${listed.rows[0]?.id ?? ''}`)).body as Record<string, unknown>;
}

const PAYMENT = { method: 'bkash', returnUrl: `${WEBSITE}/thanks` };

describeIfDatabase("a shopper's order needing an advance (PAY-01, LND-10, SFT-07)", () => {
  it('is placed unverified, holding its stock, with its payment page for the advance, once per key', async () => {
    const setup = await payingShop();
    const key = randomUUID();
    const phone = texts.freshPhone();
    const first = await order(setup, { payment: PAYMENT }, key, phone);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const placed = first.body as Placed;
    expect(placed.status).toBe('unverified');
    expect(placed.payment?.amount).toBe('300.00');
    expect(placed.payment?.paymentUrl).toMatch(PAGE_URL);
    const minutes = (Date.parse(placed.payment?.expiresAt ?? '') - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
    expect(await reserved(setup.variantId)).toBe(1);
    const again = await order(setup, { payment: PAYMENT }, key, phone);
    expect(again.headers['idempotent-replay']).toBe('true');
    expect((again.body as Placed).payment?.paymentUrl).toBe(placed.payment?.paymentUrl);
    const staff = await staffOrder(setup.shop, placed.trackingId);
    expect(staff).toMatchObject({ status: 'unverified', paymentStatus: 'pending_verification' });
    // An edit keeps it waiting on its payment (D5-9).
    const edited = await setup.shop.patch(`/orders/${String(staff['id'])}`, { notes: 'Gift wrap' });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(edited.body).toMatchObject({
      status: 'unverified',
      paymentStatus: 'pending_verification',
    });
  });

  it("is refused when it can't be paid, and a cash-on-delivery order ignores a payment it doesn't need", async () => {
    const setup = await payingShop();
    const silent = await order(setup);
    expect(silent.status).toBe(400);
    expect(fieldsOf(silent)).toEqual({ payment: 'required' });
    const nagad = await order(setup, { payment: { ...PAYMENT, method: 'nagad' } });
    expect(fieldsOf(nagad)).toEqual({ 'payment.method': 'not_allowed' });
    const elsewhere = await order(setup, { payment: { returnUrl: 'https://evil.example/x' } });
    expect(fieldsOf(elsewhere)).toEqual({ 'payment.returnUrl': 'not_allowed' });
    expect(await reserved(setup.variantId)).toBe(0);
    // With no account active, nothing to pay by.
    await setup.shop.put('/payment-methods/bkash', { enabled: false, accounts: [] });
    const none = await order(setup, { payment: PAYMENT });
    expect(none.status).toBe(409);
    expect(errorOf(none).details).toMatchObject({ reason: 'no_payment_method' });
    const cod = await setup.shop.post('/products', {
      name: 'Bag',
      basePrice: 500,
      variants: [{ optionIds: [], openingStock: 5 }],
    });
    const codVariant = (cod.body as { variants: { id: string }[] }).variants[0]?.id ?? '';
    const placed = await order({ ...setup, variantId: codVariant }, { payment: PAYMENT });
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    expect(placed.body).toMatchObject({ status: 'pending', payment: null });
  });
});

describeIfDatabase('the payment page (PAY-05, PAY-07, PAY-16, PAY-17)', () => {
  it('shows the shop, the amount and the methods, takes the transaction ID once, and tracking follows it', async () => {
    const setup = await payingShop();
    const placed = (await order(setup, { payment: PAYMENT })).body as Placed;
    const ref = refOf(placed);
    const shown = await page(ref);
    expect(shown.status, JSON.stringify(shown.body)).toBe(200);
    const view = shown.body as Page;
    expect(view).toMatchObject({
      amount: '300.00',
      state: 'awaiting_payment',
      method: 'bkash',
      submitted: null,
    });
    expect(view.shop.name).toContain('Shop ses-');
    expect(view.methods.map((row) => [row['method'], row['number']])).toEqual([
      ['bkash', '01711000001'],
    ]);
    expect(Object.keys(view.methods[0] ?? {})).not.toContain('accountId');
    const paid = await pay(ref, {
      method: 'bkash',
      transactionId: 'abc123xyz9',
      senderNumber: '+8801811000002',
    });
    expect(paid.status, JSON.stringify(paid.body)).toBe(201);
    expect(paid.body).toMatchObject({
      state: 'checking',
      submitted: { method: 'bkash', transactionId: 'ABC123XYZ9', senderNumber: '01811000002' },
    });
    const twice = await pay(ref, { method: 'bkash', transactionId: 'ZZZ123XYZ9' });
    expect(twice.status).toBe(409);
    expect(errorOf(twice).details).toMatchObject({ state: 'checking' });
    const tracked = await sendExact(
      port,
      'GET',
      `/v1/track/${placed.trackingId}`,
      undefined,
      keyHeaders(setup.key),
    );
    expect(tracked.body).toMatchObject({
      status: 'unverified',
      payment: { paymentUrl: placed.payment?.paymentUrl, state: 'checking' },
    });
    const logged = await admin.query<{ paid_to: Record<string, unknown> }>(
      'SELECT paid_to FROM tenant.payment_sessions WHERE ref = $1',
      [ref],
    );
    expect(logged.rows[0]?.paid_to).toMatchObject({
      accountName: 'Rahim Store',
      number: '01711000001',
    });
    expect((await page('A'.repeat(22))).status).toBe(404);
    expect((await page('not-a-ref')).status).toBe(404);
  });

  it('refuses an ID a payment already holds, one of the wrong form, and a method the shop does not take', async () => {
    const setup = await payingShop();
    const ref = refOf((await order(setup, { payment: PAYMENT })).body as Placed);
    await admin.query(
      "INSERT INTO control.used_transaction_ids (transaction_id, tenant_id) VALUES ('USED123456', $1)",
      [randomUUID()],
    );
    const used = await pay(ref, { method: 'bkash', transactionId: 'used123456' });
    expect(used.status).toBe(409);
    expect(fieldsOf(used)).toEqual({ transactionId: 'already_used' });
    expect(fieldsOf(await pay(ref, { method: 'bkash', transactionId: 'ab12' }))).toEqual({
      transactionId: 'too_short',
    });
    expect(fieldsOf(await pay(ref, { method: 'bkash', transactionId: 'abc-12345' }))).toEqual({
      transactionId: 'invalid_format',
    });
    expect(fieldsOf(await pay(ref, { method: 'nagad', transactionId: 'abc123xyz9' }))).toEqual({
      method: 'not_allowed',
    });
    expect(((await page(ref)).body as Page).state).toBe('awaiting_payment');
  });
});

describeIfDatabase("the window's end (PAY-03, D5-4, D5-5)", () => {
  it('cancels an order nobody paid, letting its stock go, and keeps one whose ID was typed', async () => {
    const setup = await payingShop();
    const unpaid = (await order(setup, { payment: PAYMENT })).body as Placed;
    const typed = (await order(setup, { payment: PAYMENT })).body as Placed;
    expect((await pay(refOf(typed), { method: 'bkash', transactionId: 'TYPED12345' })).status).toBe(
      201,
    );
    expect(await reserved(setup.variantId)).toBe(2);
    await admin.query(
      "UPDATE tenant.payment_sessions SET expires_at = now() - interval '1 minute' WHERE ref = ANY($1)",
      [[refOf(unpaid), refOf(typed)]],
    );
    // Shown expired at once, before the minute pass runs.
    expect(((await page(refOf(unpaid))).body as Page).state).toBe('expired');
    const expiry = app.get(PaymentSessionExpiry);
    const run = await expiry.runTick(new Date());
    expect(run.expired).toBeGreaterThanOrEqual(1);
    expect(await staffOrder(setup.shop, unpaid.trackingId)).toMatchObject({
      status: 'cancelled',
      cancelReason: 'advance_not_paid',
      paymentStatus: 'payment_failed',
    });
    expect(await staffOrder(setup.shop, typed.trackingId)).toMatchObject({
      status: 'unverified',
      paymentStatus: 'pending_verification',
    });
    expect(await reserved(setup.variantId)).toBe(1);
    expect(((await page(refOf(typed))).body as Page).state).toBe('checking');
    const late = await pay(refOf(unpaid), { method: 'bkash', transactionId: 'LATE123456' });
    expect(late.status).toBe(409);
    // Again: nothing more to do.
    const before = await admin.query(
      'SELECT count(*)::int AS n FROM tenant.activity_log WHERE action = $1',
      ['order_status_changed'],
    );
    await expiry.runTick(new Date());
    const after = await admin.query(
      'SELECT count(*)::int AS n FROM tenant.activity_log WHERE action = $1',
      ['order_status_changed'],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
    const tracked = await sendExact(
      port,
      'GET',
      `/v1/track/${unpaid.trackingId}`,
      undefined,
      keyHeaders(setup.key),
    );
    expect(tracked.body).toMatchObject({ status: 'cancelled', payment: null });
  });
});

describeIfDatabase('isolation (SEC-02)', () => {
  it("shows a page only its own shop's methods", async () => {
    const mine = await payingShop();
    const theirs = await payingShop();
    await theirs.shop.put('/payment-methods/bkash', {
      enabled: true,
      accounts: [
        { accountName: 'Other', number: '01911000009', accountType: 'agent', active: true },
      ],
    });
    const ref = refOf((await order(mine, { payment: PAYMENT })).body as Placed);
    const view = (await page(ref)).body as Page;
    expect(view.methods.map((row) => row['number'])).toEqual(['01711000001']);
    expect(view.shop.name).not.toBe(
      ((await page(refOf((await order(theirs, { payment: PAYMENT })).body as Placed))).body as Page)
        .shop.name,
    );
  });
});
