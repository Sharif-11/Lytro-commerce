import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PaymentMethod, PaymentWay } from '@lytronix/validators';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { ClientIp } from '../src/common/client-ip';
import { headerValue, type HttpRequest } from '../src/common/http';
import { PlatformWalletsService } from '../src/modules/balance/services/platform-wallets.service';
import { PaymentQueueService } from '../src/modules/billing/services/payment-queue.service';
import { GATEWAY_FETCH } from '../src/modules/gateway/tokens';
import { ListenerPairing } from '../src/modules/listener/services/listener-pairing';
import { LytroCheckouts } from '../src/modules/lytro-payments/services/lytro-checkouts';
import { LytroPaymentMethods } from '../src/modules/lytro-payments/services/lytro-payment-methods';
import { GatewayReconcileTickWorker } from '../src/modules/shared/queue-workers/services/gateway-reconcile-tick-worker';
import { PaymentSessionExpiryTickWorker } from '../src/modules/shared/queue-workers/services/payment-session-expiry-tick-worker';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { FakeBkash, RIGHT_SECRET } from './support/fake-bkash';
import { getJson, sendExact, type HttpResult } from './support/http';
import { payPage, screenOf, type PayPageAnswer } from './support/pay-page';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// PAYMENT-PAGE-DESIGN §8, OPERATOR-CONSOLE-DESIGN §10 (2026-11-09, the owner's read): a shop pays Lytro for a plan, an add-on or a top-up on the
// payment page already built. It sees the methods the operator has on, and the way the operator set for the one it picks decides what follows:
// bKash's own checkout, or send the money and enter the TrxID, confirmed by Lytro's phone or by the operator. Runs only when
// DATABASE_TEST_ADMIN_URL is set. A fake bKash stands in.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_lytro_payment_page_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const OPERATOR_ID = randomUUID();
const VERSION = '1.0.0';
const SENDER = '01811000002';
const APP_KEY = 'lytro-app-key';
const DASHBOARD = 'https://app.example.test';
const KEYS = {
  appKey: APP_KEY,
  appSecret: RIGHT_SECRET,
  username: 'lytro-user',
  password: 'lytro-pass',
  sandbox: true,
  number: '01700000000',
};

let app: INestApplication;
let port: number;
let admin: pg.Client;
let methods: LytroPaymentMethods;
let termId = '';
let planId = '';
const texts = new SmsCapture();
const bkash = new FakeBkash();

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

interface Row {
  id: string;
  status: string;
  transaction_id: string | null;
  sender_number: string | null;
  pay_method: string | null;
  page_ref: string | null;
  review_reason: string | null;
  amount_arrived: string | null;
  id_changes: number;
  gateway_payment_id: string | null;
  gateway_result: string | null;
  test: boolean;
}

interface Phone {
  token: string;
  installationId: string;
}

function trx(): string {
  return randomBytes(5).toString('hex').toUpperCase();
}

function refOf(url: string): string {
  return url.slice(url.lastIndexOf('/') + 1);
}

function receiptText(id: string, amount: string, from = SENDER): string {
  return `You have received Tk ${amount} from ${from}. Fee Tk 0.00. Balance Tk 1,500.00. TrxID ${id} at 03/11/2026 13:58`;
}

async function row(id: string): Promise<Row> {
  const found = await admin.query<Row>('SELECT * FROM control.plan_payments WHERE id = $1', [id]);
  const first = found.rows[0];
  if (!first) throw new Error('no such payment');
  return first;
}

async function balanceOf(shop: ShopClient): Promise<number> {
  return Number(((await shop.get('/balance')).body as { amount: string }).amount);
}

async function topUp(shop: ShopClient, amount = 500): Promise<{ id: string; ref: string }> {
  const quoted = await shop.post('/balance/top-up/quote', { amount });
  expect(quoted.status, JSON.stringify(quoted.body)).toBe(201);
  const { id } = quoted.body as { id: string };
  const opened = await shop.post(`/balance/top-up/${id}/page`, { from: 'balance' });
  expect(opened.status, JSON.stringify(opened.body)).toBe(201);
  return { id, ref: refOf((opened.body as { url: string }).url) };
}

