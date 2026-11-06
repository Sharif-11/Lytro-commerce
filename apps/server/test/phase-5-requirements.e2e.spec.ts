import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { ClientIp } from '../src/common/client-ip';
import { GATEWAY_FETCH } from '../src/modules/gateway/tokens';
import { ListenerDevices } from '../src/modules/listener/services/listener-devices';
import type { PaymentToVerifyNotice } from '../src/modules/payment-sessions/ports/payment-notifier';
import { PAYMENT_NOTIFIER } from '../src/modules/payment-sessions/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { GatewayReconcileTickWorker } from '../src/modules/shared/queue-workers/services/gateway-reconcile-tick-worker';
import { PaymentSessionExpiryTickWorker } from '../src/modules/shared/queue-workers/services/payment-session-expiry-tick-worker';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { FakeBkash, RIGHT_SECRET } from './support/fake-bkash';
import { postJson, sendExact, type HttpResult } from './support/http';
import { payPage } from './support/pay-page';
import { PrepaidPath, receiptOf, trx, type PrepaidShop } from './support/prepaid-path';
import { errorOf, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// PHASE-5-PLAN §1, exit criterion 1: the parts of Phase 5's requirements its close-out found built but asserted nowhere --
// bank transfer as a method of its own (WAL-15, WAL-17, VER-01), an amount a shopper sends (PAY-02), both fees on a
// pay-as-you-go order and none on a refund (WAL-20), the gateway's entry in the activity log (AUD-01), and the listener as a
// shop's state and plan allow it (LSN-05, LSN-07, LSN-09, PLN-19). Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_phase_5_requirements_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const STOREFRONT_SECRET = 'phase-5-requirements-e2e-storefront-secret-012345';
const SLOW = 60_000;

let app: INestApplication;
let port: number;
let admin: pg.Client;
let path: PrepaidPath;
const texts = new SmsCapture();
const bkash = new FakeBkash();
const toVerify: PaymentToVerifyNotice[] = [];

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'phase-5-requirements-e2e-otp-secret-01234';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['STOREFRONT_SECRET'] = STOREFRONT_SECRET;
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const visitor = (): string => `203.0.113.${String(Math.floor(Math.random() * 250))}`;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    // Many orders from one test machine: each call as another visitor, so no per-visitor limit gets in the way.
    .overrideProvider(ClientIp)
    .useValue({ resolve: visitor, context: () => ({ userAgent: null, ip: visitor() }) })
    .overrideProvider(GATEWAY_FETCH)
    .useValue(bkash.fetch)
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
  path = new PrepaidPath(port, admin, texts, STOREFRONT_SECRET);
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
  delete process.env['STOREFRONT_SECRET'];
});

async function stateIs(shop: ShopClient, state: string): Promise<void> {
  await admin.query('UPDATE control.tenants SET state = $2 WHERE id = $1', [shop.tenantId, state]);
}

async function onPayAsYouGo(shop: ShopClient): Promise<void> {
  await admin.query(
    `UPDATE control.tenants SET state = 'pay_as_you_go',
       plan_id = (SELECT id FROM control.plans WHERE name = 'Pay-as-you-go'),
       plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Pay-as-you-go')
     WHERE id = $1`,
    [shop.tenantId],
  );
}

/** The shopper's page as its JSON route reads it. */
async function pageOf(
  ref: string,
): Promise<{ state: string; amount: string; methods: { method: string }[] }> {
  const read = await sendExact(port, 'GET', `/v1/pay/${ref}`, undefined, { host: 'api.localhost' });
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return read.body as { state: string; amount: string; methods: { method: string }[] };
}

/** A phone pairing with a code, as the app does. */
function pairWith(code: string): Promise<HttpResult> {
  return sendExact(
    port,
    'POST',
    '/v1/listener/pair',
    { code, installationId: `install-${randomUUID()}`, model: 'Redmi 12' },
    { host: 'api.localhost', 'content-type': 'application/json', 'x-app-version': '1.0.0' },
  );
}

async function codeOf(shop: ShopClient): Promise<string> {
  const made = await shop.post('/listener/pairing-codes', {});
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { code: string }).code;
}

