import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  nodeSend,
  OrderPaymentCheck,
  type CheckSettings,
} from '../scripts/lib/order-payment-check';
import { AppModule } from '../src/app/app.module';
import { GATEWAY_FETCH } from '../src/modules/gateway/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { GatewayReconcileTickWorker } from '../src/modules/shared/queue-workers/services/gateway-reconcile-tick-worker';
import { PaymentSessionExpiryTickWorker } from '../src/modules/shared/queue-workers/services/payment-session-expiry-tick-worker';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { FakeBkash, RIGHT_SECRET } from './support/fake-bkash';
import { PrepaidPath, type PrepaidShop } from './support/prepaid-path';
import { SmsCapture } from './support/sms-capture';

// OBS-08, PHASE-5-PLAN §1 criterion 7: scripts/order-payment-check.ts, run against a server, over HTTP as it would reach
// staging: one shop whose bKash the listener checks, one that takes bKash at its own checkout (a fake bKash here), and one
// key the server refuses. The milestone runs the same script against a staging shop with bKash's sandbox. Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_order_payment_check_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const STOREFRONT_SECRET = 'order-payment-check-e2e-storefront-secret-0123456789';
const WEBSITE = 'https://demo.example.com';

let app: INestApplication;
let port: number;
let admin: pg.Client;
let path: PrepaidPath;
const texts = new SmsCapture();
const bkash = new FakeBkash();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'order-payment-check-e2e-otp-secret-012345';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['STOREFRONT_SECRET'] = STOREFRONT_SECRET;
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(GATEWAY_FETCH)
    .useValue(bkash.fetch)
    .overrideProvider(GatewayReconcileTickWorker)
    .useValue({})
    .overrideProvider(PaymentSessionExpiryTickWorker)
    .useValue({})
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

/** The settings the script reads from its environment, for this shop and its website's key. */
async function settingsFor(setup: PrepaidShop): Promise<CheckSettings> {
  const made = await setup.shop.post('/api-keys', { name: 'Scripted check', websites: [WEBSITE] });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return {
    api: `http://127.0.0.1:${String(port)}`,
    host: 'api.localhost',
    key: (made.body as { key: string }).key,
    origin: WEBSITE,
    variantId: setup.variantId,
    locationId: setup.locationId,
    phone: texts.freshPhone(),
    method: 'bkash',
  };
}

describeIfDatabase('the scripted order-and-payment check (OBS-08)', () => {
  it('places an order, opens its page and reads its tracking, for a shop the listener checks', async () => {
    const setup = await path.shop('checkl');
    const result = await new OrderPaymentCheck(await settingsFor(setup), nodeSend).run();
    expect(result.steps.map((row) => [row.name, row.ok])).toEqual([
      ['place an order needing an advance', true],
      ['open its payment page', true],
      ['read its tracking', true],
    ]);
    expect(result.ok).toBe(true);
    expect(result.steps[1]?.detail).toBe('bkash by listener');
    // It moved no money: the order waits on its advance, as a shopper's would.
    const { rows } = await admin.query<{ payment_status: string }>(
      'SELECT payment_status FROM tenant.orders WHERE tenant_id = $1',
      [setup.shop.tenantId],
    );
    expect(rows).toEqual([{ payment_status: 'pending_verification' }]);
  });

  it("goes on to bKash's checkout address for a shop that takes bKash there", async () => {
    const setup = await path.shop('checkg');
    const saved = await setup.shop.put(`/payment-methods/accounts/${setup.accountId}/gateway`, {
      appKey: `key-${randomUUID()}`,
      appSecret: RIGHT_SECRET,
      username: 'sandbox-user',
      password: 'sandbox-pass-word',
      sandbox: true,
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(
      (await setup.shop.post(`/payment-methods/accounts/${setup.accountId}/automated`, {})).status,
    ).toBe(200);
    expect((await setup.shop.put('/payment-methods/bkash/way', { way: 'automated' })).status).toBe(
      200,
    );
    const result = await new OrderPaymentCheck(await settingsFor(setup), nodeSend).run();
    expect(result.steps.map((row) => [row.name, row.ok])).toEqual([
      ['place an order needing an advance', true],
      ['open its payment page', true],
      ["go on to the wallet's checkout", true],
      ['read its tracking', true],
    ]);
    expect(result.steps[2]?.detail).toBe('payment.bkash.test');
  });

  it('fails at the first step that fails, and says why', async () => {
    const setup = await path.shop('checkf');
    const settings = await settingsFor(setup);
    const result = await new OrderPaymentCheck(
      { ...settings, key: 'lytro_pk_wrong' },
      nodeSend,
    ).run();
    expect(result.ok).toBe(false);
    expect(result.steps).toEqual([
      expect.objectContaining({ name: 'place an order needing an advance', ok: false }),
    ]);
    expect(result.steps[0]?.detail).toMatch(/^answered 401/);
  });
});