function page(ref: string, query = ''): Promise<PayPageAnswer> {
  return payPage(port, 'GET', `/${ref}${query}`);
}

function typeId(
  ref: string,
  values: { method: string; transactionId: string; senderNumber?: string },
): Promise<PayPageAnswer> {
  return payPage(port, 'POST', `/${ref}/transaction`, {
    lang: 'en',
    method: values.method,
    transactionId: values.transactionId,
    senderNumber: values.senderNumber ?? '',
  });
}

async function lytroPhone(): Promise<Phone> {
  const { code } = await app.get(ListenerPairing).createLytroCode(OPERATOR_ID);
  const installationId = `install-${randomUUID()}`;
  const paired = await sendExact(
    port,
    'POST',
    '/v1/listener/pair',
    { code, installationId, model: 'Redmi 12' },
    {
      host: 'api.localhost',
      'content-type': 'application/json',
      'x-test-visitor': `198.51.100.${String(Math.floor(Math.random() * 250))}`,
      'x-app-version': VERSION,
    },
  );
  expect(paired.status, JSON.stringify(paired.body)).toBe(201);
  return { token: (paired.body as { token: string }).token, installationId };
}

function forward(phone: Phone, text: string): Promise<HttpResult> {
  return sendExact(
    port,
    'POST',
    '/v1/listener/messages',
    { messages: [{ sender: 'bKash', text, receivedAt: new Date().toISOString() }] },
    {
      host: 'api.localhost',
      authorization: `Bearer ${phone.token}`,
      'x-installation-id': phone.installationId,
      'x-app-version': VERSION,
      'content-type': 'application/json',
    },
  );
}

function returned(ref: string, query: { paymentID?: string; status?: string }): Promise<number> {
  const params = new URLSearchParams(query).toString();
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: `/v1/pay/${ref}/gateway-return?${params}`,
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
}

async function automatic(): Promise<void> {
  await methods.saveKeys('bkash', KEYS, OPERATOR_ID);
  await methods.update('bkash', { way: PaymentWay.Automated }, OPERATOR_ID);
}