/** A shop taking money by bank transfer alone: two accounts, the second active. */
async function bankOnly(setup: PrepaidShop): Promise<void> {
  const off = await setup.shop.put('/payment-methods/bkash', { enabled: false, accounts: [] });
  expect(off.status, JSON.stringify(off.body)).toBe(200);
  const bank = await setup.shop.put('/payment-methods/bank', {
    enabled: true,
    accounts: [
      {
        accountName: 'Nodi Fashion',
        bankName: 'City Bank',
        accountNumber: '1111111111',
        active: false,
      },
      {
        accountName: 'Nodi Fashion',
        bankName: 'Dutch-Bangla Bank',
        accountNumber: '2222222222',
        branch: 'Gulshan',
        routingNumber: '090261725',
        active: true,
      },
    ],
  });
  expect(bank.status, JSON.stringify(bank.body)).toBe(200);
}

/** A landing order paid by bank transfer, through the shop's own website key. */
async function bankOrder(setup: PrepaidShop): Promise<{ ref: string; sessionId: string }> {
  const key = await setup.shop.post('/api-keys', {
    name: 'Website',
    websites: ['https://nodi.example'],
  });
  const made = await sendExact(
    port,
    'POST',
    '/v1/orders',
    {
      customerName: 'Rahima Akter',
      phone: texts.freshPhone(),
      locationId: setup.locationId,
      deliveryAddress: 'House 12, Road 3',
      items: [{ variantId: setup.variantId, quantity: 1 }],
      payment: { method: 'bank', returnUrl: 'https://nodi.example/thanks' },
    },
    {
      host: 'api.localhost',
      authorization: `Bearer ${(key.body as { key: string }).key}`,
      origin: 'https://nodi.example',
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
    },
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const url = (made.body as { payment: { paymentUrl: string } }).payment.paymentUrl;
  const ref = /([A-Za-z0-9_-]{22})$/.exec(url)?.[1] ?? '';
  const { rows } = await admin.query<{ id: string }>(
    'SELECT id FROM tenant.payment_sessions WHERE ref = $1',
    [ref],
  );
  return { ref, sessionId: rows[0]?.id ?? '' };
}

describeIfDatabase('bank transfer as a method of its own (WAL-15, WAL-17, VER-01)', () => {
  it(
    'shows only the active bank account, takes a session with nothing else on, and always leaves it to staff',
    async () => {
      const setup = await path.shop('reqbank');
      await bankOnly(setup);
      // A phone online changes nothing for a bank transfer: staff check it (VER-01).
      await path.pairPhone(setup.shop);
      const { ref, sessionId } = await bankOrder(setup);
      const page = await pageOf(ref);
      expect(page.methods.map((row) => row.method)).toEqual(['bank']);
      const shown = await payPage(port, 'GET', `/${ref}`);
      expect(shown.text).toContain('2222222222');
      expect(shown.text).toContain('Dutch-Bangla Bank');
      expect(shown.text).not.toContain('1111111111');
      const typed = await sendExact(
        port,
        'POST',
        `/v1/pay/${ref}/transaction`,
        { method: 'bank', transactionId: 'BEFTN2026110601' },
        { host: 'api.localhost', 'content-type': 'application/json' },
      );
      expect(typed.status, JSON.stringify(typed.body)).toBe(201);
      expect(typed.body).toMatchObject({ state: 'checking' });
      expect(toVerify.filter((row) => row.sessionId === sessionId)).toHaveLength(1);

      // Switched off, the method is gone from a new order's page (WAL-15).
      const off = await setup.shop.put('/payment-methods/bank', { enabled: false, accounts: [] });
      expect(off.status, JSON.stringify(off.body)).toBe(200);
      const methods = await sendExact(port, 'GET', '/v1/payment-methods', undefined, {
        host: 'api.localhost',
        authorization: `Bearer ${
          (
            (
              await setup.shop.post('/api-keys', {
                name: 'Site 2',
                websites: ['https://nodi.example'],
              })
            ).body as { key: string }
          ).key
        }`,
        origin: 'https://nodi.example',
      });
      expect(methods.status, JSON.stringify(methods.body)).toBe(200);
      expect(JSON.stringify(methods.body)).not.toContain('2222222222');
    },
    SLOW,
  );
});

describeIfDatabase("the amount is the server's (PAY-02)", () => {
  it('refuses an order sending its own amount, and the page keeps the advance whatever a form adds', async () => {
    const setup = await path.shop('reqamount');
    const key = await setup.shop.post('/api-keys', {
      name: 'Website',
      websites: ['https://nodi.example'],
    });
    const tampered = await sendExact(
      port,
      'POST',
      '/v1/orders',
      {
        customerName: 'Rahima Akter',
        phone: texts.freshPhone(),
        locationId: setup.locationId,
        deliveryAddress: 'House 12',
        items: [{ variantId: setup.variantId, quantity: 1 }],
        payment: { method: 'bkash', returnUrl: 'https://nodi.example/thanks', amount: 1 },
      },
      {
        host: 'api.localhost',
        authorization: `Bearer ${(key.body as { key: string }).key}`,
        origin: 'https://nodi.example',
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
    );
    expect(tampered.status, JSON.stringify(tampered.body)).toBe(400);
    expect(JSON.stringify(tampered.body)).toContain('amount');
    const placed = await path.landingOrder(setup);
    const posted = await payPage(port, 'POST', `/${placed.ref}/transaction`, {
      method: 'bkash',
      transactionId: trx(),
      amount: '1',
    });
    expect(posted.status).toBe(303);
    expect(await pageOf(placed.ref)).toMatchObject({ amount: '300.00', state: 'checking' });
  });
});

describeIfDatabase('fees on a pay-as-you-go order (WAL-20)', () => {
  it(
    "charges a listener-verified advance's fee and the order's own fee, and a refund charges nothing",
    async () => {
      const setup = await path.shop('reqpayg');
      await onPayAsYouGo(setup.shop);
      const phone = await path.pairPhone(setup.shop);
      const placed = await path.landingOrder(setup);
      const id = trx();
      expect((await path.typeId(placed.ref, id)).status).toBe(201);
      expect((await path.forward(phone, receiptOf(id))).status).toBe(200);
      expect(await path.feesOf(setup.shop.tenantId)).toEqual(['-0.30']);
      expect(
        (await setup.shop.post(`/orders/${placed.orderId}/calls`, { outcome: 'confirmed' })).status,
      ).toBe(200);
      const sent = await setup.shop.post(`/orders/${placed.orderId}/ship`, {
        courierName: 'Steadfast',
        trackingCode: 'SF-PAYG',
      });
      expect(sent.status, JSON.stringify(sent.body)).toBe(200);
      const ledger = async (): Promise<string[][]> =>
        (
          await admin.query<{ type: string; amount: string }>(
            `SELECT type, amount FROM tenant.balance_ledger
              WHERE tenant_id = $1 AND type IN ('order_fee', 'verification_fee') ORDER BY created_at`,
            [setup.shop.tenantId],
          )
        ).rows.map((row) => [row.type, row.amount]);
      // 0.10% of the 300 TK verified, then the order fee on its 1,070 TK, each once (PYG-02).
      const charged = await ledger();
      expect(charged.map((row) => row[0])).toEqual(['verification_fee', 'order_fee']);
      expect(charged[0]?.[1]).toBe('-0.30');
      const order = (await setup.shop.get(`/orders/${placed.orderId}`)).body as {
        payments: { id: string; method: string }[];
      };
      const advance = order.payments.find((row) => row.method === 'bkash');
      const refunded = await setup.shop.post(
        `/orders/${placed.orderId}/payments/${advance?.id ?? ''}/refund`,
        { note: 'Sent back by bKash' },
      );
      expect(refunded.status, JSON.stringify(refunded.body)).toBe(200);
      expect(await ledger()).toEqual(charged);
    },
    SLOW,
  );
});

describeIfDatabase("the gateway's entry in the activity log (AUD-01)", () => {
  it('records a payment bKash verified once, by the system', async () => {
    const setup = await path.shop('reqaudit');
    const appKey = `key-${randomUUID()}`;
    expect(
      (
        await setup.shop.put(`/payment-methods/accounts/${setup.accountId}/gateway`, {
          appKey,
          appSecret: RIGHT_SECRET,
          username: 'sandbox-user',
          password: 'sandbox-pass-word',
          sandbox: false,
        })
      ).status,
    ).toBe(200);
    expect(
      (await setup.shop.post(`/payment-methods/accounts/${setup.accountId}/automated`, {})).status,
    ).toBe(200);
    expect((await setup.shop.put('/payment-methods/bkash/way', { way: 'automated' })).status).toBe(
      200,
    );
    const placed = await path.landingOrder(setup);
    const started = await sendExact(
      port,
      'POST',
      `/v1/pay/${placed.ref}/checkout`,
      { method: 'bkash' },
      { host: 'api.localhost', 'content-type': 'application/json' },
    );
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const { rows } = await admin.query<{ gateway_payment_id: string }>(
      'SELECT gateway_payment_id FROM tenant.payment_sessions WHERE id = $1',
      [placed.sessionId],
    );
    const paymentId = rows[0]?.gateway_payment_id ?? '';
    bkash.authorise(paymentId);
    const back = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port,
          path: `/v1/pay/${placed.ref}/gateway-return?paymentID=${paymentId}&status=success`,
          method: 'GET',
          headers: { host: 'api.localhost' },
        },
        (res) => {
          res.resume();
          res.on('end', () => {
            resolve(res.statusCode ?? 0);
          });
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(back).toBe(302);
    const logged = await admin.query<{ actor_id: string | null; summary: Record<string, unknown> }>(
      "SELECT actor_id, summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'payment_verified'",
      [setup.shop.tenantId],
    );
    expect(logged.rows).toHaveLength(1);
    expect(logged.rows[0]?.actor_id).toBeNull();
    expect(logged.rows[0]?.summary).toMatchObject({ method: 'bkash', amount: '300.00' });
  });
});

describeIfDatabase(
  "the listener as the shop's state and plan allow it (LSN-05, LSN-07, LSN-09, PLN-19)",
  () => {
    it(
      'takes uploads in grace, refuses pairing once the shop lapses, and lets a pay-as-you-go shop pair',
      async () => {
        const setup = await path.shop('reqgrace');
        const phone = await path.pairPhone(setup.shop);
        await stateIs(setup.shop, 'grace');
        const upload = await path.forward(phone, receiptOf(trx()));
        expect(upload.status, JSON.stringify(upload.body)).toBe(200);

        const spare = await codeOf(setup.shop);
        await stateIs(setup.shop, 'read_only');
        const refused = await pairWith(spare);
        expect(refused.status).toBe(403);
        expect(errorOf(refused)).toMatchObject({ code: 'tenant_offline' });

        const payg = await path.shop('reqpaygpair');
        await onPayAsYouGo(payg.shop);
        expect((await pairWith(await codeOf(payg.shop))).status).toBe(201);
      },
      SLOW,
    );

    it('refuses a code for a lapsed shop, and gives one to staff who may manage phones (LSN-09)', async () => {
      const setup = await path.shop('reqcode');
      const manager = await staffWith(port, texts, admin, setup.shop, [
        'listener:read',
        'listener:manage',
      ]);
      const made = await postJson(port, '/listener/pairing-codes', {}, manager);
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      await stateIs(setup.shop, 'locked');
      const lapsed = await setup.shop.post('/listener/pairing-codes', {});
      expect(lapsed.status).toBe(403);
      const { rows } = await admin.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM control.listener_pairing_codes WHERE tenant_id = $1',
        [setup.shop.tenantId],
      );
      expect(rows[0]?.n).toBe(1);
    });

    it('purges a code nobody used once it has run out a day ago (LSN-05)', async () => {
      const setup = await path.shop('reqpurge');
      await codeOf(setup.shop);
      await admin.query(
        "UPDATE control.listener_pairing_codes SET expires_at = now() - interval '2 days' WHERE tenant_id = $1",
        [setup.shop.tenantId],
      );
      const purged = await app.get(ListenerDevices).purge(new Date());
      expect(purged.codes).toBeGreaterThanOrEqual(1);
      const { rows } = await admin.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM control.listener_pairing_codes WHERE tenant_id = $1',
        [setup.shop.tenantId],
      );
      expect(rows[0]?.n).toBe(0);
    });

    it('pairs any number of phones on a plan whose paired devices are unlimited (PLN-19)', async () => {
      const setup = await path.shop('requnlimited');
      await admin.query(
        `UPDATE control.tenants SET plan_snapshot = plan_snapshot || '{"paired_devices": null}'::jsonb WHERE id = $1`,
        [setup.shop.tenantId],
      );
      for (let phone = 0; phone < 3; phone += 1) {
        expect((await pairWith(await codeOf(setup.shop))).status).toBe(201);
      }
      const listed = await setup.shop.get('/listener/devices');
      expect(listed.body).toMatchObject({ active: 3, limit: null });
    });
  },
);
