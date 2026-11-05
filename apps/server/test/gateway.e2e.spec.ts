import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LedgerEntryType, PaymentMethod, PlatformSettingKey, RateKey } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { ClientIp } from '../src/common/client-ip';
import { headerValue, type HttpRequest } from '../src/common/http';
import type { MessageKey } from '../src/common/i18n/message-key';
import { translate } from '../src/common/i18n/messages';
import { dhakaDate } from '../src/common/time';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { RateService } from '../src/modules/balance/services/rate.service';
import { LOW_BALANCE_NOTIFIER } from '../src/modules/balance/tokens';
import { BkashGateway } from '../src/modules/gateway/services/bkash-gateway';
import { CredentialUses } from '../src/modules/gateway/services/credential-uses';
import { GatewayCheckouts } from '../src/modules/gateway/services/gateway-checkout';
import { GatewayReconcile } from '../src/modules/gateway/services/gateway-reconcile';
import { GATEWAY_CLOCK, GATEWAY_FETCH } from '../src/modules/gateway/tokens';
import type {
  GatewayAttentionNotice,
  PaymentToVerifyNotice,
} from '../src/modules/payment-sessions/ports/payment-notifier';
import { PaymentMethodsEraser } from '../src/modules/payment-methods/services/payment-methods-eraser';
import { PaymentSessionExpiry } from '../src/modules/payment-sessions/services/payment-session-expiry';
import { PAYMENT_NOTIFIER } from '../src/modules/payment-sessions/tokens';
import { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { GatewayReconcileTickWorker } from '../src/modules/shared/queue-workers/services/gateway-reconcile-tick-worker';
import { PaymentSessionExpiryTickWorker } from '../src/modules/shared/queue-workers/services/payment-session-expiry-tick-worker';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import { BKASH_SECRET_WORDS, FakeBkash, RIGHT_SECRET } from './support/fake-bkash';
import { getJson, postJson, sendExact, type HttpResult } from './support/http';
import { payPage, screenOf } from './support/pay-page';
import { LowBalanceCapture } from './support/low-balance-capture';
import { errorOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 5 Slice 5.7, read agreed 2026-11-03: a wallet's own checkout. The owner chooses, per wallet, automated checkout, the listener
// or by hand (PAY-06); credentials stay sealed (WAL-09 to WAL-13, SEC-08, SEC-11); only the gateway's own answer verifies a payment,
// once (VER-08, VER-09, VER-12), a failure sends the shopper to the page and tells the owner (VER-10), and test accounts stay out of
// the figures (VER-11). The fee is held before the shopper goes and charged only when the payment is verified (WAL-20, WAL-21). Runs
// only when DATABASE_TEST_ADMIN_URL is set. A fake bKash stands in; test/bkash-sandbox.live.spec.ts is the real one.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_gateway_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const WEBSITE = 'https://myshop.com';
const PAGE_URL = /^http:\/\/pay\.localhost\/([A-Za-z0-9_-]{22})$/;
const PAYMENT = { method: 'bkash', returnUrl: `${WEBSITE}/thanks` };
const VERSION = '1.0.0';
const SENDER_NUMBER = '01811000002';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const SANDBOX_HOST = 'https://tokenized.sandbox.bka.sh/v2';
// Each test places orders and walks them through several steps: longer than the default limit on a busy machine.
const SLOW = 30_000;
vi.setConfig({ testTimeout: SLOW });

let app: INestApplication;
let port: number;
let admin: pg.Client;
let clockShift = 0;
const bkash = new FakeBkash();
const texts = new SmsCapture();
const lowBalance = new LowBalanceCapture();
const toVerify: PaymentToVerifyNotice[] = [];
const attention: GatewayAttentionNotice[] = [];

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
  process.env['OTP_SECRET'] = 'gateway-e2e-otp-secret-0123456789012345678';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(ClientIp)
    .useValue(visitorIp)
    .overrideProvider(LOW_BALANCE_NOTIFIER)
    .useValue(lowBalance)
    .overrideProvider(GATEWAY_FETCH)
    .useValue(bkash.fetch)
    .overrideProvider(GatewayReconcileTickWorker)
    .useValue({})
    .overrideProvider(PaymentSessionExpiryTickWorker)
    .useValue({})
    .overrideProvider(GATEWAY_CLOCK)
    .useValue(() => new Date(Date.now() + clockShift))
    .overrideProvider(PAYMENT_NOTIFIER)
    .useValue({
      paymentToVerify: (notice: PaymentToVerifyNotice) => {
        toVerify.push(notice);
        return Promise.resolve();
      },
      paymentVerified: () => Promise.resolve(),
      moneyForClosedOrder: () => Promise.resolve(),
      gatewayNeedsAttention: (notice: GatewayAttentionNotice) => {
        attention.push(notice);
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

beforeEach(() => {
  clockShift = 0;
});

interface Setup {
  shop: ShopClient;
  key: string;
  variantId: string;
  locationId: number;
  accountId: string;
}

interface Automated extends Setup {
  appKey: string;
}

interface AccountView {
  id: string;
  number: string;
  hasCredentials: boolean;
  credentialsUnreadable: boolean;
  sandbox: boolean;
  automated: boolean;
}

interface MethodView {
  method: string;
  way: string;
  ways: string[];
  levels: string[];
  accounts: AccountView[];
}

interface PageBody {
  state: string;
  method: string | null;
  review: { reason: string } | null;
  listenerOnline: boolean;
  gatewayResult: string | null;
  test: boolean;
  methods: { method: string; way: string; number: string | null }[];
}

interface SessionRow {
  id: string;
  order_id: string;
  state: string;
  fee_held: string;
  gateway_payment_id: string | null;
  gateway_account_id: string | null;
  gateway_url: string | null;
  gateway_result: string | null;
  transaction_id: string | null;
  sender_number: string | null;
  test: boolean;
}

function said(key: MessageKey): string {
  return translate(key, 'bn');
}

function credentials(appKey: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    appKey,
    appSecret: RIGHT_SECRET,
    username: 'sandbox-user',
    password: 'sandbox-pass-word',
    sandbox: false,
    ...extra,
  };
}

/** A shop with a bKash account shoppers pay into, a key for its website and a product needing a 300 TK advance, past its trial. */
async function paidShop(balance = '100.00', advance = 300): Promise<Setup> {
  const setup = await freshShop(advance);
  await admin.query(
    `UPDATE control.tenants SET state = 'active',
       plan_snapshot = coalesce(plan_snapshot, '{}'::jsonb) || '{"paired_devices": 5, "staff": 10}'::jsonb
     WHERE id = $1`,
    [setup.shop.tenantId],
  );
  await seedBalance(admin, setup.shop.tenantId, balance);
  return setup;
}

async function freshShop(advance = 300): Promise<Setup> {
  const shop = await openShop(port, texts, 'gwy');
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
    advanceAmount: advance,
    variants: [{ optionIds: [], openingStock: 50 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const key = await shop.post('/api-keys', { name: 'Website', websites: [WEBSITE] });
  const locations = (await shop.get('/locations')).body as {
    zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
  };
  const method = await bkashOf(shop);
  return {
    shop,
    key: (key.body as { key: string }).key,
    variantId: (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '',
    locationId:
      locations.zillas
        .find((row) => row.nameEn === 'Dhaka')
        ?.thanas.find((row) => row.nameEn === 'Mirpur')?.id ?? 0,
    accountId: method.accounts[0]?.id ?? '',
  };
}

async function bkashOf(shop: ShopClient): Promise<MethodView> {
  const read = await shop.get('/payment-methods');
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  const method = (read.body as { methods: MethodView[] }).methods.find(
    (row) => row.method === 'bkash',
  );
  if (!method) throw new Error('no bKash');
  return method;
}

function saveCredentials(
  shop: ShopClient,
  accountId: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  return shop.put(`/payment-methods/accounts/${accountId}/gateway`, body);
}

/** Makes a shop take bKash through its own checkout, on its active account. */
async function automate(setup: Setup, extra: Record<string, unknown> = {}): Promise<Automated> {
  const appKey = `key-${randomUUID()}`;
  const saved = await saveCredentials(setup.shop, setup.accountId, credentials(appKey, extra));
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const selected = await setup.shop.post(
    `/payment-methods/accounts/${setup.accountId}/automated`,
    {},
  );
  expect(selected.status, JSON.stringify(selected.body)).toBe(200);
  const way = await setup.shop.put('/payment-methods/bkash/way', { way: 'automated' });
  expect(way.status, JSON.stringify(way.body)).toBe(200);
  return { ...setup, appKey };
}

/** A shopper's order through the website's key: the reference of its payment page. */
async function placed(setup: Setup, phone = texts.freshPhone()): Promise<string> {
  const made = await sendExact(
    port,
    'POST',
    '/v1/orders',
    {
      customerName: 'Rahima',
      phone,
      locationId: setup.locationId,
      deliveryAddress: 'House 12',
      items: [{ variantId: setup.variantId, quantity: 1 }],
      payment: PAYMENT,
    },
    {
      host: 'api.localhost',
      authorization: `Bearer ${setup.key}`,
      origin: WEBSITE,
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
      'x-test-visitor': `203.0.113.${String(Math.floor(Math.random() * 250))}`,
    },
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const url = (made.body as { payment: { paymentUrl: string } }).payment.paymentUrl;
  const ref = PAGE_URL.exec(url)?.[1];
  if (!ref) throw new Error(`no payment page in ${url}`);
  return ref;
}

function checkout(ref: string, method = 'bkash'): Promise<HttpResult> {
  return sendExact(
    port,
    'POST',
    `/v1/pay/${ref}/checkout`,
    { method },
    { host: 'api.localhost', 'content-type': 'application/json' },
  );
}

async function started(ref: string): Promise<{ redirectUrl: string | null; paymentId: string }> {
  const sent = await checkout(ref);
  expect(sent.status, JSON.stringify(sent.body)).toBe(200);
  const session = await sessionOf(ref);
  return {
    redirectUrl: (sent.body as { redirectUrl: string | null }).redirectUrl,
    paymentId: session.gateway_payment_id ?? '',
  };
}

/** The wallet returning the shopper: the answer is an address, so this reads no JSON. */
function returned(
  ref: string,
  query: { paymentID?: string; status?: string },
): Promise<{ status: number; location: string | undefined }> {
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
          resolve({ status: res.statusCode ?? 0, location: res.headers.location });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function pageBody(ref: string): Promise<PageBody> {
  const read = await sendExact(port, 'GET', `/v1/pay/${ref}`, undefined, {
    host: 'api.localhost',
  });
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return read.body as PageBody;
}

function typeId(ref: string, transactionId: string): Promise<HttpResult> {
  return sendExact(
    port,
    'POST',
    `/v1/pay/${ref}/transaction`,
    { method: 'bkash', transactionId, senderNumber: SENDER_NUMBER },
    { host: 'api.localhost', 'content-type': 'application/json' },
  );
}

async function sessionOf(ref: string): Promise<SessionRow> {
  const { rows } = await admin.query<SessionRow>(
    `SELECT id, order_id, state, fee_held, gateway_payment_id, gateway_account_id, gateway_url, gateway_result,
            transaction_id, sender_number, test
       FROM tenant.payment_sessions WHERE ref = $1`,
    [ref],
  );
  const row = rows[0];
  if (!row) throw new Error('no session');
  return row;
}

async function paymentsOfOrder(orderId: string): Promise<Record<string, unknown>[]> {
  const { rows } = await admin.query<Record<string, unknown>>(
    'SELECT amount, verification_level, verified_by, transaction_id, session_id, test FROM tenant.payments WHERE order_id = $1',
    [orderId],
  );
  return rows;
}

async function feesOf(tenantId: string): Promise<{ amount: string; reference: unknown }[]> {
  const { rows } = await admin.query<{ amount: string; reference: unknown }>(
    "SELECT amount, reference FROM tenant.balance_ledger WHERE tenant_id = $1 AND type = 'verification_fee' ORDER BY created_at",
    [tenantId],
  );
  return rows;
}

async function logged(tenantId: string, action: string): Promise<Record<string, unknown>[]> {
  const { rows } = await admin.query<{ summary: Record<string, unknown> }>(
    'SELECT summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2 ORDER BY created_at',
    [tenantId, action],
  );
  return rows.map((row) => row.summary);
}

async function balanceOf(shop: ShopClient): Promise<{ amount: string; held: string }> {
  const read = await shop.get('/balance');
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return read.body as { amount: string; held: string };
}

/** A window still open, whatever hour a test has moved the gateway's clock to. */
async function longWindow(ref: string): Promise<void> {
  await admin.query(
    "UPDATE tenant.payment_sessions SET expires_at = now() + interval '4 hours' WHERE ref = $1",
    [ref],
  );
}

/** The window ran out. */
async function pastWindow(ref: string): Promise<void> {
  await admin.query(
    "UPDATE tenant.payment_sessions SET expires_at = now() - interval '1 minute' WHERE ref = $1",
    [ref],
  );
}

function reconcile(): Promise<{ shops: number; settled: number }> {
  return app.get(GatewayReconcile).runTick(new Date(Date.now() + clockShift));
}

async function cancelOrder(shop: ShopClient, orderId: string): Promise<void> {
  const cancelled = await shop.post(`/orders/${orderId}/cancel`, {
    reason: 'other',
    note: 'The shopper rang',
  });
  expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
}

/** Staff changed the order, so it owes this now. */
async function owes(orderId: string, due: string): Promise<void> {
  await admin.query('UPDATE tenant.orders SET due = $2 WHERE id = $1', [orderId, due]);
}

async function payByCash(shop: ShopClient, orderId: string, amount: number): Promise<void> {
  const paid = await shop.post(`/orders/${orderId}/payments`, { method: 'cash', amount });
  expect(paid.status, JSON.stringify(paid.body)).toBe(201);
}

/** An order delivered, so the sales figures read it. */
async function deliveredNow(orderId: string): Promise<void> {
  await admin.query('BEGIN');
  try {
    await admin.query('SET LOCAL session_replication_role = replica');
    await admin.query('UPDATE tenant.orders SET delivered_at = now() WHERE id = $1', [orderId]);
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
}

describeIfDatabase('how a shop takes a wallet (PAY-06, agreed 2026-11-03)', () => {
  it('starts bKash on the listener, offers what each wallet supports, and needs credentials for automated', async () => {
    const setup = await paidShop();
    const view = await bkashOf(setup.shop);
    expect(view).toMatchObject({
      way: 'listener',
      ways: ['automated', 'listener', 'manual'],
      levels: ['manual', 'listener', 'gateway'],
    });
    const all = (await setup.shop.get('/payment-methods')).body as { methods: MethodView[] };
    const nagad = all.methods.find((row) => row.method === 'nagad');
    expect(nagad).toMatchObject({ way: 'manual', ways: ['manual'] });

    const early = await setup.shop.put('/payment-methods/bkash/way', { way: 'automated' });
    expect(early.status).toBe(409);
    expect(errorOf(early).message).toBe(said('GatewayCredentialsNeeded'));
    const notThere = await setup.shop.put('/payment-methods/nagad/way', { way: 'listener' });
    expect(notThere.status).toBe(409);
    expect(errorOf(notThere).message).toBe(said('PaymentWayNotAvailable'));
    const unknown = await setup.shop.put('/payment-methods/bkash/way', { way: 'magic' });
    expect(unknown.status).toBe(400);

    const manual = await setup.shop.put('/payment-methods/bkash/way', { way: 'manual' });
    expect(manual.status, JSON.stringify(manual.body)).toBe(200);
    expect((await bkashOf(setup.shop)).way).toBe('manual');
    expect(await logged(setup.shop.tenantId, 'payment_way_chosen')).toEqual([
      expect.objectContaining({ method: 'bkash', way: 'manual' }),
    ]);
  });

  it(
    "is the owner's alone, and another shop's account is not found",
    async () => {
      const setup = await paidShop();
      const staff = await staffWith(port, texts, admin, setup.shop, ['wallets:read']);
      const paths = [
        ['put', '/payment-methods/bkash/way', { way: 'manual' }],
        ['put', `/payment-methods/accounts/${setup.accountId}/gateway`, credentials('k')],
        ['delete', `/payment-methods/accounts/${setup.accountId}/gateway`, undefined],
        ['post', `/payment-methods/accounts/${setup.accountId}/gateway/test`, {}],
        ['post', `/payment-methods/accounts/${setup.accountId}/automated`, {}],
      ] as const;
      for (const [verb, path, body] of paths) {
        const sent = await sendExact(
          port,
          verb === 'put' ? 'PUT' : verb === 'delete' ? 'DELETE' : 'POST',
          `/api/v1${path}`,
          body,
          staff,
        );
        expect(sent.status, path).toBe(403);
      }

      const other = await paidShop();
      expect((await saveCredentials(other.shop, setup.accountId, credentials('k'))).status).toBe(
        404,
      );
      expect(
        (await other.shop.delete(`/payment-methods/accounts/${setup.accountId}/gateway`)).status,
      ).toBe(404);
      expect(
        (await other.shop.post(`/payment-methods/accounts/${setup.accountId}/gateway/test`, {}))
          .status,
      ).toBe(409);
      expect(
        (await other.shop.post(`/payment-methods/accounts/${setup.accountId}/automated`, {}))
          .status,
      ).toBe(404);
      expect((await saveCredentials(other.shop, 'not-a-uuid', credentials('k'))).status).toBe(404);
    },
    SLOW,
  );

  it('keeps credentials sealed: never returned, never in the clear, never in the log (WAL-09, SEC-08)', async () => {
    const setup = await paidShop();
    const appKey = `key-${randomUUID()}`;
    const saved = await saveCredentials(
      setup.shop,
      setup.accountId,
      credentials(appKey, { sandbox: true }),
    );
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body).toEqual({ ok: true });

    const view = await setup.shop.get('/payment-methods');
    const text = JSON.stringify(view.body);
    expect(text).not.toContain(appKey);
    expect(text).not.toContain(RIGHT_SECRET);
    expect(text).not.toContain('sandbox-pass-word');
    const account = (await bkashOf(setup.shop)).accounts[0];
    expect(account).toMatchObject({
      hasCredentials: true,
      credentialsUnreadable: false,
      sandbox: true,
      automated: false,
    });

    const { rows } = await admin.query<{ gateway_credentials: Buffer }>(
      'SELECT gateway_credentials FROM tenant.wallet_accounts WHERE id = $1',
      [setup.accountId],
    );
    const stored = rows[0]?.gateway_credentials.toString('latin1') ?? '';
    expect(stored).not.toBe('');
    expect(stored).not.toContain(appKey);
    expect(stored).not.toContain(RIGHT_SECRET);

    const logs = JSON.stringify(await logged(setup.shop.tenantId, 'gateway_credentials_saved'));
    expect(logs).not.toContain(appKey);
    expect(logs).not.toContain(RIGHT_SECRET);
    expect(await logged(setup.shop.tenantId, 'gateway_credentials_saved')).toHaveLength(1);

    // Shoppers' reads carry none of it.
    const shopper = await sendExact(port, 'GET', '/v1/payment-methods', undefined, {
      host: 'api.localhost',
      authorization: `Bearer ${setup.key}`,
      origin: WEBSITE,
    });
    expect(shopper.status).toBe(200);
    expect(JSON.stringify(shopper.body)).not.toContain('hasCredentials');
    expect(JSON.stringify(shopper.body)).not.toContain(appKey);

    // A field missing or a stranger is refused, and the query string is never read.
    expect((await saveCredentials(setup.shop, setup.accountId, { appKey })).status).toBe(400);
    expect(
      (
        await saveCredentials(setup.shop, setup.accountId, {
          ...credentials(appKey),
          extra: 'field',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await setup.shop.put(
          `/payment-methods/accounts/${setup.accountId}/gateway?${new URLSearchParams(
            credentials(appKey) as Record<string, string>,
          ).toString()}`,
          {},
        )
      ).status,
    ).toBe(400);
  });

  it('selects one account per wallet, only with credentials, and removing them stops it (WAL-10)', async () => {
    const setup = await paidShop();
    const twoAccounts = await setup.shop.put('/payment-methods/bkash', {
      enabled: true,
      accounts: [
        {
          id: setup.accountId,
          accountName: 'Rahim Store',
          number: '01711000001',
          accountType: 'personal',
          active: true,
        },
        { accountName: 'Second', number: '01711000009', accountType: 'merchant', active: false },
      ],
    });
    expect(twoAccounts.status, JSON.stringify(twoAccounts.body)).toBe(200);
    const accounts = (await bkashOf(setup.shop)).accounts;
    const second = accounts.find((row) => row.number === '01711000009')?.id ?? '';
    const refused = await setup.shop.post(`/payment-methods/accounts/${second}/automated`, {});
    expect(refused.status).toBe(409);
    expect(errorOf(refused).message).toBe(said('GatewayCredentialsNeeded'));

    expect((await saveCredentials(setup.shop, setup.accountId, credentials('first'))).status).toBe(
      200,
    );
    expect((await saveCredentials(setup.shop, second, credentials('second'))).status).toBe(200);
    const one = await setup.shop.post(`/payment-methods/accounts/${setup.accountId}/automated`, {});
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    const two = await setup.shop.post(`/payment-methods/accounts/${second}/automated`, {});
    expect(two.status).toBe(200);
    const after = (await bkashOf(setup.shop)).accounts;
    expect(after.filter((row) => row.automated).map((row) => row.id)).toEqual([second]);
    expect(await logged(setup.shop.tenantId, 'gateway_account_selected')).toHaveLength(2);

    const removed = await setup.shop.delete(`/payment-methods/accounts/${second}/gateway`);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    const left = (await bkashOf(setup.shop)).accounts.find((row) => row.id === second);
    expect(left).toMatchObject({ hasCredentials: false, automated: false, sandbox: false });
    expect(await logged(setup.shop.tenantId, 'gateway_credentials_removed')).toHaveLength(1);
  });

  it('treats credentials it can no longer open as not configured (WAL-12)', async () => {
    const setup = await automate(await paidShop());
    await admin.query(
      "UPDATE tenant.wallet_accounts SET gateway_credentials = '\\xdeadbeef' WHERE id = $1",
      [setup.accountId],
    );
    const account = (await bkashOf(setup.shop)).accounts[0];
    expect(account).toMatchObject({ hasCredentials: false, credentialsUnreadable: true });

    const ref = await placed(setup);
    expect(await started(ref)).toMatchObject({ redirectUrl: null, paymentId: '' });
    expect(bkash.callsOf(setup.appKey)).toHaveLength(0);
    expect((await sessionOf(ref)).fee_held).toBe('0.00');
    const selected = await setup.shop.post(
      `/payment-methods/accounts/${setup.accountId}/automated`,
      {},
    );
    expect(selected.status).toBe(409);
    expect(
      (await setup.shop.post(`/payment-methods/accounts/${setup.accountId}/gateway/test`, {}))
        .status,
    ).toBe(409);
  });

  it('tests a connection with no payment made, and never spends a third token call in an hour (WAL-13)', async () => {
    const setup = await paidShop();
    const appKey = `key-${randomUUID()}`;
    const test = (): Promise<HttpResult> =>
      setup.shop.post(`/payment-methods/accounts/${setup.accountId}/gateway/test`, {});

    const none = await test();
    expect(none.status).toBe(409);
    expect(errorOf(none).message).toBe(said('GatewayCredentialsNeeded'));

    await saveCredentials(
      setup.shop,
      setup.accountId,
      credentials(appKey, { appSecret: 'the-wrong-secret' }),
    );
    const wrong = await test();
    expect(wrong.status, JSON.stringify(wrong.body)).toBe(200);
    expect(wrong.body).toEqual({ ok: false, code: '2001' });
    expect(JSON.stringify(wrong.body)).not.toContain(BKASH_SECRET_WORDS);

    await saveCredentials(setup.shop, setup.accountId, credentials(appKey));
    expect((await test()).body).toEqual({ ok: true, code: null });
    expect(bkash.grantsOf(appKey)).toHaveLength(2);
    // A token held still vouches for the credentials, so this spends nothing.
    expect((await test()).body).toEqual({ ok: true, code: null });
    expect(bkash.grantsOf(appKey)).toHaveLength(2);
    expect(bkash.createsOf(appKey)).toHaveLength(0);

    // New credentials end what was held, and the two calls this hour are spent: the third isn't made.
    await saveCredentials(setup.shop, setup.accountId, credentials(appKey));
    expect((await test()).body).toEqual({ ok: false, code: 'token_limit' });
    expect(bkash.grantsOf(appKey)).toHaveLength(2);

    // An hour on, it may ask again.
    clockShift = HOUR + MINUTE;
    expect((await test()).body).toEqual({ ok: true, code: null });
    expect(bkash.grantsOf(appKey)).toHaveLength(3);
  });

  it("keeps each account's token calls apart", async () => {
    const setup = await paidShop();
    const twoAccounts = await setup.shop.put('/payment-methods/bkash', {
      enabled: true,
      accounts: [
        {
          id: setup.accountId,
          accountName: 'Rahim Store',
          number: '01711000001',
          accountType: 'personal',
          active: true,
        },
        { accountName: 'Second', number: '01711000009', accountType: 'merchant', active: false },
      ],
    });
    expect(twoAccounts.status, JSON.stringify(twoAccounts.body)).toBe(200);
    const second =
      (await bkashOf(setup.shop)).accounts.find((row) => row.number === '01711000009')?.id ?? '';
    const test = (id: string): Promise<HttpResult> =>
      setup.shop.post(`/payment-methods/accounts/${id}/gateway/test`, {});
    await saveCredentials(
      setup.shop,
      setup.accountId,
      credentials(`key-${randomUUID()}`, { appSecret: 'the-wrong-secret' }),
    );
    expect((await test(setup.accountId)).body).toEqual({ ok: false, code: '2001' });
    expect((await test(setup.accountId)).body).toEqual({ ok: false, code: '2001' });
    expect((await test(setup.accountId)).body).toEqual({ ok: false, code: 'token_limit' });

    await saveCredentials(setup.shop, second, credentials(`key-${randomUUID()}`));
    expect((await test(second)).body).toEqual({ ok: true, code: null });
  });

  it(
    'refreshes a token from the 50th minute, and shoppers arriving together share one call',
    async () => {
      const setup = await automate(await paidShop('500.00'));
      const refs = await Promise.all([placed(setup), placed(setup), placed(setup)]);
      const sent = await Promise.all(refs.map((ref) => checkout(ref)));
      for (const one of sent) {
        expect((one.body as { redirectUrl: string | null }).redirectUrl).toMatch(/^https:/);
      }
      expect(bkash.grantsOf(setup.appKey)).toHaveLength(1);
      expect(bkash.createsOf(setup.appKey)).toHaveLength(3);

      clockShift = 51 * MINUTE;
      const later = await placed(setup);
      await longWindow(later);
      expect((await started(later)).redirectUrl).toMatch(/^https:/);
      expect(bkash.grantsOf(setup.appKey)).toHaveLength(1);
      expect(bkash.refreshesOf(setup.appKey)).toHaveLength(1);
      expect(bkash.refreshesOf(setup.appKey)[0]?.body['refresh_token']).toEqual(expect.any(String));

      // Two calls spent: the token it has keeps serving until bKash allows another.
      clockShift = 102 * MINUTE;
      await admin.query(
        "UPDATE tenant.gateway_credential_uses SET at = $2 WHERE tenant_id = $1 AND action = 'token'",
        [setup.shop.tenantId, new Date(Date.now() + 101 * MINUTE)],
      );
      const last = await placed(setup);
      await longWindow(last);
      expect((await started(last)).redirectUrl).toMatch(/^https:/);
      expect(bkash.grantsOf(setup.appKey)).toHaveLength(1);
      expect(bkash.refreshesOf(setup.appKey)).toHaveLength(1);
    },
    SLOW,
  );
});

describeIfDatabase(
  'a payment through the wallet (PAY-06, VER-08, VER-09, VER-12, WAL-20, WAL-21)',
  () => {
    it('goes to bKash, and on return is verified at the gateway, the held fee charged', async () => {
      const setup = await automate(await paidShop());
      const ref = await placed(setup);
      const page = await pageBody(ref);
      expect(page.methods.find((row) => row.method === 'bkash')).toMatchObject({
        way: 'automated',
      });

      const { redirectUrl, paymentId } = await started(ref);
      expect(redirectUrl).toBe(`https://payment.bkash.test/checkout?paymentId=${paymentId}`);
      const [grant] = bkash.grantsOf(setup.appKey);
      expect(grant).toMatchObject({ username: 'sandbox-user', password: 'sandbox-pass-word' });
      expect(grant?.url).toContain('tokenized.pay.bka.sh');
      const [create] = bkash.createsOf(setup.appKey);
      const session = await sessionOf(ref);
      expect(create?.body).toMatchObject({
        amount: '300.00',
        currency: 'BDT',
        intent: 'sale',
        callbackURL: `http://api.localhost/v1/pay/${ref}/gateway-return`,
      });
      expect(session).toMatchObject({
        state: 'awaiting_payment',
        fee_held: '3.00',
        gateway_account_id: setup.accountId,
        gateway_result: null,
        test: false,
      });
      // WAL-21: reserved, not spent.
      expect(await balanceOf(setup.shop)).toMatchObject({ amount: '100.00', held: '3.00' });
      expect(await feesOf(setup.shop.tenantId)).toEqual([]);

      // The same choice again goes to the same payment, for bKash allows one execute of each.
      expect((await started(ref)).redirectUrl).toBe(redirectUrl);
      expect(bkash.createsOf(setup.appKey)).toHaveLength(1);

      bkash.authorise(paymentId);
      const back = await returned(ref, { paymentID: paymentId, status: 'success' });
      expect(back).toEqual({ status: 302, location: `http://pay.localhost/${ref}?just=1` });

      const done = await sessionOf(ref);
      expect(done).toMatchObject({
        state: 'verified',
        fee_held: '0.00',
        sender_number: SENDER_NUMBER,
      });
      expect(await paymentsOfOrder(done.order_id)).toEqual([
        expect.objectContaining({
          amount: '300.00',
          verification_level: 'gateway',
          verified_by: null,
          transaction_id: done.transaction_id,
          session_id: done.id,
          test: false,
        }),
      ]);
      expect(await feesOf(setup.shop.tenantId)).toEqual([
        expect.objectContaining({
          amount: '-3.00',
          reference: expect.objectContaining({ method: 'gateway', sessionId: done.id }) as unknown,
        }),
      ]);
      expect(await balanceOf(setup.shop)).toMatchObject({ amount: '97.00', held: '0.00' });
      // No fee rate raised since changes what was set aside (RAT-15).
      expect(lowBalance.feeShort.filter((row) => row.tenantId === setup.shop.tenantId)).toEqual([]);
    });

    it('settles once, however many times the shopper is returned (VER-09)', async () => {
      const setup = await automate(await paidShop());
      const ref = await placed(setup);
      const { paymentId } = await started(ref);
      bkash.authorise(paymentId);
      await Promise.all([
        returned(ref, { paymentID: paymentId, status: 'success' }),
        returned(ref, { paymentID: paymentId, status: 'success' }),
      ]);
      const executes = bkash.executesOf(setup.appKey).length;
      await returned(ref, { paymentID: paymentId, status: 'success' });
      expect(bkash.executesOf(setup.appKey)).toHaveLength(executes);
      const session = await sessionOf(ref);
      expect(session.state).toBe('verified');
      expect(await paymentsOfOrder(session.order_id)).toHaveLength(1);
      expect(await feesOf(setup.shop.tenantId)).toHaveLength(1);
      expect(await balanceOf(setup.shop)).toMatchObject({ amount: '97.00', held: '0.00' });
    });

    it('trusts nothing a return says: a forged success leaves it unpaid (VER-08)', async () => {
      const setup = await automate(await paidShop());
      const ref = await placed(setup);
      const { paymentId } = await started(ref);

      // A paymentID that isn't this session's, or none, changes nothing and asks nothing.
      await returned(ref, { paymentID: 'TRforged', status: 'success' });
      await returned(ref, { status: 'success' });
      expect(bkash.executesOf(setup.appKey)).toHaveLength(0);
      expect((await sessionOf(ref)).gateway_payment_id).toBe(paymentId);

      // Another shop's payment doesn't settle this one's.
      const other = await automate(await paidShop());
      const otherRef = await placed(other);
      const theirs = await started(otherRef);
      bkash.authorise(theirs.paymentId);
      await returned(ref, { paymentID: theirs.paymentId, status: 'success' });
      expect(bkash.executesOf(other.appKey)).toHaveLength(0);
      expect((await sessionOf(ref)).state).toBe('awaiting_payment');
      expect((await sessionOf(otherRef)).state).toBe('awaiting_payment');

      // The right paymentID and "success", but bKash says it wasn't paid: unverified, no money counted.
      await returned(ref, { paymentID: paymentId, status: 'success' });
      const session = await sessionOf(ref);
      expect(session).toMatchObject({ state: 'awaiting_payment', gateway_result: 'failed' });
      expect(await paymentsOfOrder(session.order_id)).toEqual([]);
      expect(await feesOf(setup.shop.tenantId)).toEqual([]);
      expect(await balanceOf(setup.shop)).toMatchObject({ amount: '100.00', held: '0.00' });
    });

    it('lets a cancelled try go: the hold ends, and the shopper tries again or pays by hand (PAY-08, VER-09)', async () => {
      const setup = await automate(await paidShop());
      const ref = await placed(setup);
      const first = await started(ref);
      await returned(ref, { paymentID: first.paymentId, status: 'cancel' });
      expect(await sessionOf(ref)).toMatchObject({
        state: 'awaiting_payment',
        gateway_result: 'cancelled',
        gateway_payment_id: null,
        gateway_url: null,
        fee_held: '0.00',
      });
      expect(await pageBody(ref)).toMatchObject({
        state: 'awaiting_payment',
        gatewayResult: 'cancelled',
      });
      expect(await balanceOf(setup.shop)).toMatchObject({ held: '0.00' });

      const second = await started(ref);
      expect(second.paymentId).not.toBe(first.paymentId);
      expect(await sessionOf(ref)).toMatchObject({ gateway_result: null, fee_held: '3.00' });
      await returned(ref, { paymentID: second.paymentId, status: 'failure' });
      expect(await sessionOf(ref)).toMatchObject({ gateway_result: 'failed', fee_held: '0.00' });

      // By hand, on the page: staff check it, free (WAL-20).
      const typed = await typeId(ref, randomBytes(5).toString('hex').toUpperCase());
      expect(typed.status, JSON.stringify(typed.body)).toBe(201);
      const session = await sessionOf(ref);
      const verified = await setup.shop.post(`/payments/${session.id}/verify`, {});
      expect(verified.status, JSON.stringify(verified.body)).toBe(200);
      expect(await paymentsOfOrder(session.order_id)).toEqual([
        expect.objectContaining({ verification_level: 'manual' }),
      ]);
      expect(await feesOf(setup.shop.tenantId)).toEqual([]);
    });

    it('asks where a timed-out payment stands, and never executes it twice (VER-09)', async () => {
      const setup = await automate(await paidShop());
      bkash.behave(setup.appKey, { executeTimesOut: true });
      const ref = await placed(setup);
      const { paymentId } = await started(ref);
      bkash.authorise(paymentId);
      await returned(ref, { paymentID: paymentId, status: 'success' });
      expect(bkash.executesOf(setup.appKey)).toHaveLength(1);
      expect(bkash.queriesOf(setup.appKey)).toHaveLength(1);
      expect((await sessionOf(ref)).state).toBe('verified');
      expect(await feesOf(setup.shop.tenantId)).toHaveLength(1);
    });

    it('asks where a payment stands when bKash says it was already completed (VER-09)', async () => {
      const setup = await automate(await paidShop());
      const ref = await placed(setup);
      const { paymentId } = await started(ref);
      bkash.complete(paymentId);
      await returned(ref, { paymentID: paymentId, status: 'success' });
      expect(bkash.queriesOf(setup.appKey)).toHaveLength(1);
      expect((await sessionOf(ref)).state).toBe('verified');
    });

    it("believes bKash's record over a refused execute (VER-09)", async () => {
      const setup = await automate(await paidShop());
      bkash.behave(setup.appKey, { executeRefused: true });
      const ref = await placed(setup);
      const { paymentId } = await started(ref);
      bkash.authorise(paymentId);
      await returned(ref, { paymentID: paymentId, status: 'success' });
      expect(bkash.queriesOf(setup.appKey)).toHaveLength(1);
      expect((await sessionOf(ref)).state).toBe('verified');
      expect(await feesOf(setup.shop.tenantId)).toHaveLength(1);
    });

    it('reads a transaction under either spelling, and never lets go of one it cannot read (VER-08)', async () => {
      const spelled = await automate(await paidShop());
      bkash.behave(spelled.appKey, { trxField: 'trxID', trxId: 'SPELLED077' });
      const ref = await placed(spelled);
      const paid = await started(ref);
      bkash.authorise(paid.paymentId);
      await returned(ref, { paymentID: paid.paymentId, status: 'success' });
      expect(await sessionOf(ref)).toMatchObject({
        state: 'verified',
        transaction_id: 'SPELLED077',
      });

      // bKash says the money moved and not which transaction: not paid, and not given up on either.
      const unread = await automate(await paidShop());
      bkash.behave(unread.appKey, { trxField: 'none' });
      const unreadRef = await placed(unread);
      const taken = await started(unreadRef);
      bkash.authorise(taken.paymentId);
      await returned(unreadRef, { paymentID: taken.paymentId, status: 'success' });
      expect(await sessionOf(unreadRef)).toMatchObject({
        state: 'awaiting_payment',
        gateway_payment_id: taken.paymentId,
        gateway_result: null,
        fee_held: '3.00',
      });
      expect(await feesOf(unread.shop.tenantId)).toEqual([]);

      // The gateway says it doesn't know, never that it wasn't paid, which the later steps would act on.
      const asked = await placed(unread);
      const direct = await started(asked);
      bkash.authorise(direct.paymentId);
      const answer = await app.get(BkashGateway).execute(
        {
          tenantId: unread.shop.tenantId,
          accountId: unread.accountId,
          sandbox: false,
          credentials: {
            appKey: unread.appKey,
            appSecret: RIGHT_SECRET,
            username: 'sandbox-user',
            password: 'sandbox-pass-word',
          },
          sessionId: null,
        },
        direct.paymentId,
      );
      expect(answer).toEqual({ status: 'unknown' });
    });

    it('finishes on the account that started it, whatever is selected since (WAL-11, WAL-19)', async () => {
      const setup = await automate(await paidShop());
      const ref = await placed(setup);
      const { paymentId } = await started(ref);
      bkash.authorise(paymentId);
      const twoAccounts = await setup.shop.put('/payment-methods/bkash', {
        enabled: true,
        accounts: [
          {
            id: setup.accountId,
            accountName: 'Rahim Store',
            number: '01711000001',
            accountType: 'personal',
            active: true,
          },
          { accountName: 'Second', number: '01711000009', accountType: 'merchant', active: false },
        ],
      });
      expect(twoAccounts.status, JSON.stringify(twoAccounts.body)).toBe(200);
      const second =
        (await bkashOf(setup.shop)).accounts.find((row) => row.number === '01711000009')?.id ?? '';
      const secondKey = `key-${randomUUID()}`;
      await saveCredentials(setup.shop, second, credentials(secondKey));
      await setup.shop.post(`/payment-methods/accounts/${second}/automated`, {});

      await returned(ref, { paymentID: paymentId, status: 'success' });
      expect(bkash.executesOf(setup.appKey)).toHaveLength(1);
      expect(bkash.callsOf(secondKey)).toHaveLength(0);
      expect((await sessionOf(ref)).state).toBe('verified');

      // The account a shopper is shown stays the active one, and automated runs on the other (WAL-19).
      const next = await placed(setup);
      expect((await pageBody(next)).methods.find((row) => row.method === 'bkash')?.number).toBe(
        '01711000001',
      );
      await started(next);
      expect(bkash.createsOf(secondKey)).toHaveLength(1);
      expect((await sessionOf(next)).gateway_account_id).toBe(second);
    });

    it(
      "sends what doesn't add up to staff, charging nothing (VER-02, BAL-12)",
      async () => {
        // Less arrived than was asked.
        const short = await automate(await paidShop());
        bkash.behave(short.appKey, { paidAmount: '200.00' });
        const shortRef = await placed(short);
        const first = await started(shortRef);
        bkash.authorise(first.paymentId);
        await returned(shortRef, { paymentID: first.paymentId, status: 'success' });
        const shortSession = await sessionOf(shortRef);
        expect(shortSession).toMatchObject({ state: 'needs_review', fee_held: '0.00' });
        expect(await pageBody(shortRef)).toMatchObject({ review: { reason: 'amount' } });
        expect(await feesOf(short.shop.tenantId)).toEqual([]);
        expect(await paymentsOfOrder(shortSession.order_id)).toEqual([]);
        expect(await balanceOf(short.shop)).toMatchObject({ amount: '100.00', held: '0.00' });

        // A transaction ID already used.
        const used = await automate(await paidShop());
        bkash.behave(used.appKey, { trxId: 'REUSEDID77' });
        const one = await placed(used);
        const firstPay = await started(one);
        bkash.authorise(firstPay.paymentId);
        await returned(one, { paymentID: firstPay.paymentId, status: 'success' });
        expect((await sessionOf(one)).state).toBe('verified');
        const two = await placed(used);
        const secondPay = await started(two);
        bkash.authorise(secondPay.paymentId);
        await returned(two, { paymentID: secondPay.paymentId, status: 'success' });
        expect((await sessionOf(two)).state).toBe('needs_review');
        expect(await feesOf(used.shop.tenantId)).toHaveLength(1);

        // Money that did move for an order cancelled meanwhile: staff decide what to do with it, and it pays no fee.
        const closed = await automate(await paidShop());
        const closedRef = await placed(closed);
        const closedPay = await started(closedRef);
        const closedSession = await sessionOf(closedRef);
        await cancelOrder(closed.shop, closedSession.order_id);
        bkash.complete(closedPay.paymentId);
        await returned(closedRef, { paymentID: closedPay.paymentId, status: 'success' });
        expect(bkash.executesOf(closed.appKey)).toHaveLength(0);
        expect(await sessionOf(closedRef)).toMatchObject({
          state: 'needs_review',
          fee_held: '0.00',
        });
        expect(await pageBody(closedRef)).toMatchObject({ review: { reason: 'other' } });
        expect(await feesOf(closed.shop.tenantId)).toEqual([]);
        expect(await paymentsOfOrder(closedSession.order_id)).toEqual([]);
      },
      SLOW,
    );
  },
);

describeIfDatabase('who goes to the wallet at all (PAY-06, WAL-10, WAL-19)', () => {
  it('sends nobody from a wallet the shop takes another way, or with no account selected', async () => {
    const setup = await automate(await paidShop());
    await setup.shop.put('/payment-methods/bkash/way', { way: 'listener' });
    const listening = await placed(setup);
    expect(await started(listening)).toEqual({ redirectUrl: null, paymentId: '' });
    expect((await pageBody(listening)).methods[0]).toMatchObject({ way: 'listener' });

    await setup.shop.put('/payment-methods/bkash/way', { way: 'manual' });
    expect(await started(await placed(setup))).toEqual({ redirectUrl: null, paymentId: '' });

    // Still set to automated, but its credentials removed since.
    await setup.shop.put('/payment-methods/bkash/way', { way: 'automated' });
    await setup.shop.delete(`/payment-methods/accounts/${setup.accountId}/gateway`);
    expect(await started(await placed(setup))).toEqual({ redirectUrl: null, paymentId: '' });
    expect(bkash.callsOf(setup.appKey)).toHaveLength(0);
    expect(await balanceOf(setup.shop)).toMatchObject({ held: '0.00' });
  });

  it('refuses a method the shop does not offer, and a closed page', async () => {
    const setup = await automate(await paidShop());
    const ref = await placed(setup);
    const notOffered = await checkout(ref, 'nagad');
    expect(notOffered.status).toBe(409);
    expect(errorOf(notOffered).message).toBe(said('PaymentMethodNotOffered'));
    expect((await checkout(ref, 'magic')).status).toBe(400);

    await pastWindow(ref);
    const closed = await checkout(ref);
    expect(closed.status).toBe(409);
    expect(errorOf(closed).message).toBe(said('PaymentSessionClosed'));

    // An unknown reference is not found, on both routes.
    const unknown = randomBytes(16).toString('base64url');
    expect((await checkout(unknown)).status).toBe(404);
    expect((await returned(unknown, { paymentID: 'TRx', status: 'success' })).status).toBe(404);
    expect(bkash.callsOf(setup.appKey)).toHaveLength(0);
  });
});

describeIfDatabase('an order that can no longer take the money (VER-09)', () => {
  it('sends nobody to bKash for an order cancelled, or one owing less than the page asks', async () => {
    const setup = await automate(await paidShop());
    const cancelled = await placed(setup);
    await cancelOrder(setup.shop, (await sessionOf(cancelled)).order_id);
    expect(await started(cancelled)).toEqual({ redirectUrl: null, paymentId: '' });

    const shrunk = await placed(setup);
    await owes((await sessionOf(shrunk)).order_id, '299.99');
    expect(await started(shrunk)).toEqual({ redirectUrl: null, paymentId: '' });
    expect(bkash.createsOf(setup.appKey)).toHaveLength(0);

    // Owing exactly what it asks is what a page is for.
    const exact = await placed(setup);
    await owes((await sessionOf(exact)).order_id, '300.00');
    expect((await started(exact)).redirectUrl).toMatch(/^https:/);

    // Paid by hand, the page itself has closed (PAY-07), so there is nothing to start.
    const paid = await placed(setup);
    await payByCash(setup.shop, (await sessionOf(paid)).order_id, 300);
    const closed = await checkout(paid);
    expect(closed.status).toBe(409);
    expect(errorOf(closed).message).toBe(said('PaymentSessionClosed'));
  });

  it('never executes for an order cancelled while the shopper was at bKash', async () => {
    const setup = await automate(await paidShop());
    const ref = await placed(setup);
    const { paymentId } = await started(ref);
    const session = await sessionOf(ref);
    await cancelOrder(setup.shop, session.order_id);
    bkash.authorise(paymentId);
    await returned(ref, { paymentID: paymentId, status: 'success' });
    expect(bkash.executesOf(setup.appKey)).toHaveLength(0);
    expect(await sessionOf(ref)).toMatchObject({
      state: 'awaiting_payment',
      gateway_result: 'failed',
      fee_held: '0.00',
    });
    expect(await paymentsOfOrder(session.order_id)).toEqual([]);
    expect(await feesOf(setup.shop.tenantId)).toEqual([]);
    expect(await balanceOf(setup.shop)).toMatchObject({ amount: '100.00', held: '0.00' });
  });

  it('never executes for an order paid some other way meanwhile', async () => {
    const setup = await automate(await paidShop());
    const ref = await placed(setup);
    const { paymentId } = await started(ref);
    expect(await balanceOf(setup.shop)).toMatchObject({ held: '3.00' });
    await payByCash(setup.shop, (await sessionOf(ref)).order_id, 300);
    bkash.authorise(paymentId);
    await returned(ref, { paymentID: paymentId, status: 'success' });
    expect(bkash.executesOf(setup.appKey)).toHaveLength(0);
    // The page closed with it, which ends the hold.
    expect((await sessionOf(ref)).state).not.toBe('awaiting_payment');
    expect(await balanceOf(setup.shop)).toMatchObject({ amount: '100.00', held: '0.00' });

    // Owing less than the page asks, the same.
    const shrunk = await placed(setup);
    const second = await started(shrunk);
    await owes((await sessionOf(shrunk)).order_id, '299.99');
    bkash.authorise(second.paymentId);
    await returned(shrunk, { paymentID: second.paymentId, status: 'success' });
    expect(bkash.executesOf(setup.appKey)).toHaveLength(0);
    expect(await sessionOf(shrunk)).toMatchObject({ gateway_result: 'failed', fee_held: '0.00' });
  });

  it('nor does the minute pass, though the shopper authorised it', async () => {
    const setup = await automate(await paidShop());
    const ref = await placed(setup);
    const { paymentId } = await started(ref);
    await cancelOrder(setup.shop, (await sessionOf(ref)).order_id);
    bkash.authorise(paymentId);
    await pastWindow(ref);
    await reconcile();
    expect(bkash.executesOf(setup.appKey)).toHaveLength(0);
    expect(await sessionOf(ref)).toMatchObject({ gateway_result: 'failed', fee_held: '0.00' });
  });
});

describeIfDatabase('the fee held for a checkout (WAL-20, WAL-21, RAT-15)', () => {
  it("sends the shopper to the page when the balance can't hold the fee, and tells the shop once a day", async () => {
    const setup = await automate(await paidShop('2.99'));
    const ref = await placed(setup);
    const first = await started(ref);
    expect(first).toEqual({ redirectUrl: null, paymentId: '' });
    expect(bkash.callsOf(setup.appKey)).toHaveLength(0);
    expect(await sessionOf(ref)).toMatchObject({ state: 'awaiting_payment', fee_held: '0.00' });
    const told = (): number =>
      lowBalance.feeShort.filter((row) => row.tenantId === setup.shop.tenantId).length;
    expect(told()).toBe(1);
    await started(ref);
    expect(told()).toBe(1);

    // The shopper pays on the page instead.
    const typed = await typeId(ref, randomBytes(5).toString('hex').toUpperCase());
    expect(typed.status, JSON.stringify(typed.body)).toBe(201);
  });

  it("holds exactly the fee, and what is held can't be spent by anything else", async () => {
    const setup = await automate(await paidShop('3.00'));
    const one = await placed(setup);
    expect((await started(one)).redirectUrl).toMatch(/^https:/);
    expect(await balanceOf(setup.shop)).toMatchObject({ amount: '3.00', held: '3.00' });

    // A second checkout finds nothing left to hold.
    const two = await placed(setup);
    expect((await started(two)).redirectUrl).toBeNull();

    // Nor can anything else spend it.
    const balance = app.get(BalanceService);
    await expect(
      balance.chargeStandalone({
        tenantId: setup.shop.tenantId,
        amount: '1.00',
        type: LedgerEntryType.Sms,
      }),
    ).rejects.toThrow('Insufficient balance');

    // Let go, it can.
    await returned(one, {
      paymentID: (await sessionOf(one)).gateway_payment_id ?? '',
      status: 'cancel',
    });
    await balance.chargeStandalone({
      tenantId: setup.shop.tenantId,
      amount: '1.00',
      type: LedgerEntryType.Sms,
    });
    expect(await balanceOf(setup.shop)).toMatchObject({ amount: '2.00', held: '0.00' });
  });

  it('charges the rate it held at, though the rate has risen since (RAT-15)', async () => {
    const setup = await automate(await paidShop());
    const ref = await placed(setup);
    const { paymentId } = await started(ref);
    const rates = app.get(RateService);
    await rates.change(RateKey.GatewayVerificationPct, '2.00', randomUUID(), null);
    try {
      bkash.authorise(paymentId);
      await returned(ref, { paymentID: paymentId, status: 'success' });
      expect(await feesOf(setup.shop.tenantId)).toEqual([
        expect.objectContaining({ amount: '-3.00' }),
      ]);
      const next = await placed(setup);
      await started(next);
      expect(await sessionOf(next)).toMatchObject({ fee_held: '6.00' });
    } finally {
      await rates.change(RateKey.GatewayVerificationPct, '1.00', randomUUID(), null);
    }
  });

  it('never fails a paid payment for a balance frozen or run down meanwhile', async () => {
    const setup = await automate(await paidShop());
    const ref = await placed(setup);
    const { paymentId } = await started(ref);
    await admin.query('UPDATE control.tenants SET balance_frozen = true WHERE id = $1', [
      setup.shop.tenantId,
    ]);
    bkash.authorise(paymentId);
    await returned(ref, { paymentID: paymentId, status: 'success' });
    expect((await sessionOf(ref)).state).toBe('verified');
    expect(await feesOf(setup.shop.tenantId)).toEqual([]);

    // Frozen, nothing can be held: the shopper pays on the page.
    const frozen = await placed(setup);
    expect((await started(frozen)).redirectUrl).toBeNull();

    const low = await automate(await paidShop());
    const lowRef = await placed(low);
    const lowPay = await started(lowRef);
    await admin.query(
      "INSERT INTO tenant.balance_ledger (tenant_id, type, amount, reference) VALUES ($1, 'adjustment', '-99.00', '{}')",
      [low.shop.tenantId],
    );
    bkash.authorise(lowPay.paymentId);
    await returned(lowRef, { paymentID: lowPay.paymentId, status: 'success' });
    expect((await sessionOf(lowRef)).state).toBe('verified');
    expect(await feesOf(low.shop.tenantId)).toEqual([]);
  });

  it('charges a trial shop nothing and holds nothing (agreed 2026-11-03)', async () => {
    const setup = await automate(await freshShop());
    const ref = await placed(setup);
    const { paymentId, redirectUrl } = await started(ref);
    expect(redirectUrl).toMatch(/^https:/);
    expect((await sessionOf(ref)).fee_held).toBe('0.00');
    bkash.authorise(paymentId);
    await returned(ref, { paymentID: paymentId, status: 'success' });
    const session = await sessionOf(ref);
    expect(session.state).toBe('verified');
    expect(await paymentsOfOrder(session.order_id)).toEqual([
      expect.objectContaining({ verification_level: 'gateway' }),
    ]);
    expect(await feesOf(setup.shop.tenantId)).toEqual([]);
  });

  it('holds nothing when the fee rounds to nothing (BAL-16)', async () => {
    const setup = await automate(await paidShop('1.00', 0.4));
    const ref = await placed(setup);
    const { paymentId, redirectUrl } = await started(ref);
    expect(redirectUrl).toMatch(/^https:/);
    expect((await sessionOf(ref)).fee_held).toBe('0.00');
    bkash.authorise(paymentId);
    await returned(ref, { paymentID: paymentId, status: 'success' });
    expect((await sessionOf(ref)).state).toBe('verified');
    expect(await feesOf(setup.shop.tenantId)).toEqual([]);

    // With nothing to hold, a frozen balance stops nobody.
    const frozen = await automate(await paidShop('1.00', 0.4));
    await admin.query('UPDATE control.tenants SET balance_frozen = true WHERE id = $1', [
      frozen.shop.tenantId,
    ]);
    expect((await started(await placed(frozen))).redirectUrl).toMatch(/^https:/);
  });
});

describeIfDatabase('a test account (VER-11)', () => {
  it(
    'uses the test environment, is flagged, charges nothing, and stays out of the totals',
    async () => {
      const setup = await automate(await paidShop(), { sandbox: true });
      const ref = await placed(setup);
      const { paymentId } = await started(ref);
      const [create] = bkash.createsOf(setup.appKey);
      expect(create?.url.startsWith(SANDBOX_HOST)).toBe(true);
      expect(await sessionOf(ref)).toMatchObject({ test: true, fee_held: '0.00' });
      expect(await pageBody(ref)).toMatchObject({ test: true });

      bkash.authorise(paymentId);
      await returned(ref, { paymentID: paymentId, status: 'success' });
      const session = await sessionOf(ref);
      expect(session.state).toBe('verified');
      expect(await paymentsOfOrder(session.order_id)).toEqual([
        expect.objectContaining({ test: true, verification_level: 'gateway' }),
      ]);
      expect(await feesOf(setup.shop.tenantId)).toEqual([]);

      const today = dhakaDate(new Date());
      const salesOf = async (): Promise<{ orders: number }> => {
        const read = await setup.shop.get(`/sales?dateFrom=${today}&dateTo=${today}`);
        expect(read.status, JSON.stringify(read.body)).toBe(200);
        return (read.body as { totals: { orders: number } }).totals;
      };
      await deliveredNow(session.order_id);
      expect((await salesOf()).orders).toBe(0);

      // The same shop's real payment is listed and counted beside it.
      const real = await automate(setup);
      const realRef = await placed(real);
      const realPay = await started(realRef);
      expect(bkash.createsOf(real.appKey)[0]?.url.startsWith(SANDBOX_HOST)).toBe(false);
      bkash.authorise(realPay.paymentId);
      await returned(realRef, { paymentID: realPay.paymentId, status: 'success' });
      const realSession = await sessionOf(realRef);
      await deliveredNow(realSession.order_id);
      expect((await salesOf()).orders).toBe(1);
      expect(await feesOf(setup.shop.tenantId)).toHaveLength(1);

      const list = await setup.shop.get('/payments');
      expect(list.status, JSON.stringify(list.body)).toBe(200);
      const body = list.body as {
        payments: { order: { id: string }; test: boolean }[];
        amount: string;
      };
      expect(body.payments.find((row) => row.order.id === session.order_id)?.test).toBe(true);
      expect(body.payments.find((row) => row.order.id === realSession.order_id)?.test).toBe(false);
      expect(body.amount).toBe('300.00');
    },
    SLOW,
  );

  it(
    'stays out of the new-shop payment cap (TVR-04)',
    async () => {
      const settings = app.get(PlatformSettingsService);
      await settings.set(PlatformSettingKey.NewShopPaymentCapAmount, 500, randomUUID());
      try {
        const setup = await freshShop();
        await admin.query(
          `UPDATE control.tenants SET state = 'pay_as_you_go',
           plan_id = (SELECT id FROM control.plans WHERE name = 'Pay-as-you-go'),
           plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Pay-as-you-go')
         WHERE id = $1`,
          [setup.shop.tenantId],
        );
        await seedBalance(admin, setup.shop.tenantId, '1000.00');
        const sandbox = await automate(setup, { sandbox: true });
        const ref = await placed(sandbox);
        const { paymentId } = await started(ref);
        bkash.authorise(paymentId);
        await returned(ref, { paymentID: paymentId, status: 'success' });
        expect((await sessionOf(ref)).state).toBe('verified');
        // Counted, 300 + 300 would be past the cap of 500.
        await placed(sandbox);
      } finally {
        await settings.set(PlatformSettingKey.NewShopPaymentCapAmount, 10000, randomUUID());
      }
    },
    SLOW,
  );
});

describeIfDatabase('a checkout with no return (VER-09)', () => {
  it('settles one completed at bKash, and executes one the shopper authorised', async () => {
    const setup = await automate(await paidShop());
    const completed = await placed(setup);
    const paid = await started(completed);
    bkash.complete(paid.paymentId);
    const authorised = await placed(setup);
    const pending = await started(authorised);
    bkash.authorise(pending.paymentId);
    await pastWindow(completed);
    await pastWindow(authorised);

    // The sessions' own pass leaves them for the gateway's to ask after.
    await app.get(PaymentSessionExpiry).runTick(new Date());
    expect((await sessionOf(completed)).state).toBe('awaiting_payment');

    expect((await reconcile()).settled).toBeGreaterThanOrEqual(2);
    expect((await sessionOf(completed)).state).toBe('verified');
    expect((await sessionOf(authorised)).state).toBe('verified');
    expect(bkash.executesOf(setup.appKey)).toHaveLength(1);
    expect(await feesOf(setup.shop.tenantId)).toHaveLength(2);
    expect(await balanceOf(setup.shop)).toMatchObject({ amount: '94.00', held: '0.00' });

    // A return after that changes nothing.
    await returned(completed, { paymentID: paid.paymentId, status: 'success' });
    expect(await feesOf(setup.shop.tenantId)).toHaveLength(2);
  });

  it('lets go of one never paid, which then closes, its hold ended', async () => {
    const setup = await automate(await paidShop());
    const ref = await placed(setup);
    await started(ref);
    // Inside its window it is left alone: the shopper may still be at bKash.
    await reconcile();
    expect(bkash.queriesOf(setup.appKey)).toHaveLength(0);
    expect(await sessionOf(ref)).toMatchObject({ gateway_result: null, fee_held: '3.00' });
    await pastWindow(ref);
    await reconcile();
    expect(await sessionOf(ref)).toMatchObject({
      state: 'awaiting_payment',
      gateway_result: 'failed',
      gateway_payment_id: null,
      fee_held: '0.00',
    });
    await app.get(PaymentSessionExpiry).runTick(new Date());
    expect((await sessionOf(ref)).state).toBe('expired');
    expect(await balanceOf(setup.shop)).toMatchObject({ amount: '100.00', held: '0.00' });
  });

  it("carries on past one shop's failure", async () => {
    const failing = await automate(await paidShop());
    const failingRef = await placed(failing);
    await started(failingRef);
    await pastWindow(failingRef);
    const fine = await automate(await paidShop());
    const fineRef = await placed(fine);
    bkash.complete((await started(fineRef)).paymentId);
    await pastWindow(fineRef);

    const checkouts = app.get(GatewayCheckouts);
    const original = checkouts.reconcile.bind(checkouts);
    const spy = vi.spyOn(checkouts, 'reconcile').mockImplementation((tenantId, now) => {
      if (tenantId === failing.shop.tenantId) return Promise.reject(new Error('this shop failed'));
      return original(tenantId, now);
    });
    try {
      await reconcile();
    } finally {
      spy.mockRestore();
    }
    expect((await sessionOf(fineRef)).state).toBe('verified');
    expect((await sessionOf(failingRef)).gateway_payment_id).not.toBeNull();
  });

  it('does not act on a return past the window', async () => {
    const setup = await automate(await paidShop());
    const ref = await placed(setup);
    const { paymentId } = await started(ref);
    bkash.authorise(paymentId);
    await pastWindow(ref);
    await returned(ref, { paymentID: paymentId, status: 'success' });
    expect(bkash.executesOf(setup.appKey)).toHaveLength(0);
    expect((await sessionOf(ref)).state).toBe('awaiting_payment');
  });

  it("keeps asking while bKash can't be reached, then lets it go an hour past the window", async () => {
    const setup = await automate(await paidShop());
    const ref = await placed(setup);
    const { paymentId } = await started(ref);
    bkash.authorise(paymentId);
    await pastWindow(ref);
    bkash.behave(setup.appKey, { unreachable: true });
    await reconcile();
    expect(await sessionOf(ref)).toMatchObject({
      state: 'awaiting_payment',
      gateway_payment_id: paymentId,
      fee_held: '3.00',
    });
    clockShift = HOUR + 2 * MINUTE;
    await reconcile();
    expect(await sessionOf(ref)).toMatchObject({
      gateway_result: 'failed',
      gateway_payment_id: null,
      fee_held: '0.00',
    });
    expect(attention.filter((row) => row.tenantId === setup.shop.tenantId)).toHaveLength(1);
  });

  it('gives up on one that never answers, an hour past the window, and tells the owner', async () => {
    const setup = await automate(await paidShop());
    const ref = await placed(setup);
    const { paymentId } = await started(ref);
    await pastWindow(ref);
    bkash.behave(setup.appKey, { queryTimesOut: true });
    await reconcile();
    expect(await sessionOf(ref)).toMatchObject({
      gateway_payment_id: paymentId,
      gateway_result: null,
      fee_held: '3.00',
    });
    expect(attention.filter((row) => row.tenantId === setup.shop.tenantId)).toEqual([]);
    clockShift = HOUR + 2 * MINUTE;
    await reconcile();
    expect(await sessionOf(ref)).toMatchObject({
      gateway_payment_id: null,
      gateway_result: 'failed',
      fee_held: '0.00',
    });
    expect(attention.filter((row) => row.tenantId === setup.shop.tenantId)).toEqual([
      { tenantId: setup.shop.tenantId, method: 'bkash' },
    ]);
  });
});

describeIfDatabase('a gateway that fails (VER-10)', () => {
  const told = (shop: ShopClient): GatewayAttentionNotice[] =>
    attention.filter((row) => row.tenantId === shop.tenantId);

  it('sends the shopper to the page and tells the owner when the token is refused', async () => {
    const setup = await automate(await paidShop(), { appSecret: 'the-wrong-secret' });
    const ref = await placed(setup);
    const sent = await started(ref);
    expect(sent).toEqual({ redirectUrl: null, paymentId: '' });
    expect(await sessionOf(ref)).toMatchObject({
      state: 'awaiting_payment',
      gateway_result: 'failed',
      fee_held: '0.00',
    });
    expect(told(setup.shop)).toEqual([{ tenantId: setup.shop.tenantId, method: 'bkash' }]);
    expect(await pageBody(ref)).toMatchObject({ gatewayResult: 'failed' });
    expect(JSON.stringify(await pageBody(ref))).not.toContain(BKASH_SECRET_WORDS);
    const typed = await typeId(ref, randomBytes(5).toString('hex').toUpperCase());
    expect(typed.status, JSON.stringify(typed.body)).toBe(201);
  });

  it("does the same when the payment can't be created, or bKash can't be reached", async () => {
    const refused = await automate(await paidShop());
    bkash.behave(refused.appKey, { refuseCreate: true });
    const ref = await placed(refused);
    expect((await started(ref)).redirectUrl).toBeNull();
    expect(await sessionOf(ref)).toMatchObject({ gateway_result: 'failed', fee_held: '0.00' });
    expect(told(refused.shop)).toHaveLength(1);

    const gone = await automate(await paidShop());
    bkash.behave(gone.appKey, { unreachable: true });
    const goneRef = await placed(gone);
    expect((await started(goneRef)).redirectUrl).toBeNull();
    expect(await balanceOf(gone.shop)).toMatchObject({ held: '0.00' });
    expect(told(gone.shop)).toHaveLength(1);
  });
});

describeIfDatabase('a wallet the owner checks by hand (agreed 2026-11-03)', () => {
  it(
    'holds a receipt beside the payment for staff, free, even with a phone paired',
    async () => {
      const setup = await paidShop();
      const made = await postJson(port, '/listener/pairing-codes', {}, setup.shop.headers());
      const installationId = `install-${randomUUID()}`;
      const paired = await sendExact(
        port,
        'POST',
        '/v1/listener/pair',
        { code: (made.body as { code: string }).code, installationId, model: 'Redmi 12' },
        {
          host: 'api.localhost',
          'content-type': 'application/json',
          'x-test-visitor': `198.51.100.${String(Math.floor(Math.random() * 250))}`,
          'x-app-version': VERSION,
        },
      );
      expect(paired.status, JSON.stringify(paired.body)).toBe(201);
      const token = (paired.body as { token: string }).token;
      const headers = {
        host: 'api.localhost',
        authorization: `Bearer ${token}`,
        'x-installation-id': installationId,
        'x-app-version': VERSION,
      };
      await sendExact(port, 'POST', '/v1/listener/heartbeat', undefined, headers);

      expect((await setup.shop.put('/payment-methods/bkash/way', { way: 'manual' })).status).toBe(
        200,
      );
      const ref = await placed(setup);
      const id = randomBytes(5).toString('hex').toUpperCase();
      const typed = await typeId(ref, id);
      expect(typed.status, JSON.stringify(typed.body)).toBe(201);
      // No phone is listening for this wallet, so staff hear at once (VER-07).
      expect(typed.body).toMatchObject({ state: 'checking', listenerOnline: false });
      const session = await sessionOf(ref);
      expect(toVerify.filter((row) => row.tenantId === setup.shop.tenantId)).toHaveLength(1);

      const sent = await sendExact(
        port,
        'POST',
        '/v1/listener/messages',
        {
          messages: [
            {
              sender: 'bKash',
              text: `You have received Tk 300.00 from ${SENDER_NUMBER}. Fee Tk 0.00. Balance Tk 1,500.00. TrxID ${id} at 02/11/2026 13:58`,
              receivedAt: new Date().toISOString(),
            },
          ],
        },
        { ...headers, 'content-type': 'application/json' },
      );
      expect(sent.status, JSON.stringify(sent.body)).toBe(200);
      expect((sent.body as { results: unknown[] }).results[0]).toMatchObject({
        status: 'needs_review',
        reviewReason: 'by_hand',
      });
      expect((await sessionOf(ref)).state).toBe('checking');
      expect(await feesOf(setup.shop.tenantId)).toEqual([]);

      const verified = await setup.shop.post(`/payments/${session.id}/verify`, {});
      expect(verified.status, JSON.stringify(verified.body)).toBe(200);
      expect(await paymentsOfOrder(session.order_id)).toEqual([
        expect.objectContaining({ verification_level: 'manual' }),
      ]);
      expect(await feesOf(setup.shop.tenantId)).toEqual([]);
    },
    SLOW,
  );
});

describeIfDatabase("the log of a credential's uses (SEC-11)", () => {
  it('records every call with what it served, without the credential, for the operator alone', async () => {
    const setup = await automate(await paidShop());
    const ref = await placed(setup);
    const { paymentId } = await started(ref);
    bkash.authorise(paymentId);
    await returned(ref, { paymentID: paymentId, status: 'success' });
    const session = await sessionOf(ref);

    const page = await app.get(CredentialUses).list(setup.shop.tenantId, 1, 50);
    expect(page.total).toBe(3);
    expect(page.uses.map((row) => row.action).sort()).toEqual(['create', 'execute', 'token']);
    expect(page.uses.every((row) => row.method === PaymentMethod.Bkash && row.succeeded)).toBe(
      true,
    );
    expect(page.uses.every((row) => row.accountId === setup.accountId)).toBe(true);
    expect(page.uses.filter((row) => row.sessionId === session.id)).toHaveLength(3);
    const text = JSON.stringify(page);
    expect(text).not.toContain(setup.appKey);
    expect(text).not.toContain(RIGHT_SECRET);

    const { rows } = await admin.query<Record<string, unknown>>(
      'SELECT * FROM tenant.gateway_credential_uses WHERE tenant_id = $1',
      [setup.shop.tenantId],
    );
    expect(JSON.stringify(rows)).not.toContain(RIGHT_SECRET);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
      'account_id',
      'action',
      'at',
      'id',
      'method',
      'session_id',
      'succeeded',
      'tenant_id',
    ]);

    // Another shop's log holds none of it.
    const other = await paidShop();
    expect((await app.get(CredentialUses).list(other.shop.tenantId, 1, 50)).total).toBe(0);

    const route = `/operator/tenants/${setup.shop.tenantId}/gateway-credential-uses`;
    expect((await getJson(port, route, {})).status).toBe(401);
    expect((await getJson(port, route, setup.shop.headers())).status).toBe(401);
  });

  it("goes with the shop at day 60, with the shop's chosen ways (LIF-19)", async () => {
    const setup = await automate(await paidShop());
    await started(await placed(setup));
    const count = async (table: string): Promise<number> => {
      const { rows } = await admin.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM tenant.${table} WHERE tenant_id = $1`,
        [setup.shop.tenantId],
      );
      return rows[0]?.total ?? 0;
    };
    expect(await count('gateway_credential_uses')).toBeGreaterThan(0);
    expect(await count('payment_method_ways')).toBe(1);
    await app.get(PaymentMethodsEraser).deleteAllForTenant(setup.shop.tenantId);
    expect(await count('gateway_credential_uses')).toBe(0);
    expect(await count('payment_method_ways')).toBe(0);
  });

  it('marks a refused call as failed', async () => {
    const setup = await automate(await paidShop(), { appSecret: 'the-wrong-secret' });
    await started(await placed(setup));
    const page = await app.get(CredentialUses).list(setup.shop.tenantId, 1, 50);
    expect(page.uses.map((row) => [row.action, row.succeeded])).toEqual([['token', false]]);
  });
});

describeIfDatabase("through the page itself (Slice 5.8's part 2, PAY-06, VER-09)", () => {
  const paymentIdIn = (text: string): string => {
    const found = /paymentId=([\w-]+)/.exec(text)?.[1];
    if (!found) throw new Error('no wallet checkout on the page');
    return found;
  };

  it('hands on to the wallet, then comes back paid and returns to the shop', async () => {
    const setup = await automate(await paidShop());
    const ref = await placed(setup);

    // A session on automated goes straight on: the page posts for it, since starting one isn't a read.
    const handing = await payPage(port, 'GET', `/${ref}`);
    expect(screenOf(handing)).toBe('handing');
    expect(handing.text).toContain(`action="/${ref}/checkout"`);
    expect(handing.text).toContain('data-auto="1"');

    // A form may not redirect to another site under the page's policy: this page refreshes there instead.
    const went = await payPage(port, 'POST', `/${ref}/checkout`, { method: 'bkash' });
    expect(went.status).toBe(200);
    expect(went.text).toMatch(
      /http-equiv="refresh" content="0;url=https:\/\/payment\.bkash\.test\//,
    );
    expect(String(went.headers['content-security-policy'])).toContain("form-action 'self'");
    const paymentId = paymentIdIn(went.text);

    bkash.authorise(paymentId);
    const back = await returned(ref, { paymentID: paymentId, status: 'success' });
    const path = (back.location ?? '').replace('http://pay.localhost', '');
    const paid = await payPage(port, 'GET', path);
    expect(screenOf(paid)).toBe('verified');
    expect(paid.text).toMatch(/data-return="https:\/\/myshop\.com\/thanks\?[^"]*status=verified/);
    expect(paid.text).toContain('tracking_id=');
  });

  it('a shopper who left the wallet may try it again or pay by hand, on the same session', async () => {
    const setup = await automate(await paidShop());
    const ref = await placed(setup);
    const went = await payPage(port, 'POST', `/${ref}/checkout`, { method: 'bkash' });
    await returned(ref, { paymentID: paymentIdIn(went.text), status: 'cancel' });

    const left = await payPage(port, 'GET', `/${ref}`);
    expect(screenOf(left)).toBe('pick');
    expect(left.text).toContain('bKash-এ পেমেন্ট শেষ হয়নি');
    expect(left.text).toContain(`href="/${ref}?w=bkash"`);
    expect(left.text).toContain(`href="/${ref}?w=bkash&amp;hand=1"`);
    expect(screenOf(await payPage(port, 'GET', `/${ref}?w=bkash`))).toBe('handing');

    // By hand: the number and steps, and an ID typed there is taken like any other.
    const byHand = await payPage(port, 'GET', `/${ref}?w=bkash&hand=1`);
    expect(screenOf(byHand)).toBe('wallet');
    expect(byHand.text).toContain('data-copy="01711000001"');
    const typed = await payPage(port, 'POST', `/${ref}/transaction`, {
      method: 'bkash',
      transactionId: 'BYHAND12345',
    });
    expect(typed.status).toBe(303);
  });

  it('says so when the wallet could not take it', async () => {
    const setup = await automate(await paidShop());
    const ref = await placed(setup);
    const went = await payPage(port, 'POST', `/${ref}/checkout`, { method: 'bkash' });
    await returned(ref, { paymentID: paymentIdIn(went.text), status: 'failure' });
    const left = await payPage(port, 'GET', `/${ref}?lang=en`);
    expect(screenOf(left)).toBe('pick');
    expect(left.text).toContain('bKash could not take the payment');
  });

  it('never blocks the shopper: with the fee short they pay on the page (WAL-21)', async () => {
    const setup = await automate(await paidShop('0.00'));
    const ref = await placed(setup);
    const went = await payPage(port, 'POST', `/${ref}/checkout`, { method: 'bkash' });
    expect(went.status).toBe(303);
    expect(went.headers.location).toBe(`/${ref}?w=bkash&hand=1`);
    expect(screenOf(await payPage(port, 'GET', String(went.headers.location)))).toBe('wallet');
  });

  it('a test payment says it is one on every screen, paid included (VER-11)', async () => {
    const setup = await automate(await paidShop(), { sandbox: true });
    const ref = await placed(setup);
    const STRIP = 'টেস্ট পেমেন্ট: আসল টাকা কাটবে না।';
    const went = await payPage(port, 'POST', `/${ref}/checkout`, { method: 'bkash' });
    expect((await payPage(port, 'GET', `/${ref}`)).text).toContain(STRIP);
    const paymentId = paymentIdIn(went.text);
    bkash.authorise(paymentId);
    await returned(ref, { paymentID: paymentId, status: 'success' });
    const paid = await payPage(port, 'GET', `/${ref}?just=1`);
    expect(screenOf(paid)).toBe('verified');
    expect(paid.text).toContain(STRIP);
    // A real payment says nothing of the kind.
    const real = await automate(await paidShop());
    expect((await payPage(port, 'GET', `/${await placed(real)}`)).text).not.toContain(STRIP);
  });
});
