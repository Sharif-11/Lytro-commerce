import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PlatformSettingKey } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { ClientIp } from '../src/common/client-ip';
import { headerValue, type HttpRequest } from '../src/common/http';
import type { MessageKey } from '../src/common/i18n/message-key';
import { translate } from '../src/common/i18n/messages';
import type { PaymentToVerifyNotice } from '../src/modules/payment-sessions/ports/payment-notifier';
import { PaymentPageOversight } from '../src/modules/payment-sessions/services/payment-page-oversight';
import { PAYMENT_NOTIFIER } from '../src/modules/payment-sessions/tokens';
import { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import { getJson, postJson, sendExact, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 5 Slice 5.3, read agreed 2026-10-31: staff verify the transaction IDs shoppers type, by hand -- for the amount
// that arrived, claimed platform-wide, the order moving on and Meta told then (VER-01, VER-12, PAY-15) -- or reject them
// with a reason the page shows, a checkout's order cancelled (PAY-14, D5-4); an order waiting on its advance is not
// confirmed or sent (D5-9); one list of every payment and its CSV (PAY-19); refunds as a record (PAY-20, ORD-44); a new
// pay-as-you-go shop's online payments capped a day (TVR-04). Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_payment_verify_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const WEBSITE = 'https://myshop.com';
const PAGE_URL = /^http:\/\/pay\.localhost\/([A-Za-z0-9_-]{22})$/;
const OPERATOR_ID = randomUUID();

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const toVerify: PaymentToVerifyNotice[] = [];

/** Lets a test play several visitors: the address is the `x-test-visitor` header's, else the socket's. */
const visitorIp = {
  resolve(request: HttpRequest): string | null {
    return headerValue(request.headers['x-test-visitor']) ?? request.ip ?? null;
  },
  context(request: HttpRequest): { userAgent: string | null; ip: string | null } {
    return {
      userAgent: headerValue(request.headers['user-agent']) ?? null,
      ip: visitorIp.resolve(request),
    };
  },
};

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'payment-verify-e2e-otp-secret-0123456789ab';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(ClientIp)
    .useValue(visitorIp)
    .overrideProvider(PAYMENT_NOTIFIER)
    .useValue({
      paymentToVerify: (notice: PaymentToVerifyNotice) => {
        toVerify.push(notice);
        return Promise.resolve();
      },
    })
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

interface Link {
  paymentUrl: string;
  amount: string;
  expiresAt: string;
}

interface OrderBody {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  grandTotal: string;
  advanceDue: string;
  due: string;
  customerId: string | null;
  cancelReason: string | null;
  payments: Record<string, unknown>[];
}

interface Setup {
  shop: ShopClient;
  key: string;
  variantId: string;
  locationId: number;
}

interface Typed {
  ref: string;
  sessionId: string;
  orderId: string;
}

/** What the dashboard is told, in the default language (Bangla). */
function said(key: MessageKey): string {
  return translate(key, 'bn');
}

/** A shop with a bKash account shoppers pay into, a key for its website, and a product needing a 300 TK advance. */
async function payingShop(): Promise<Setup> {
  const shop = await openShop(port, texts, 'ver');
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
    variants: [{ optionIds: [], openingStock: 20 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const key = await shop.post('/api-keys', { name: 'Website', websites: [WEBSITE] });
  return {
    shop,
    key: (key.body as { key: string }).key,
    variantId: (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '',
    locationId: await mirpurOf(shop),
  };
}

async function mirpurOf(shop: ShopClient): Promise<number> {
  const locations = (await shop.get('/locations')).body as {
    zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
  };
  return (
    locations.zillas
      .find((row) => row.nameEn === 'Dhaka')
      ?.thanas.find((row) => row.nameEn === 'Mirpur')?.id ?? 0
  );
}

/** A product with no advance, for cash-on-delivery orders. */
async function plainProduct(shop: ShopClient, name = 'Lamp', price = 300): Promise<string> {
  const made = await shop.post('/products', {
    name,
    basePrice: price,
    variants: [{ optionIds: [], openingStock: 50 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '';
}

/** A shopper's order through the website's key. */
function order(
  setup: Pick<Setup, 'key' | 'variantId' | 'locationId'>,
  extra: Record<string, unknown> = {},
): Promise<HttpResult> {
  return sendExact(
    port,
    'POST',
    '/v1/orders',
    {
      customerName: 'Rahima',
      phone: texts.freshPhone(),
      locationId: setup.locationId,
      deliveryAddress: 'House 12',
      items: [{ variantId: setup.variantId, quantity: 1 }],
      ...extra,
    },
    {
      host: 'api.localhost',
      authorization: `Bearer ${setup.key}`,
      origin: WEBSITE,
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
    },
  );
}

/** A phone order staff enter. */
async function enter(
  shop: ShopClient,
  variantId: string,
  locationId: number,
  quantity = 1,
): Promise<OrderBody> {
  const made = await postJson(
    port,
    '/orders',
    {
      customerName: 'Rahima',
      phone: texts.freshPhone(),
      locationId,
      deliveryAddress: 'House 12',
      items: [{ variantId, quantity }],
    },
    shop.headers({ 'idempotency-key': randomUUID() }),
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as OrderBody;
}

function refOf(payment: { paymentUrl: string } | null | undefined): string {
  const ref = PAGE_URL.exec(payment?.paymentUrl ?? '')?.[1];
  if (!ref) throw new Error(`no payment page in ${JSON.stringify(payment)}`);
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

/** A shopper's order with its advance's transaction ID typed on the page. */
async function typedOrder(
  setup: Setup,
  transactionId: string,
  senderNumber = '01811000002',
): Promise<Typed> {
  const placed = await order(setup, { payment: PAYMENT });
  expect(placed.status, JSON.stringify(placed.body)).toBe(201);
  const ref = refOf((placed.body as { payment: Link }).payment);
  const typed = await pay(ref, { method: 'bkash', transactionId, senderNumber });
  expect(typed.status, JSON.stringify(typed.body)).toBe(201);
  return { ref, ...(await idsOf(ref)) };
}

async function idsOf(ref: string): Promise<{ sessionId: string; orderId: string }> {
  const { rows } = await admin.query<{ id: string; order_id: string }>(
    'SELECT id, order_id FROM tenant.payment_sessions WHERE ref = $1',
    [ref],
  );
  return { sessionId: rows[0]?.id ?? '', orderId: rows[0]?.order_id ?? '' };
}

function verify(
  shop: ShopClient,
  sessionId: string,
  body: unknown = {},
  headers: Record<string, string> = shop.headers(),
): Promise<HttpResult> {
  return postJson(port, `/payments/${sessionId}/verify`, body, headers);
}

function reject(
  shop: ShopClient,
  sessionId: string,
  body: unknown,
  headers: Record<string, string> = shop.headers(),
): Promise<HttpResult> {
  return postJson(port, `/payments/${sessionId}/reject`, body, headers);
}

async function orderOf(shop: ShopClient, orderId: string): Promise<OrderBody> {
  return (await shop.get(`/orders/${orderId}`)).body as OrderBody;
}

async function reserved(variantId: string): Promise<number> {
  const rows = await admin.query<{ reserved: string }>(
    'SELECT reserved FROM tenant.stock_levels WHERE variant_id = $1',
    [variantId],
  );
  return Number(rows.rows[0]?.reserved ?? 0);
}

async function logged(tenantId: string, action: string): Promise<unknown[]> {
  const { rows } = await admin.query<{ summary: unknown }>(
    'SELECT summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2 ORDER BY created_at',
    [tenantId, action],
  );
  return rows.map((row) => row.summary);
}

async function metaQueued(tenantId: string): Promise<string[]> {
  const { rows } = await admin.query<{ payload: { orderId: string } }>(
    `SELECT payload FROM control.job_outbox WHERE queue_name = 'meta_purchase' AND payload->>'tenantId' = $1`,
    [tenantId],
  );
  return rows.map((row) => row.payload.orderId).sort();
}

function getText(
  path: string,
  headers: Record<string, string>,
): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  return new Promise((resolve, fail) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path: `/api/v1${path}`, method: 'GET', headers },
      (res) => {
        let text = '';
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString();
        });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text });
        });
      },
    );
    req.on('error', fail);
    req.end();
  });
}

const PAYMENT = { method: 'bkash', returnUrl: `${WEBSITE}/thanks` };

describeIfDatabase('verifying a payment by hand (VER-01, VER-12, PAY-15, D5-9)', () => {
  it('verifies a typed ID for the amount asked: staff told, claimed platform-wide, the order moves on, audited', async () => {
    const setup = await payingShop();
    const tenantId = setup.shop.tenantId;
    const typed = await typedOrder(setup, 'ver1234567');
    const before = await orderOf(setup.shop, typed.orderId);
    expect(before).toMatchObject({ status: 'unverified', paymentStatus: 'pending_verification' });
    expect(toVerify.filter((notice) => notice.tenantId === tenantId)).toEqual([
      {
        tenantId,
        sessionId: typed.sessionId,
        orderNumber: before.orderNumber,
        method: 'bkash',
        amount: '300.00',
        transactionId: 'VER1234567',
      },
    ]);
    expect((await page(typed.ref)).body).not.toHaveProperty('sessionId');
    // D5-9: not confirmed or sent while it waits on its advance.
    const call = await setup.shop.post(`/orders/${typed.orderId}/calls`, { outcome: 'confirmed' });
    expect(call.status).toBe(409);
    expect(errorOf(call).message).toBe(said('AdvanceNotPaidYet'));
    const ship = await setup.shop.post(`/orders/${typed.orderId}/ship`, {
      courierName: 'Pathao',
      trackingCode: 'PX123',
    });
    expect(ship.status).toBe(409);
    expect(errorOf(ship).message).toBe(said('AdvanceNotPaidYet'));

    const waiting = await setup.shop.get('/payments?status=to_verify');
    expect(waiting.status, JSON.stringify(waiting.body)).toBe(200);
    expect(waiting.body).toMatchObject({
      total: 1,
      amount: '300.00',
      payments: [
        {
          id: typed.sessionId,
          kind: 'session',
          status: 'to_verify',
          order: { id: typed.orderId, orderNumber: before.orderNumber },
          method: 'bkash',
          amount: '300.00',
          senderNumber: '01811000002',
          transactionId: 'VER1234567',
          source: 'checkout',
          decidedBy: null,
        },
      ],
    });

    const verified = await verify(setup.shop, typed.sessionId);
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    expect(verified.body).toMatchObject({
      status: 'pending',
      paymentStatus: 'paid',
      due: (Number(before.grandTotal) - 300).toFixed(2),
      payments: [
        {
          method: 'bkash',
          amount: '300.00',
          senderNumber: '01811000002',
          transactionId: 'VER1234567',
          verificationLevel: 'manual',
          sessionId: typed.sessionId,
          refunded: null,
        },
      ],
    });
    expect((await page(typed.ref)).body).toMatchObject({ state: 'verified', rejected: null });
    const registered = await admin.query(
      'SELECT tenant_id FROM control.used_transaction_ids WHERE transaction_id = $1',
      ['VER1234567'],
    );
    expect(registered.rows).toEqual([{ tenant_id: tenantId }]);
    expect(await logged(tenantId, 'payment_verified')).toEqual([
      {
        orderNumber: before.orderNumber,
        method: 'bkash',
        amount: '300.00',
        transactionId: 'VER1234567',
      },
    ]);
    const listed = await setup.shop.get('/payments');
    expect(listed.body).toMatchObject({
      total: 1,
      payments: [
        {
          kind: 'payment',
          status: 'verified',
          transactionId: 'VER1234567',
          source: 'checkout',
          verificationLevel: 'manual',
          decidedBy: { id: expect.any(String) as string },
        },
      ],
    });
    const again = await verify(setup.shop, typed.sessionId);
    expect(again.status).toBe(409);
    expect(errorOf(again).message).toBe(said('PaymentNotToVerify'));
    // Its advance in, the order is confirmed as any other.
    const confirmed = await setup.shop.post(`/orders/${typed.orderId}/calls`, {
      outcome: 'confirmed',
    });
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
  });

  it('verifies the amount that arrived, never more than is due', async () => {
    const setup = await payingShop();
    const typed = await typedOrder(setup, 'PART123456');
    const before = await orderOf(setup.shop, typed.orderId);
    const over = await verify(setup.shop, typed.sessionId, {
      amount: Number(before.grandTotal) + 1,
    });
    expect(over.status).toBe(409);
    expect(fieldsOf(over)).toEqual({ amount: 'out_of_range' });
    const part = await verify(setup.shop, typed.sessionId, { amount: 250 });
    expect(part.status, JSON.stringify(part.body)).toBe(200);
    expect(part.body).toMatchObject({
      status: 'pending',
      paymentStatus: 'partially_paid',
      due: (Number(before.grandTotal) - 250).toFixed(2),
      payments: [{ amount: '250.00', transactionId: 'PART123456' }],
    });
  });

  it('refuses an ID another payment claimed meanwhile, matched ignoring case, for staff to reject', async () => {
    const setup = await payingShop();
    const typed = await typedOrder(setup, 'clash12345');
    const other = await openShop(port, texts, 'ver');
    const otherOrder = await enter(other, await plainProduct(other), await mirpurOf(other));
    const recorded = await other.post(`/orders/${otherOrder.id}/payments`, {
      method: 'bkash',
      amount: 100,
      senderNumber: '01811000009',
      transactionId: 'Clash12345',
    });
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(201);
    const twice = await other.post(`/orders/${otherOrder.id}/payments`, {
      method: 'bkash',
      amount: 100,
      senderNumber: '01811000009',
      transactionId: 'cLaSh12345',
    });
    expect(fieldsOf(twice)).toEqual({ transactionId: 'already_used' });
    const refused = await verify(setup.shop, typed.sessionId);
    expect(refused.status).toBe(409);
    expect(fieldsOf(refused)).toEqual({ transactionId: 'already_used' });
    expect((await orderOf(setup.shop, typed.orderId)).paymentStatus).toBe('pending_verification');
    const rejected = await reject(setup.shop, typed.sessionId, { reason: 'transaction_id_used' });
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    expect((await page(typed.ref)).body).toMatchObject({
      state: 'failed',
      rejected: { reason: 'transaction_id_used', note: null },
    });
    // A wallet ID keeps one shape wherever it is typed.
    const odd = await other.post(`/orders/${otherOrder.id}/payments`, {
      method: 'bkash',
      amount: 100,
      senderNumber: '01811000009',
      transactionId: 'TX-12345',
    });
    expect(fieldsOf(odd)).toEqual({ transactionId: 'invalid_format' });
  });
});

describeIfDatabase('rejecting a payment (PAY-14, D5-4)', () => {
  it("cancels a checkout's order with the reason the page shows; a staff link's order stays", async () => {
    const setup = await payingShop();
    const tenantId = setup.shop.tenantId;
    const typed = await typedOrder(setup, 'REJ1234567');
    expect(await reserved(setup.variantId)).toBe(1);
    const vague = await reject(setup.shop, typed.sessionId, { reason: 'other' });
    expect(fieldsOf(vague)).toEqual({ note: 'required' });
    const rejected = await reject(setup.shop, typed.sessionId, { reason: 'no_payment_found' });
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    expect(rejected.body).toMatchObject({
      status: 'cancelled',
      cancelReason: 'advance_not_paid',
      paymentStatus: 'payment_failed',
    });
    expect(await reserved(setup.variantId)).toBe(0);
    expect((await page(typed.ref)).body).toMatchObject({
      state: 'failed',
      rejected: { reason: 'no_payment_found', note: null },
    });
    const order = await orderOf(setup.shop, typed.orderId);
    expect(await logged(tenantId, 'payment_rejected')).toEqual([
      {
        orderNumber: order.orderNumber,
        method: 'bkash',
        amount: '300.00',
        transactionId: 'REJ1234567',
        reason: 'no_payment_found',
      },
    ]);
    const listed = await setup.shop.get('/payments?status=rejected');
    expect(listed.body).toMatchObject({
      total: 1,
      payments: [{ id: typed.sessionId, kind: 'session', rejectReason: 'no_payment_found' }],
    });
    expect((await reject(setup.shop, typed.sessionId, { reason: 'other', note: 'x' })).status).toBe(
      409,
    );

    const phoned = await enter(setup.shop, setup.variantId, setup.locationId);
    const made = (
      await postJson(port, `/orders/${phoned.id}/payment-link`, {}, setup.shop.headers())
    ).body as Link;
    expect((await pay(refOf(made), { method: 'bkash', transactionId: 'LNK1234567' })).status).toBe(
      201,
    );
    const linkSession = (await idsOf(refOf(made))).sessionId;
    const noted = await reject(setup.shop, linkSession, {
      reason: 'other',
      note: 'Sent to the wrong number',
    });
    expect(noted.status, JSON.stringify(noted.body)).toBe(200);
    expect(noted.body).toMatchObject({ status: phoned.status, cancelReason: null });
    expect((await page(refOf(made))).body).toMatchObject({
      rejected: { reason: 'other', note: 'Sent to the wrong number' },
    });
  });

  it("needs payments:verify to decide and payments:read to list; another shop's payment is not found", async () => {
    const setup = await payingShop();
    const typed = await typedOrder(setup, 'PRM1234567');
    const reader = await staffWith(port, texts, admin, setup.shop, ['payments:read']);
    const listed = await getJson(port, '/payments', reader);
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    expect((await verify(setup.shop, typed.sessionId, {}, reader)).status).toBe(403);
    expect(
      (await reject(setup.shop, typed.sessionId, { reason: 'no_payment_found' }, reader)).status,
    ).toBe(403);
    const other = await openShop(port, texts, 'ver');
    expect((await verify(other, typed.sessionId)).status).toBe(404);
    expect((await reject(other, typed.sessionId, { reason: 'no_payment_found' })).status).toBe(404);
    expect((await other.get('/payments')).body).toMatchObject({ total: 0, payments: [] });
    expect((await orderOf(setup.shop, typed.orderId)).paymentStatus).toBe('pending_verification');
  });
});

describeIfDatabase('the payments list (PAY-19)', () => {
  it('lists every payment in one list, by status, method, days and search, with totals, and as CSV', async () => {
    const setup = await payingShop();
    const waiting = await typedOrder(setup, 'LIST000001', '01811000011');
    const refused = await typedOrder(setup, 'LIST000002');
    await reject(setup.shop, refused.sessionId, { reason: 'no_payment_found' });
    const refundedOne = await typedOrder(setup, 'LIST000004');
    await verify(setup.shop, refundedOne.sessionId);
    const refundedPayment = (await orderOf(setup.shop, refundedOne.orderId)).payments[0];
    expect(
      (
        await setup.shop.post(
          `/orders/${refundedOne.orderId}/payments/${String(refundedPayment?.['id'])}/refund`,
          { note: 'Sent back by bKash' },
        )
      ).status,
    ).toBe(200);
    const phoned = await enter(setup.shop, await plainProduct(setup.shop), setup.locationId);
    await setup.shop.post(`/orders/${phoned.id}/payments`, { method: 'cash', amount: 100 });
    const wrong = await setup.shop.post(`/orders/${phoned.id}/payments`, {
      method: 'bkash',
      amount: 50,
      senderNumber: '01811000012',
      transactionId: 'LIST000003',
    });
    const wrongId = (wrong.body as OrderBody).payments.find(
      (row) => row['transactionId'] === 'LIST000003',
    )?.['id'];
    await setup.shop.post(`/orders/${phoned.id}/payments/${String(wrongId)}/void`, {
      reason: 'Typed twice',
    });

    const all = (await setup.shop.get('/payments')).body as {
      payments: { status: string }[];
      total: number;
      amount: string;
    };
    expect(all.total).toBe(5);
    expect(all.payments.map((row) => row.status).sort()).toEqual([
      'refunded',
      'rejected',
      'to_verify',
      'verified',
      'voided',
    ]);
    expect(all.amount).toBe('1050.00');
    expect((await setup.shop.get('/payments?status=verified')).body).toMatchObject({
      total: 1,
      amount: '100.00',
      payments: [{ method: 'cash', kind: 'payment', source: null }],
    });
    expect((await setup.shop.get('/payments?method=bkash')).body).toMatchObject({ total: 4 });
    expect((await setup.shop.get('/payments?q=list000002')).body).toMatchObject({
      total: 1,
      payments: [{ id: refused.sessionId, status: 'rejected' }],
    });
    expect((await setup.shop.get('/payments?q=%2B8801811000011')).body).toMatchObject({
      total: 1,
      payments: [{ id: waiting.sessionId, status: 'to_verify' }],
    });
    const waitingOrder = await orderOf(setup.shop, waiting.orderId);
    expect((await setup.shop.get(`/payments?q=${waitingOrder.orderNumber}`)).body).toMatchObject({
      total: 1,
      payments: [{ order: { id: waiting.orderId } }],
    });
    const tomorrow = new Date(Date.now() + 30 * 3_600_000).toISOString().slice(0, 10);
    expect((await setup.shop.get(`/payments?dateFrom=${tomorrow}`)).body).toMatchObject({
      total: 0,
    });
    expect(
      fieldsOf(await setup.shop.get(`/payments?dateFrom=${tomorrow}&dateTo=2020-01-01`)),
    ).toEqual({ dateTo: 'out_of_range' });
    expect((await setup.shop.get('/payments?limit=2&page=2')).body).toMatchObject({
      page: 2,
      limit: 2,
      pages: 3,
      total: 5,
    });
    const csv = await getText('/payments/export?method=bkash', setup.shop.headers());
    expect(csv.status).toBe(200);
    expect(String(csv.headers['content-type'])).toContain('text/csv');
    const lines = csv.body.split('\n');
    expect(lines[0]).toBe(
      'at,orderNumber,status,method,amount,senderNumber,transactionId,source,verificationLevel,decidedBy,decidedAt,rejectReason,note',
    );
    expect(lines).toHaveLength(5);
    expect(csv.body).toContain('Sent back by bKash');
  });
});

describeIfDatabase('refunds (PAY-20, ORD-44)', () => {
  it('records money given back: it stops counting, partly refunded shows partly paid, all of it refunded', async () => {
    const shop = await openShop(port, texts, 'ver');
    const placed = await enter(shop, await plainProduct(shop), await mirpurOf(shop), 2);
    const rest = (Number(placed.grandTotal) - 300).toFixed(2);
    await shop.post(`/orders/${placed.id}/payments`, { method: 'cash', amount: 300 });
    const paid = await shop.post(`/orders/${placed.id}/payments`, {
      method: 'bkash',
      amount: Number(rest),
      senderNumber: '01811000021',
      transactionId: 'RFD1234567',
    });
    expect((paid.body as OrderBody).paymentStatus).toBe('paid');
    const [cash, wallet] = (paid.body as OrderBody).payments.map((row) => String(row['id']));
    const refund = (paymentId: string | undefined, body: unknown): Promise<HttpResult> =>
      shop.post(`/orders/${placed.id}/payments/${paymentId ?? ''}/refund`, body);
    expect(fieldsOf(await refund(wallet, {}))).toEqual({ note: 'required' });
    const part = await refund(wallet, { note: 'Returned the lamp' });
    expect(part.status, JSON.stringify(part.body)).toBe(200);
    expect(part.body).toMatchObject({
      paymentStatus: 'partially_paid',
      due: rest,
      payments: [
        { id: cash, refunded: null },
        {
          id: wallet,
          refunded: { note: 'Returned the lamp', by: { id: expect.any(String) as string } },
        },
      ],
    });
    const twice = await refund(wallet, { note: 'Again' });
    expect(twice.status).toBe(409);
    expect(errorOf(twice).message).toBe(said('PaymentAlreadyRefunded'));
    const voided = await shop.post(`/orders/${placed.id}/payments/${wallet ?? ''}/void`, {
      reason: 'Mistake',
    });
    expect(errorOf(voided).message).toBe(said('PaymentAlreadyRefunded'));
    const all = await refund(cash, { note: 'Cancelled at the door' });
    expect(all.body).toMatchObject({ paymentStatus: 'refunded', due: placed.grandTotal });
    await expect(
      admin.query(
        'UPDATE tenant.payments SET refunded_at = NULL, refund_note = NULL WHERE id = $1',
        [wallet],
      ),
    ).rejects.toThrow(/a refunded payment stays refunded/);
    expect(await logged(shop.tenantId, 'order_payment_refunded')).toHaveLength(2);
  });
});

describeIfDatabase('the new-shop payment cap (TVR-04)', () => {
  it("holds a new pay-as-you-go shop's online payments a day; the operator switches it per shop", async () => {
    const settings = app.get(PlatformSettingsService);
    const oversight = app.get(PaymentPageOversight);
    await settings.set(PlatformSettingKey.NewShopPaymentCapAmount, 500, randomUUID());
    try {
      const payg = await payingShop();
      await admin.query(
        `UPDATE control.tenants SET state = 'pay_as_you_go',
           plan_id = (SELECT id FROM control.plans WHERE name = 'Pay-as-you-go'),
           plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Pay-as-you-go')
         WHERE id = $1`,
        [payg.shop.tenantId],
      );
      await seedBalance(admin, payg.shop.tenantId, '1000.00');
      expect((await order(payg, { payment: PAYMENT })).status).toBe(201);
      const over = await order(payg, { payment: PAYMENT });
      expect(over.status).toBe(409);
      expect(errorOf(over).details).toMatchObject({ reason: 'new_shop_cap' });
      const phoned = await enter(payg.shop, payg.variantId, payg.locationId);
      const noLink = await postJson(
        port,
        `/orders/${phoned.id}/payment-link`,
        {},
        payg.shop.headers(),
      );
      expect(noLink.status).toBe(409);
      expect(errorOf(noLink).message).toBe(said('NewShopCapReached'));
      // A cash-on-delivery order never meets it.
      const bag = await plainProduct(payg.shop, 'Bag', 2000);
      expect((await order({ ...payg, variantId: bag }, { payment: PAYMENT })).status).toBe(201);
      await oversight.setNewShopCap(payg.shop.tenantId, false, OPERATOR_ID, null);
      expect((await order(payg, { payment: PAYMENT })).status).toBe(201);

      // A shop on a plan is not capped until the operator says so.
      const planned = await payingShop();
      expect((await order(planned, { payment: PAYMENT })).status).toBe(201);
      expect((await order(planned, { payment: PAYMENT })).status).toBe(201);
      await oversight.setNewShopCap(planned.shop.tenantId, true, OPERATOR_ID, '203.0.113.9');
      expect((await order(planned, { payment: PAYMENT })).status).toBe(409);
      // Past its first days a shop is no longer new.
      await admin.query(
        "UPDATE control.tenants SET created_at = now() - interval '31 days' WHERE id = $1",
        [planned.shop.tenantId],
      );
      expect((await order(planned, { payment: PAYMENT })).status).toBe(201);
      await oversight.setNewShopCap(planned.shop.tenantId, null, OPERATOR_ID, null);

      expect(await logged(planned.shop.tenantId, 'new_shop_cap_set')).toEqual([
        { capped: true },
        { capped: null },
      ]);
      const platform = await admin.query(
        'SELECT actor_id, host(ip) AS ip, summary FROM control.platform_audit_log WHERE action = $1 AND target_id = $2 ORDER BY created_at',
        ['new_shop_cap_set', planned.shop.tenantId],
      );
      expect(platform.rows[0]).toEqual({
        actor_id: OPERATOR_ID,
        ip: '203.0.113.9',
        summary: { capped: true },
      });
      await expect(
        oversight.setNewShopCap(randomUUID(), true, OPERATOR_ID, null),
      ).rejects.toMatchObject({ code: 'not_found' });
    } finally {
      await settings.set(PlatformSettingKey.NewShopPaymentCapAmount, 20_000, randomUUID());
    }
  });
});

describeIfDatabase("Meta's Purchase and a customer's privacy delete", () => {
  it("tells Meta of a prepaid order once its payment is verified, a cash order's on placing", async () => {
    const setup = await payingShop();
    const tracking = await setup.shop.put('/ad-tracking', {
      metaPixelId: '1234567890',
      conversionsApiToken: 'EAAB-test-token-value',
    });
    expect(tracking.status, JSON.stringify(tracking.body)).toBe(200);
    const typed = await typedOrder(setup, 'META123456');
    expect(await metaQueued(setup.shop.tenantId)).toEqual([]);
    const bag = await plainProduct(setup.shop, 'Bag', 500);
    const cash = await order({ ...setup, variantId: bag });
    expect(cash.status, JSON.stringify(cash.body)).toBe(201);
    const { rows } = await admin.query<{ id: string }>(
      'SELECT id FROM tenant.orders WHERE tracking_id = $1',
      [(cash.body as { trackingId: string }).trackingId],
    );
    expect(await metaQueued(setup.shop.tenantId)).toEqual([rows[0]?.id]);
    expect((await verify(setup.shop, typed.sessionId)).status).toBe(200);
    expect(await metaQueued(setup.shop.tenantId)).toEqual(
      [rows[0]?.id ?? '', typed.orderId].sort(),
    );
  });

  it("clears the number a deleted customer paid from on their orders' payment sessions (CUS-09)", async () => {
    const setup = await payingShop();
    const typed = await typedOrder(setup, 'PRIV123456', '01811000031');
    await reject(setup.shop, typed.sessionId, { reason: 'no_payment_found' });
    const customerId = (await orderOf(setup.shop, typed.orderId)).customerId ?? '';
    expect((await setup.shop.delete(`/customers/${customerId}`)).status).toBe(200);
    const { rows } = await admin.query(
      'SELECT sender_number FROM tenant.payment_sessions WHERE id = $1',
      [typed.sessionId],
    );
    expect(rows).toEqual([{ sender_number: null }]);
  });
});
