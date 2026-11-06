import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { GATEWAY_FETCH } from '../src/modules/gateway/tokens';
import type { PaymentToVerifyNotice } from '../src/modules/payment-sessions/ports/payment-notifier';
import { PAYMENT_NOTIFIER } from '../src/modules/payment-sessions/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { GatewayReconcileTickWorker } from '../src/modules/shared/queue-workers/services/gateway-reconcile-tick-worker';
import { PaymentSessionExpiryTickWorker } from '../src/modules/shared/queue-workers/services/payment-session-expiry-tick-worker';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import { FakeBkash, RIGHT_SECRET } from './support/fake-bkash';
import { sendExact, type HttpResult } from './support/http';
import { payPage, screenOf } from './support/pay-page';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';
import { expectLedgerAgrees } from './support/stock-ledger';

// PHASE-5-PLAN §1, exit criterion 2: the prepaid golden path, as one test for each verification level, each for one clothing
// shop past its trial. A landing-page order for a shirt needing a 300 TK advance holds its stock; the payment page shows the
// shop's active bKash account; the advance is verified by staff, by a paired phone's receipt, or at bKash's checkout; the
// order goes from Unverified to New, to its confirming call, shipped and delivered, collecting only the cash-on-delivery
// remainder. The fee is charged once: none by hand, 0.10% by the listener, 1.00% at the gateway. After each step `agrees`
// reads the session, the order's two axes, its payments, the balance and its ledger and the stock, and checks that the order's
// paid amount, the balance and the stock each re-derive from their own records. The gateway is a fake bKash, as in
// gateway.e2e.spec.ts; bkash-sandbox.live.spec.ts is the real sandbox. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_payment_golden_path_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const STOREFRONT_SECRET = 'payment-golden-path-e2e-storefront-secret-0123456789';
const PAGE_URL = /^http:\/\/pay\.localhost\/([A-Za-z0-9_-]{22})$/;
const ACTIVE_NUMBER = '01711000001';
const OLD_NUMBER = '01711000007';
const SENDER_NUMBER = '01811000002';
const APP_VERSION = '1.0.0';
const SLOW = 120_000;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const bkash = new FakeBkash();
const toVerify: PaymentToVerifyNotice[] = [];

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'payment-golden-path-e2e-otp-secret-0123456';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['STOREFRONT_SECRET'] = STOREFRONT_SECRET;
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(GATEWAY_FETCH)
    .useValue(bkash.fetch)
    // The path moves itself: no tick may settle or expire a session behind it.
    .overrideProvider(GatewayReconcileTickWorker)
    .useValue({})
    .overrideProvider(PaymentSessionExpiryTickWorker)
    .useValue({})
    .overrideProvider(PAYMENT_NOTIFIER)
    .useValue({
      paymentToVerify: (notice: PaymentToVerifyNotice) => {
        toVerify.push(notice);
        return Promise.resolve();
      },
      paymentVerified: () => Promise.resolve(),
      moneyForClosedOrder: () => Promise.resolve(),
      gatewayNeedsAttention: () => Promise.resolve(),
    })
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
  delete process.env['STOREFRONT_SECRET'];
});

interface Shop {
  shop: ShopClient;
  productId: string;
  variantId: string;
  locationId: number;
  accountId: string;
}

interface Order {
  id: string;
  source: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  grandTotal: string;
  advanceDue: string;
  due: string;
  payments: {
    method: string;
    amount: string;
    verificationLevel: string;
    verifiedBy: { id: string } | null;
    sessionId: string | null;
    voided: object | null;
    refunded: object | null;
  }[];
  history: { field: string; to: string | null }[];
}

/** Everything §1 says must agree after a step. */
interface Figures {
  session: { state: string; feeHeld: string; transactionId: string | null };
  order: { status: string; paymentStatus: string; fulfillmentStatus: string; due: string };
  /** Each payment as method, amount, how it was verified and whether staff did it. */
  payments: [string, string, string, 'staff' | 'system'][];
  balance: { amount: string; held: string };
  /** The verification fees the ledger holds. */
  fees: string[];
  /** The shirt on hand and reserved. */
  stock: [string, string];
}