async function startCheckout(ref: string): Promise<PayPageAnswer> {
  return payPage(port, 'POST', `/${ref}/checkout`, { lang: 'en', method: 'bkash' });
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'lytro-payment-page-otp-secret-0123456789ab';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['DASHBOARD_ORIGIN'] = DASHBOARD;
  process.env['LYTRO_SUPPORT_PHONE'] = '01700000099';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  termId =
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
         VALUES ('১ মাস', '1 month', 1, true, 0) RETURNING id`,
      )
    ).rows[0]?.id ?? '';
  planId =
    (
      await admin.query<{ id: string }>(
        'INSERT INTO control.plans (name, rank, for_sale, limits) VALUES ($1, 970, true, $2) RETURNING id',
        ['Starter', JSON.stringify({ products: 100, staff: 3, storage_mb: 100, bandwidth_gb: 10 })],
      )
    ).rows[0]?.id ?? '';
  await admin.query(
    'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, $3)',
    [planId, termId, '449.00'],
  );
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(ClientIp)
    .useValue(visitorIp)
    .overrideProvider(GATEWAY_FETCH)
    .useValue(bkash.fetch)
    .overrideProvider(GatewayReconcileTickWorker)
    .useValue({})
    .overrideProvider(PaymentSessionExpiryTickWorker)
    .useValue({})
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  methods = app.get(LytroPaymentMethods);
  const wallets = app.get(PlatformWalletsService);
  await wallets.create(
    { provider: 'bKash', number: '01700000000', label: 'One', enabled: true, displayOrder: 0 },
    OPERATOR_ID,
  );
  await wallets.create(
    { provider: 'bKash', number: '01700000002', label: 'Two', enabled: true, displayOrder: 1 },
    OPERATOR_ID,
  );
  await wallets.create(
    { provider: 'Nagad', number: '01700000001', label: 'One', enabled: true, displayOrder: 2 },
    OPERATOR_ID,
  );
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
  delete process.env['DASHBOARD_ORIGIN'];
  delete process.env['LYTRO_SUPPORT_PHONE'];
});

beforeEach(async () => {
  if (!ADMIN_URL) return;
  await admin.query('DELETE FROM control.platform_payment_methods');
  await admin.query('DELETE FROM control.platform_bank_accounts');
  await admin.query('DELETE FROM control.platform_gateway_accounts');
  await admin.query('DELETE FROM control.platform_gateway_uses');
  await admin.query(
    `UPDATE control.listener_devices SET revoked_at = now() WHERE tenant_id IS NULL AND revoked_at IS NULL`,
  );
});

describeIfDatabase('a shop paying Lytro on the payment page', () => {
  describe('the page', () => {
    it('opens with Lytro as the payee and what is being paid for, with nothing of a shop', async () => {
      const shop = await openShop(port, texts, 'lpm-page');
      const { ref } = await topUp(shop);
      const opened = await page(ref, '?lang=en');
      expect(opened.status).toBe(200);
      expect(screenOf(opened)).toBe('pick');
      expect(opened.text).toContain('class="nm">Lytro<');
      expect(opened.text).toContain('Top-up');
      expect(opened.text).toContain('Pay 500 BDT');
      expect(opened.text).not.toContain('#report');
      expect(opened.text).not.toContain('Order ');
      expect(opened.text).toContain('tel:01700000099');
    });

    it("names a plan and its term, in the page's language", async () => {
      const shop = await openShop(port, texts, 'lpm-plan');
      const quoted = await shop.post('/billing/quote', {
        planId,
        billingTermId: termId,
        amount: 449,
      });
      expect(quoted.status, JSON.stringify(quoted.body)).toBe(201);
      const { id } = quoted.body as { id: string };
      const opened = await shop.post(`/billing/payments/${id}/page`, { from: 'checkout' });
      expect(opened.status, JSON.stringify(opened.body)).toBe(201);
      const ref = refOf((opened.body as { url: string }).url);
      expect((await page(ref, '?lang=en')).text).toContain('Starter · 1 month');
      expect((await page(ref)).text).toContain('Starter · ১ মাস');
    });

    it("refuses another shop's payment, and a page once something was sent", async () => {
      const shop = await openShop(port, texts, 'lpm-own');
      const other = await openShop(port, texts, 'lpm-other');
      const { id, ref } = await topUp(shop);
      const refused = await other.post(`/balance/top-up/${id}/page`, { from: 'balance' });
      expect(refused.status).toBe(404);
      // A top-up can't be opened by the plans' route, under another permission.
      const wrongRoute = await shop.post(`/billing/payments/${id}/page`, { from: 'billing' });
      expect(wrongRoute.status).toBe(404);
      await typeId(ref, { method: 'bkash', transactionId: trx(), senderNumber: SENDER });
      const late = await shop.post(`/balance/top-up/${id}/page`, { from: 'balance' });
      expect(late.status).toBe(409);
    });

    it('opens the same page twice, and a new one once it has lapsed', async () => {
      const shop = await openShop(port, texts, 'lpm-again');
      const { id, ref } = await topUp(shop);
      const again = await shop.post(`/balance/top-up/${id}/page`, { from: 'balance' });
      expect(refOf((again.body as { url: string }).url)).toBe(ref);
      await admin.query(
        `UPDATE control.plan_payments SET page_expires_at = now() - interval '1 minute' WHERE id = $1`,
        [id],
      );
      expect(screenOf(await page(ref))).toBe('expired');
      const typed = await typeId(ref, {
        method: 'bkash',
        transactionId: trx(),
        senderNumber: SENDER,
      });
      expect(typed.status).toBe(303);
      expect((await row(id)).transaction_id).toBeNull();
      const fresh = await shop.post(`/balance/top-up/${id}/page`, { from: 'balance' });
      expect(refOf((fresh.body as { url: string }).url)).not.toBe(ref);
    });

    it('works for a shop the shoppers can no longer reach, which is who needs to pay', async () => {
      const shop = await openShop(port, texts, 'lpm-locked');
      const { ref } = await topUp(shop);
      await admin.query(`UPDATE control.tenants SET state = 'locked' WHERE id = $1`, [
        shop.tenantId,
      ]);
      expect(screenOf(await page(ref))).toBe('pick');
    });

    it('answers a reference nobody holds as not found', async () => {
      const missing = await page(randomBytes(16).toString('base64url'));
      expect(missing.status).toBe(404);
    });
  });

  describe("the operator's methods", () => {
    it('starts as things work today: a method with a shown number is on, bKash on the listener', async () => {
      const view = await methods.view();
      const of = (method: PaymentMethod) => view.methods.find((row2) => row2.method === method);
      expect(of(PaymentMethod.Bkash)).toMatchObject({
        enabled: true,
        way: 'listener',
        ways: ['automated', 'listener', 'manual'],
      });
      expect(of(PaymentMethod.Nagad)).toMatchObject({
        enabled: true,
        way: 'manual',
        ways: ['manual'],
      });
      expect((await methods.offered()).map((row2) => row2.method)).toEqual(['bkash', 'nagad']);
    });

    it('offers only what is on, the first number shown for a method', async () => {
      const shop = await openShop(port, texts, 'lpm-off');
      await methods.update('nagad', { enabled: false }, OPERATOR_ID);
      const { ref } = await topUp(shop);
      const opened = await page(ref, '?lang=en');
      expect(opened.text).toContain('w=bkash');
      expect(opened.text).not.toContain('w=nagad');
      const wallet = await page(ref, '?lang=en&w=bkash&hand=1');
      expect(wallet.text).toContain('01700000000');
      expect(wallet.text).not.toContain('01700000002');
    });

    it('refuses a payment by a method turned off meanwhile', async () => {
      const shop = await openShop(port, texts, 'lpm-offnow');
      const { id, ref } = await topUp(shop);
      await methods.update('nagad', { enabled: false }, OPERATOR_ID);
      await typeId(ref, { method: 'nagad', transactionId: trx(), senderNumber: SENDER });
      expect((await row(id)).transaction_id).toBeNull();
    });

    it('says so when nothing is on', async () => {
      const shop = await openShop(port, texts, 'lpm-none');
      await methods.update('bkash', { enabled: false }, OPERATOR_ID);
      await methods.update('nagad', { enabled: false }, OPERATOR_ID);
      const { ref } = await topUp(shop);
      const opened = await page(ref, '?lang=en');
      expect(screenOf(opened)).toBe('no-methods');
      expect(opened.text).toContain('Lytro is not taking online payments right now');
    });

    it('keeps a way the method can have, and automatic needs working keys', async () => {
      await expect(
        methods.update('nagad', { way: PaymentWay.Listener }, OPERATOR_ID),
      ).rejects.toMatchObject({ messageKey: 'PaymentWayNotAvailable' });
      await expect(
        methods.update('bkash', { way: PaymentWay.Automated }, OPERATOR_ID),
      ).rejects.toMatchObject({ messageKey: 'GatewayCredentialsNeeded' });
      await automatic();
      expect((await methods.view()).methods[0]).toMatchObject({
        way: 'automated',
        gateway: { connected: true, sandbox: true, number: '01700000000' },
      });
    });

    it('never returns the keys, and logs that they changed without them', async () => {
      await methods.saveKeys('bkash', KEYS, OPERATOR_ID);
      expect(JSON.stringify(await methods.view())).not.toContain(RIGHT_SECRET);
      const stored = await admin.query<{ credentials: Buffer }>(
        'SELECT credentials FROM control.platform_gateway_accounts',
      );
      expect(stored.rows[0]?.credentials.toString('latin1')).not.toContain(RIGHT_SECRET);
      const logged = await admin.query<{ summary: unknown }>(
        `SELECT summary FROM control.platform_audit_log WHERE action = 'platform_gateway_keys_saved'
         ORDER BY created_at DESC LIMIT 1`,
      );
      expect(JSON.stringify(logged.rows[0]?.summary)).not.toContain(RIGHT_SECRET);
    });

    it('goes back to the listener when the keys are removed', async () => {
      await automatic();
      await methods.removeKeys('bkash', OPERATOR_ID);
      expect((await methods.view()).methods[0]).toMatchObject({
        way: 'listener',
        gateway: { connected: false },
      });
    });

    it('treats keys that no longer open as none, for the operator to enter again', async () => {
      await methods.saveKeys('bkash', KEYS, OPERATOR_ID);
      await admin.query(`UPDATE control.platform_gateway_accounts SET credentials = '\\x00'`);
      expect((await methods.view()).methods[0]?.gateway).toMatchObject({
        connected: false,
        unreadable: true,
      });
      await expect(methods.gatewayFor(PaymentMethod.Bkash, null)).resolves.toBeNull();
    });

    it('takes a bank account and shows it to shops', async () => {
      const shop = await openShop(port, texts, 'lpm-bank');
      await methods.addBankAccount(
        {
          bankName: 'BRAC Bank',
          accountName: 'Lytronix Ltd',
          accountNumber: '1501204567890001',
          branch: 'Gulshan',
        },
        OPERATOR_ID,
      );
      const { id, ref } = await topUp(shop);
      const bank = await page(ref, '?lang=en&w=bank');
      expect(screenOf(bank)).toBe('bank');
      expect(bank.text).toContain('Lytronix Ltd');
      expect(bank.text).toContain('1501204567890001');
      const reference = `TT${trx()}`;
      const typed = await typeId(ref, { method: 'bank', transactionId: reference });
      expect(typed.status).toBe(303);
      expect(await row(id)).toMatchObject({
        status: 'pending',
        pay_method: 'bank',
        sender_number: null,
      });
      expect(screenOf(await page(ref, '?just=1'))).toBe('manual');
    });

    it('needs an operator signed in', async () => {
      const refused = await getJson(port, '/operator/payment-methods', { host: 'localhost' });
      expect(refused.status).toBe(401);
    });
  });

  describe('sending the money and entering the ID', () => {
    it('requires the number a wallet sent from, since Lytro phone checks it', async () => {
      const shop = await openShop(port, texts, 'lpm-sender');
      const { id, ref } = await topUp(shop);
      const typed = await typeId(ref, { method: 'bkash', transactionId: trx() });
      expect(typed.status).toBe(422);
      expect(screenOf(typed)).toBe('wallet');
      expect((await row(id)).transaction_id).toBeNull();
    });

    it("on the listener, Lytro's phone confirms it and the top-up credits what arrived", async () => {
      const shop = await openShop(port, texts, 'lpm-listen');
      const phone = await lytroPhone();
      const { id, ref } = await topUp(shop);
      const before = await balanceOf(shop);
      const transactionId = trx();
      const typed = await typeId(ref, { method: 'bkash', transactionId, senderNumber: SENDER });
      expect(typed.status).toBe(303);
      expect(await row(id)).toMatchObject({ pay_method: 'bkash', status: 'pending' });
      expect((await forward(phone, receiptText(transactionId, '500.00'))).status).toBe(200);
      expect((await row(id)).status).toBe('verified');
      expect(await balanceOf(shop)).toBe(before + 500);
      const done = await page(ref, '?just=1&lang=en');
      expect(screenOf(done)).toBe('verified');
      expect(done.text).toContain('BACK TO DASHBOARD');
      expect(done.text).toContain(`${DASHBOARD}/${shop.slug}/balance`);
    });

    it('matches a receipt that arrived before the ID was typed', async () => {
      const shop = await openShop(port, texts, 'lpm-early');
      const phone = await lytroPhone();
      const { id, ref } = await topUp(shop);
      const transactionId = trx();
      await forward(phone, receiptText(transactionId, '500.00'));
      await typeId(ref, { method: 'bkash', transactionId, senderNumber: SENDER });
      expect((await row(id)).status).toBe('verified');
    });

    it('shows the SMS being matched while a phone is online, and "Lytro will check" with none', async () => {
      const shop = await openShop(port, texts, 'lpm-ring');
      const { ref } = await topUp(shop);
      await typeId(ref, { method: 'bkash', transactionId: trx(), senderNumber: SENDER });
      const noPhone = await page(ref, '?just=1&lang=en');
      expect(screenOf(noPhone)).toBe('manual');
      expect(noPhone.text).toContain('Lytro will check and confirm');
      const phone = await lytroPhone();
      await forward(phone, receiptText(trx(), '10.00'));
      expect(screenOf(await page(ref, '?just=1'))).toBe('checking');
    });

    it('on manual, a receipt never confirms it, and the operator does', async () => {
      const shop = await openShop(port, texts, 'lpm-manual');
      const phone = await lytroPhone();
      await methods.update('bkash', { way: PaymentWay.Manual }, OPERATOR_ID);
      const { id, ref } = await topUp(shop);
      const before = await balanceOf(shop);
      const transactionId = trx();
      await typeId(ref, { method: 'bkash', transactionId, senderNumber: SENDER });
      await forward(phone, receiptText(transactionId, '500.00'));
      expect((await row(id)).status).toBe('pending');
      expect(await balanceOf(shop)).toBe(before);
      expect(screenOf(await page(ref, '?just=1'))).toBe('manual');
      await app.get(PaymentQueueService).approve(id, OPERATOR_ID, null);
      expect((await row(id)).status).toBe('verified');
      expect(await balanceOf(shop)).toBe(before + 500);
    });

    it('sends a wrong amount to the operator, and says so on the page', async () => {
      const shop = await openShop(port, texts, 'lpm-wrong');
      const phone = await lytroPhone();
      const { id, ref } = await topUp(shop);
      const transactionId = trx();
      await typeId(ref, { method: 'bkash', transactionId, senderNumber: SENDER });
      await forward(phone, receiptText(transactionId, '200.00'));
      expect(await row(id)).toMatchObject({
        status: 'needs_review',
        review_reason: 'amount',
        amount_arrived: '200.00',
      });
      const waiting = await page(ref, '?just=1&lang=en');
      expect(screenOf(waiting)).toBe('review');
      expect(waiting.text).toContain('Lytro will check');
    });

    it('refuses an ID another payment holds, on the same screen', async () => {
      const shop = await openShop(port, texts, 'lpm-dup');
      const first = await topUp(shop);
      const other = await openShop(port, texts, 'lpm-dup2');
      const second = await topUp(other);
      const transactionId = trx();
      await typeId(first.ref, { method: 'bkash', transactionId, senderNumber: SENDER });
      const refused = await typeId(second.ref, {
        method: 'bkash',
        transactionId,
        senderNumber: SENDER,
      });
      expect(refused.status).toBe(409);
      expect(refused.text).toContain('This transaction ID has already been used');
    });

    it('refuses an ID used for good anywhere, shop or platform, on the same screen', async () => {
      const shop = await openShop(port, texts, 'lpm-usedid');
      const { id, ref } = await topUp(shop);
      const transactionId = trx();
      await admin.query(
        'INSERT INTO control.used_transaction_ids (transaction_id, tenant_id) VALUES ($1, $2)',
        [transactionId, shop.tenantId],
      );
      const refused = await typeId(ref, { method: 'bkash', transactionId, senderNumber: SENDER });
      expect(refused.status).toBe(409);
      expect(refused.text).toContain('This transaction ID has already been used');
      expect((await row(id)).transaction_id).toBeNull();
    });

    it('lets a mistyped ID be corrected, until the third, and the receipt then meets it', async () => {
      const shop = await openShop(port, texts, 'lpm-fix');
      const phone = await lytroPhone();
      const { id, ref } = await topUp(shop);
      await typeId(ref, { method: 'bkash', transactionId: trx(), senderNumber: SENDER });
      const right = trx();
      const changed = await payPage(port, 'POST', `/${ref}/change`, {
        lang: 'en',
        transactionId: right,
        senderNumber: SENDER,
      });
      expect(changed.status).toBe(303);
      expect(await row(id)).toMatchObject({ transaction_id: right, id_changes: 1 });
      await forward(phone, receiptText(right, '500.00'));
      expect((await row(id)).status).toBe('verified');
      const late = await payPage(port, 'POST', `/${ref}/change`, {
        lang: 'en',
        transactionId: trx(),
        senderNumber: SENDER,
      });
      expect(late.status).toBe(303);
      expect((await row(id)).transaction_id).toBe(right);
    });

    it('stops taking corrections after the third', async () => {
      const shop = await openShop(port, texts, 'lpm-third');
      const { id, ref } = await topUp(shop);
      await typeId(ref, { method: 'bkash', transactionId: trx(), senderNumber: SENDER });
      const correct = (transactionId: string): Promise<PayPageAnswer> =>
        payPage(port, 'POST', `/${ref}/change`, {
          lang: 'en',
          transactionId,
          senderNumber: SENDER,
        });
      for (let time = 0; time < 3; time += 1) await correct(trx());
      const third = (await row(id)).transaction_id;
      expect((await row(id)).id_changes).toBe(3);
      await correct(trx());
      expect((await row(id)).transaction_id).toBe(third);
    });

    it("tells the shop to pay again from Billing when it's rejected, with the operator's note", async () => {
      const shop = await openShop(port, texts, 'lpm-reject');
      const { id, ref } = await topUp(shop);
      await typeId(ref, { method: 'bkash', transactionId: trx(), senderNumber: SENDER });
      await app.get(PaymentQueueService).reject(id, OPERATOR_ID, 'nothing arrived', null);
      const rejected = await page(ref, '?just=1&lang=en');
      expect(screenOf(rejected)).toBe('rejected');
      expect(rejected.text).toContain('Lytro said: &quot;nothing arrived&quot;');
      expect(rejected.text).toContain('You can pay again from Billing.');
    });

    it('has no report to send', async () => {
      const shop = await openShop(port, texts, 'lpm-report');
      const { ref } = await topUp(shop);
      const reported = await payPage(port, 'POST', `/${ref}/report`, {
        lang: 'en',
        reason: 'wrong_amount',
      });
      expect(reported.status).toBe(303);
      const reports = await admin.query('SELECT 1 FROM control.payment_page_reports');
      expect(reports.rowCount).toBe(0);
    });
  });

  describe("bKash's own checkout", () => {
    function paymentIdOf(payment: Row): string {
      if (payment.gateway_payment_id === null) throw new Error('no payment at bKash');
      return payment.gateway_payment_id;
    }

    it('goes to bKash and, confirmed by bKash, credits the top-up with no fee', async () => {
      const shop = await openShop(port, texts, 'lpm-auto');
      await automatic();
      const { id, ref } = await topUp(shop);
      const before = await balanceOf(shop);
      expect(screenOf(await page(ref, '?w=bkash&lang=en'))).toBe('handing');
      const started = await startCheckout(ref);
      expect(started.text).toContain('payment.bkash.test');
      const going = await row(id);
      expect(going).toMatchObject({ pay_method: 'bkash', test: true });
      bkash.authorise(paymentIdOf(going));
      expect(await returned(ref, { paymentID: paymentIdOf(going), status: 'success' })).toBe(302);
      const paid = await row(id);
      expect(paid.status).toBe('verified');
      expect(paid.sender_number).not.toBeNull();
      expect(await balanceOf(shop)).toBe(before + 500);
      expect(screenOf(await page(ref, '?just=1'))).toBe('verified');
    });

    it('shares one payment at bKash between two taps', async () => {
      const shop = await openShop(port, texts, 'lpm-twice');
      await automatic();
      const { ref } = await topUp(shop);
      const creates = bkash.createsOf(APP_KEY).length;
      await Promise.all([startCheckout(ref), startCheckout(ref)]);
      expect(bkash.createsOf(APP_KEY).length).toBe(creates + 1);
      // And a tap later, once the first has finished, lands on the same payment.
      await startCheckout(ref);
      expect(bkash.createsOf(APP_KEY).length).toBe(creates + 1);
    });

    it('trusts nothing in the address: a made-up return changes nothing', async () => {
      const shop = await openShop(port, texts, 'lpm-forged');
      await automatic();
      const { id, ref } = await topUp(shop);
      await startCheckout(ref);
      // Ready at bKash, so only the check on the address stands between a forged return and the money.
      bkash.authorise(paymentIdOf(await row(id)));
      const executes = bkash.executesOf(APP_KEY).length;
      await returned(ref, { paymentID: 'made-up', status: 'success' });
      expect((await row(id)).status).toBe('pending');
      expect(bkash.executesOf(APP_KEY).length).toBe(executes);
    });

    it('confirms once when bKash returns twice', async () => {
      const shop = await openShop(port, texts, 'lpm-dbl');
      await automatic();
      const { id, ref } = await topUp(shop);
      const before = await balanceOf(shop);
      await startCheckout(ref);
      const going = await row(id);
      bkash.authorise(paymentIdOf(going));
      await returned(ref, { paymentID: paymentIdOf(going), status: 'success' });
      await returned(ref, { paymentID: paymentIdOf(going), status: 'success' });
      expect(await balanceOf(shop)).toBe(before + 500);
    });

    it('offers another try or paying by hand after a cancel, and nothing is taken', async () => {
      const shop = await openShop(port, texts, 'lpm-cancel');
      await automatic();
      const { id, ref } = await topUp(shop);
      await startCheckout(ref);
      await returned(ref, { paymentID: paymentIdOf(await row(id)), status: 'cancel' });
      expect(await row(id)).toMatchObject({ status: 'pending', gateway_result: 'cancelled' });
      const back = await page(ref, '?just=1&lang=en');
      expect(screenOf(back)).toBe('pick');
      expect(back.text).toContain('hand=1');
      const byHand = await page(ref, '?w=bkash&hand=1&lang=en');
      expect(screenOf(byHand)).toBe('wallet');
      const transactionId = trx();
      await typeId(ref, { method: 'bkash', transactionId, senderNumber: SENDER });
      expect((await row(id)).transaction_id).toBe(transactionId);
    });

    it("pays by hand when bKash can't start, and the shop is never blocked", async () => {
      const shop = await openShop(port, texts, 'lpm-down');
      await automatic();
      bkash.behave(APP_KEY, { refuseCreate: true });
      const { id, ref } = await topUp(shop);
      const started = await startCheckout(ref);
      bkash.behave(APP_KEY, {});
      expect(started.status).toBe(303);
      expect(started.headers.location).toContain('hand=1');
      expect((await row(id)).gateway_result).toBe('failed');
    });

    it('sends other money than asked to the operator', async () => {
      const shop = await openShop(port, texts, 'lpm-short');
      await automatic();
      const { id, ref } = await topUp(shop);
      const before = await balanceOf(shop);
      await startCheckout(ref);
      const going = await row(id);
      bkash.authorise(paymentIdOf(going));
      bkash.behave(APP_KEY, { paidAmount: '300.00' });
      await returned(ref, { paymentID: paymentIdOf(going), status: 'success' });
      bkash.behave(APP_KEY, {});
      expect(await row(id)).toMatchObject({
        status: 'needs_review',
        review_reason: 'amount',
        amount_arrived: '300.00',
      });
      expect(await balanceOf(shop)).toBe(before);
    });

    it('settles a payment made at bKash whose return never came, on the minute pass', async () => {
      const shop = await openShop(port, texts, 'lpm-late');
      await automatic();
      const { id, ref } = await topUp(shop);
      const before = await balanceOf(shop);
      await startCheckout(ref);
      bkash.authorise(paymentIdOf(await row(id)));
      await admin.query(
        `UPDATE control.plan_payments SET page_expires_at = now() - interval '1 minute' WHERE id = $1`,
        [id],
      );
      expect(await app.get(LytroCheckouts).reconcile(new Date())).toBeGreaterThanOrEqual(1);
      expect((await row(id)).status).toBe('verified');
      expect(await balanceOf(shop)).toBe(before + 500);
    });

    it('lets go of an abandoned checkout on the minute pass', async () => {
      const shop = await openShop(port, texts, 'lpm-gone');
      await automatic();
      const { id, ref } = await topUp(shop);
      await startCheckout(ref);
      await admin.query(
        `UPDATE control.plan_payments SET page_expires_at = now() - interval '1 minute' WHERE id = $1`,
        [id],
      );
      await app.get(LytroCheckouts).reconcile(new Date());
      expect(await row(id)).toMatchObject({
        status: 'pending',
        gateway_payment_id: null,
        gateway_result: 'failed',
      });
    });

    it("counts Lytro's token calls so bKash's limit survives a restart", async () => {
      await automatic();
      const shop = await openShop(port, texts, 'lpm-token');
      const { ref } = await topUp(shop);
      await startCheckout(ref);
      const uses = await admin.query<{ action: string }>(
        'SELECT action FROM control.platform_gateway_uses',
      );
      expect(uses.rows.map((use) => use.action)).toContain('token');
    });
  });
});