/** A clothing shop past its trial, with 100 TK of balance, a shirt needing a 300 TK advance, and bKash taken. */
async function clothingShop(prefix: string): Promise<Shop> {
  const shop = await openShop(port, texts, prefix);
  expect((await shop.put('/business-type', { businessType: 'clothing' })).status).toBe(200);
  await admin.query(
    `UPDATE control.tenants SET state = 'active',
       plan_snapshot = coalesce(plan_snapshot, '{}'::jsonb) || '{"paired_devices": 5, "staff": 10}'::jsonb
     WHERE id = $1`,
    [shop.tenantId],
  );
  await seedBalance(admin, shop.tenantId, '100.00');
  // Two accounts, the old one switched off: the page must show the active one alone.
  const saved = await shop.put('/payment-methods/bkash', {
    enabled: true,
    accounts: [
      { accountName: 'Old number', number: OLD_NUMBER, accountType: 'personal', active: false },
      { accountName: 'Nodi Fashion', number: ACTIVE_NUMBER, accountType: 'personal', active: true },
    ],
  });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const methods = (await shop.get('/payment-methods')).body as {
    methods: { method: string; accounts: { id: string; number: string }[] }[];
  };
  const accountId =
    methods.methods
      .find((row) => row.method === 'bkash')
      ?.accounts.find((row) => row.number === ACTIVE_NUMBER)?.id ?? '';
  const made = await shop.post('/products', {
    name: 'Cotton shirt',
    basePrice: 1000,
    paymentPolicy: 'partial_advance',
    advanceAmount: 300,
    variants: [{ optionIds: [], openingStock: 10 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const product = made.body as { id: string; variants: { id: string }[] };
  const { zillas } = (await shop.get('/locations')).body as {
    zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
  };
  const mirpur = zillas
    .find((row) => row.nameEn === 'Dhaka')
    ?.thanas.find((row) => row.nameEn === 'Mirpur');
  return {
    shop,
    productId: product.id,
    variantId: product.variants[0]?.id ?? '',
    locationId: mirpur?.id ?? 0,
    accountId,
  };
}

/** A landing-page order through the shop's storefront key, as its landing page sends it: the payment page's reference. */
async function landingOrder(setup: Shop): Promise<{ ref: string; orderId: string }> {
  const context = await sendExact(
    port,
    'GET',
    `/api/v1/internal/storefront/context?host=${encodeURIComponent(`${setup.shop.slug}.localhost`)}`,
    undefined,
    { host: 'localhost', 'x-lytro-storefront': STOREFRONT_SECRET },
  );
  const found = (context.body as { shop: { key: string; origin: string } | null }).shop;
  if (!found) throw new Error('an open shop has a storefront key');
  const made = await sendExact(
    port,
    'POST',
    '/v1/orders',
    {
      customerName: 'Rahima Akter',
      phone: texts.freshPhone(),
      locationId: setup.locationId,
      deliveryAddress: 'House 12, Road 3',
      source: 'landing_page',
      items: [{ variantId: setup.variantId, quantity: 1 }],
      payment: { method: 'bkash', returnUrl: `${found.origin}/thanks` },
    },
    {
      host: 'api.localhost',
      authorization: `Bearer ${found.key}`,
      origin: found.origin,
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
    },
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const url = (made.body as { payment: { paymentUrl: string } | null }).payment?.paymentUrl ?? '';
  const ref = PAGE_URL.exec(url)?.[1];
  if (!ref) throw new Error(`no payment page in ${url}`);
  const { rows } = await admin.query<{ order_id: string }>(
    'SELECT order_id FROM tenant.payment_sessions WHERE ref = $1',
    [ref],
  );
  return { ref, orderId: rows[0]?.order_id ?? '' };
}

/** The page as the shopper's browser gets it. */
function page(method: 'GET' | 'POST', path: string, body: Record<string, string> | null = null) {
  return payPage(port, method, path, body);
}

/** Staff may not confirm or send an order whose advance hasn't come, and trying changes nothing. */
async function refusedBeforePaid(shop: ShopClient, orderId: string): Promise<void> {
  const confirm = await shop.post(`/orders/${orderId}/calls`, { outcome: 'confirmed' });
  expect(confirm.status, JSON.stringify(confirm.body)).toBe(409);
  const ship = await shop.post(`/orders/${orderId}/ship`, {
    courierName: 'Steadfast',
    trackingCode: 'SF-1',
  });
  expect(ship.status, JSON.stringify(ship.body)).toBe(409);
}

/** The confirming call, shipped, delivered: each step checked. */
async function onToDelivered(
  shop: ShopClient,
  orderId: string,
  agrees: (expected: Figures) => Promise<Order>,
  paid: Figures,
  collected: Figures['payments'][number],
): Promise<Order> {
  const confirming = await shop.post(`/orders/${orderId}/calls`, { outcome: 'confirmed' });
  expect(confirming.status, JSON.stringify(confirming.body)).toBe(200);
  const confirmed: Figures = { ...paid, order: { ...paid.order, status: 'confirmed' } };
  await agrees(confirmed);

  const sent = await shop.post(`/orders/${orderId}/ship`, {
    courierName: 'Steadfast',
    trackingCode: `SF-${randomBytes(3).toString('hex')}`,
  });
  expect(sent.status, JSON.stringify(sent.body)).toBe(200);
  const shipped: Figures = {
    ...confirmed,
    order: { ...confirmed.order, status: 'shipped', fulfillmentStatus: 'shipped' },
    stock: ['9.000', '0.000'],
  };
  await agrees(shipped);

  // Delivered: only what is still due is collected, as cash on delivery. Nothing is charged again.
  const delivered = await shop.post(`/orders/${orderId}/deliver`, {});
  expect(delivered.status, JSON.stringify(delivered.body)).toBe(200);
  return agrees({
    ...shipped,
    order: {
      status: 'delivered',
      paymentStatus: 'paid',
      fulfillmentStatus: 'delivered',
      due: '0.00',
    },
    payments: [...shipped.payments, collected],
  });
}

/** The order's moves, in order, on its two axes and its visible status. */
function pathOf(order: Order): [string, string | null][] {
  return order.history
    .filter((row) => row.field !== 'call')
    .map((row) => [row.field, row.to] as [string, string | null]);
}

/** Reads every figure §1 names, as the shop and the database each hold them, and checks they agree. */
function checker(setup: Shop, ref: string, orderId: string) {
  return async (expected: Figures): Promise<Order> => {
    const { shop } = setup;
    const sessions = await admin.query<{
      state: string;
      fee_held: string;
      transaction_id: string | null;
      id: string;
    }>('SELECT id, state, fee_held, transaction_id FROM tenant.payment_sessions WHERE ref = $1', [
      ref,
    ]);
    const session = sessions.rows[0];
    const opened = await shop.get(`/orders/${orderId}`);
    expect(opened.status, JSON.stringify(opened.body)).toBe(200);
    const order = opened.body as Order;
    const balance = await shop.get('/balance');
    expect(balance.status, JSON.stringify(balance.body)).toBe(200);
    const fees = await admin.query<{ amount: string }>(
      "SELECT amount FROM tenant.balance_ledger WHERE tenant_id = $1 AND type = 'verification_fee' ORDER BY created_at",
      [shop.tenantId],
    );
    const stock = await shop.get(`/products/${setup.productId}/stock`);
    expect(stock.status, JSON.stringify(stock.body)).toBe(200);
    const shirt = (
      stock.body as { variants: { variantId: string; onHand: string; reserved: string }[] }
    ).variants.find((row) => row.variantId === setup.variantId);
    const live = order.payments.filter((row) => row.voided === null && row.refunded === null);
    expect({
      session: {
        state: session?.state,
        feeHeld: session?.fee_held,
        transactionId: session?.transaction_id ?? null,
      },
      order: {
        status: order.status,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        due: order.due,
      },
      payments: live.map((row) => [
        row.method,
        row.amount,
        row.verificationLevel,
        row.verifiedBy === null ? 'system' : 'staff',
      ]),
      balance: {
        amount: (balance.body as { amount: string }).amount,
        held: (balance.body as { held: string }).held,
      },
      fees: fees.rows.map((row) => row.amount),
      stock: [shirt?.onHand, shirt?.reserved],
    }).toEqual(expected);
    // A payment that came through the page names its session, and only that one.
    for (const row of live.filter((one) => one.method === 'bkash')) {
      expect(row.sessionId).toBe(session?.id);
    }
    // The order's paid amount re-derives from its payments (§8, integrity).
    const paid = live.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
    expect(Math.round(Number(order.grandTotal) * 100) - paid).toBe(
      Math.round(Number(order.due) * 100),
    );
    // The balance re-derives from its ledger, and the stock from its movements.
    const ledger = await admin.query<{ total: string }>(
      'SELECT coalesce(sum(amount), 0)::numeric(12, 2)::text AS total FROM tenant.balance_ledger WHERE tenant_id = $1',
      [shop.tenantId],
    );
    expect(ledger.rows[0]?.total).toBe(expected.balance.amount);
    await expectLedgerAgrees(admin, shop.tenantId);
    return order;
  };
}

const NO_FEES = { amount: '100.00', held: '0.00' };

/** Placed from the landing page, its stock held, waiting on its advance: the same for every level. */
const PLACED: Figures = {
  session: { state: 'awaiting_payment', feeHeld: '0.00', transactionId: null },
  order: {
    status: 'unverified',
    paymentStatus: 'pending_verification',
    fulfillmentStatus: 'unfulfilled',
    due: '1070.00',
  },
  payments: [],
  balance: NO_FEES,
  fees: [],
  stock: ['10.000', '1.000'],
};

/** The order once its advance is in, by whichever level. */
function paidBy(level: string, by: 'staff' | 'system', transactionId: string): Figures {
  return {
    ...PLACED,
    session: { state: 'verified', feeHeld: '0.00', transactionId },
    order: {
      status: 'pending',
      paymentStatus: 'paid',
      fulfillmentStatus: 'unfulfilled',
      due: '770.00',
    },
    payments: [['bkash', '300.00', level, by]],
  };
}

const COLLECTED: Figures['payments'][number] = ['cash_on_delivery', '770.00', 'manual', 'staff'];
const PATH: [string, string | null][] = [
  ['created', 'unverified'],
  ['payment_status', 'paid'],
  ['confirmed', 'confirmed'],
  ['fulfillment_status', 'shipped'],
  ['fulfillment_status', 'delivered'],
];

function trx(): string {
  return randomBytes(5).toString('hex').toUpperCase();
}

describeIfDatabase('the prepaid golden path (PHASE-5-PLAN §1, exit criterion 2)', () => {
  it(
    'by staff: the shopper types the ID on the page, staff verify it, and no fee is charged',
    async () => {
      const setup = await clothingShop('paystaff');
      const { ref, orderId } = await landingOrder(setup);
      const agrees = checker(setup, ref, orderId);
      const placed = await agrees(PLACED);
      expect(placed).toMatchObject({
        source: 'landing_page',
        grandTotal: '1070.00',
        advanceDue: '300.00',
      });

      // The page shows the active account's number, not the one switched off.
      const wallet = await page('GET', `/${ref}`);
      expect(screenOf(wallet)).toBe('wallet');
      expect(wallet.text).toContain(`data-copy="${ACTIVE_NUMBER}"`);
      expect(wallet.text).not.toContain(OLD_NUMBER);
      await refusedBeforePaid(setup.shop, orderId);
      await agrees(PLACED);

      // Typed through the page's own form. No phone is paired, so staff are told and the page says the shop checks.
      const id = trx();
      const typed = await page('POST', `/${ref}/transaction`, {
        method: 'bkash',
        transactionId: id,
        senderNumber: SENDER_NUMBER,
        lang: 'en',
      });
      expect(typed.status).toBe(303);
      expect(screenOf(await page('GET', String(typed.headers.location)))).toBe('manual');
      await agrees({
        ...PLACED,
        session: { ...PLACED.session, state: 'checking', transactionId: id },
      });
      expect(toVerify.filter((row) => row.tenantId === setup.shop.tenantId)).toHaveLength(1);

      const sessionId = (
        await admin.query<{ id: string }>('SELECT id FROM tenant.payment_sessions WHERE ref = $1', [
          ref,
        ])
      ).rows[0]?.id;
      const verified = await setup.shop.post(`/payments/${sessionId ?? ''}/verify`, {});
      expect(verified.status, JSON.stringify(verified.body)).toBe(200);
      const paid = paidBy('manual', 'staff', id);
      await agrees(paid);
      // Verifying it again moves nothing.
      expect((await setup.shop.post(`/payments/${sessionId ?? ''}/verify`, {})).status).toBe(409);
      await agrees(paid);
      expect(screenOf(await page('GET', `/${ref}`))).toBe('paid');

      const done = await onToDelivered(setup.shop, orderId, agrees, paid, COLLECTED);
      expect(pathOf(done)).toEqual(PATH);
    },
    SLOW,
  );

  it(
    "by the listener: a paired phone forwards bKash's receipt, the payment verifies itself and 0.10% is charged once",
    async () => {
      const setup = await clothingShop('paylisten');
      const code = await setup.shop.post('/listener/pairing-codes', {});
      expect(code.status, JSON.stringify(code.body)).toBe(201);
      const installationId = `install-${randomUUID()}`;
      const paired = await sendExact(
        port,
        'POST',
        '/v1/listener/pair',
        { code: (code.body as { code: string }).code, installationId, model: 'Redmi 12' },
        { host: 'api.localhost', 'content-type': 'application/json', 'x-app-version': APP_VERSION },
      );
      expect(paired.status, JSON.stringify(paired.body)).toBe(201);
      const phone = {
        host: 'api.localhost',
        authorization: `Bearer ${(paired.body as { token: string }).token}`,
        'x-installation-id': installationId,
        'x-app-version': APP_VERSION,
      };
      const beat = await sendExact(port, 'POST', '/v1/listener/heartbeat', undefined, phone);
      expect(beat.status, JSON.stringify(beat.body)).toBe(200);

      const { ref, orderId } = await landingOrder(setup);
      const agrees = checker(setup, ref, orderId);
      await agrees(PLACED);
      const wallet = await page('GET', `/${ref}`);
      expect(wallet.text).toContain(`data-copy="${ACTIVE_NUMBER}"`);
      expect(wallet.text).not.toContain(OLD_NUMBER);
      await refusedBeforePaid(setup.shop, orderId);

      // A phone is online, so the page waits on it and staff aren't told.
      const id = trx();
      const typed = await page('POST', `/${ref}/transaction`, {
        method: 'bkash',
        transactionId: id,
        senderNumber: SENDER_NUMBER,
        lang: 'en',
      });
      expect(typed.status).toBe(303);
      await agrees({
        ...PLACED,
        session: { ...PLACED.session, state: 'checking', transactionId: id },
      });
      expect(toVerify.filter((row) => row.tenantId === setup.shop.tenantId)).toHaveLength(0);

      const receipt = {
        sender: 'bKash',
        text: `You have received Tk 300.00 from ${SENDER_NUMBER}. Fee Tk 0.00. Balance Tk 1,300.00. TrxID ${id} at 05/11/2026 13:58`,
        receivedAt: new Date().toISOString(),
      };
      const forward = (): Promise<HttpResult> =>
        sendExact(
          port,
          'POST',
          '/v1/listener/messages',
          { messages: [receipt] },
          { ...phone, 'content-type': 'application/json' },
        );
      const sent = await forward();
      expect(sent.status, JSON.stringify(sent.body)).toBe(200);
      expect((sent.body as { results: { status: string }[] }).results[0]?.status).toBe('matched');
      // 0.10% of the 300 TK verified, once.
      const paid: Figures = {
        ...paidBy('listener', 'system', id),
        balance: { amount: '99.70', held: '0.00' },
        fees: ['-0.30'],
      };
      await agrees(paid);
      // The same receipt again verifies nothing more and charges nothing more.
      const again = await forward();
      expect(again.status, JSON.stringify(again.body)).toBe(200);
      await agrees(paid);
      expect(screenOf(await page('GET', `/${ref}`))).toBe('paid');

      const done = await onToDelivered(setup.shop, orderId, agrees, paid, COLLECTED);
      expect(pathOf(done)).toEqual(PATH);
    },
    SLOW,
  );

  it(
    "by the gateway: the page hands on to bKash's checkout, 1.00% is held, and charged once when bKash says it is paid",
    async () => {
      const setup = await clothingShop('paygate');
      const appKey = `key-${randomUUID()}`;
      const credentials = await setup.shop.put(
        `/payment-methods/accounts/${setup.accountId}/gateway`,
        {
          appKey,
          appSecret: RIGHT_SECRET,
          username: 'sandbox-user',
          password: 'sandbox-pass-word',
          sandbox: false,
        },
      );
      expect(credentials.status, JSON.stringify(credentials.body)).toBe(200);
      const selected = await setup.shop.post(
        `/payment-methods/accounts/${setup.accountId}/automated`,
        {},
      );
      expect(selected.status, JSON.stringify(selected.body)).toBe(200);
      const way = await setup.shop.put('/payment-methods/bkash/way', { way: 'automated' });
      expect(way.status, JSON.stringify(way.body)).toBe(200);

      const { ref, orderId } = await landingOrder(setup);
      const agrees = checker(setup, ref, orderId);
      await agrees(PLACED);
      await refusedBeforePaid(setup.shop, orderId);

      // Through the page's own form: it hands the shopper on to bKash, with the fee set aside.
      const handOver = await page('POST', `/${ref}/checkout`, { method: 'bkash', lang: 'en' });
      expect(handOver.status).toBe(200);
      const { rows } = await admin.query<{ gateway_payment_id: string }>(
        'SELECT gateway_payment_id FROM tenant.payment_sessions WHERE ref = $1',
        [ref],
      );
      const paymentId = rows[0]?.gateway_payment_id ?? '';
      expect(handOver.text).toContain(`https://payment.bkash.test/checkout?paymentId=${paymentId}`);
      expect(bkash.createsOf(appKey)[0]?.body).toMatchObject({ amount: '300.00' });
      await agrees({
        ...PLACED,
        session: { ...PLACED.session, feeHeld: '3.00' },
        balance: { amount: '100.00', held: '3.00' },
      });

      // The shopper pays at bKash and is returned; only bKash's own answer verifies it.
      bkash.authorise(paymentId);
      const back = await new Promise<{ status: number; location: string | undefined }>(
        (resolve, reject) => {
          const req = httpRequest(
            {
              host: '127.0.0.1',
              port,
              path: `/v1/pay/${ref}/gateway-return?paymentID=${paymentId}&status=success`,
              method: 'GET',
              headers: { host: 'api.localhost' },
            },
            (res) => {
              res.resume();
              res.on('end', () => {
                resolve({ status: res.statusCode ?? 0, location: res.headers.location });
              });
            },
          );
          req.on('error', reject);
          req.end();
        },
      );
      expect(back).toEqual({ status: 302, location: `http://pay.localhost/${ref}?just=1` });
      const transactionId = (
        await admin.query<{ transaction_id: string }>(
          'SELECT transaction_id FROM tenant.payment_sessions WHERE ref = $1',
          [ref],
        )
      ).rows[0]?.transaction_id;
      expect(transactionId).toEqual(expect.any(String));
      const paid: Figures = {
        ...paidBy('gateway', 'system', transactionId ?? ''),
        balance: { amount: '97.00', held: '0.00' },
        fees: ['-3.00'],
      };
      await agrees(paid);
      expect(bkash.executesOf(appKey)).toHaveLength(1);
      expect(screenOf(await page('GET', `/${ref}`))).toBe('paid');

      const done = await onToDelivered(setup.shop, orderId, agrees, paid, COLLECTED);
      expect(pathOf(done)).toEqual(PATH);
    },
    SLOW,
  );
});
