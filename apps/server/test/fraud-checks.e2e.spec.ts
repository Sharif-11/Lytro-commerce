import 'dotenv/config';
import { randomInt, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FraudCheckTrigger,
  FraudSource,
  FraudSourceState,
  LedgerEntryType,
  PlatformSettingKey,
  QueueName,
  RateKey,
} from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { JobRelay } from '../src/modules/shared/queue/services/job-relay';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { RateService } from '../src/modules/balance/services/rate.service';
import { COURIER_FETCH } from '../src/modules/couriers/tokens';
import type { FraudCheckJob } from '../src/modules/fraud-checks/services/fraud-check-queue';
import { FraudChecks } from '../src/modules/fraud-checks/services/fraud-checks';
import { FRAUD_CHECK_CLOCK } from '../src/modules/fraud-checks/tokens';
import { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { TenantCache } from '../src/modules/tenancy/services/tenant-cache';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import {
  FakeSteadfast,
  RIGHT_API_KEY,
  RIGHT_SECRET_KEY,
  freshSteadfastKeys,
} from './support/fake-steadfast';
import { postJson, sendExact, type HttpResult } from './support/http';
import { errorOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 7 Slice 7.5 (read agreed 2026-11-07): checking a phone before sending a parcel (FRD-01 to FRD-08, FRD-11, as
// amended that day). Steadfast's record through the shop's own key -- a fake shaped like the live answer of 2026-11-07 --
// and the shop's own finished orders, figures only; reused for three days; free at launch; on its own for every new
// cash-on-delivery order. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_fraud_checks_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 40_000 });

let app: INestApplication;
let port: number;
let admin: pg.Client;
let clockShift = 0;
const steadfast = new FakeSteadfast();
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'fraud-checks-e2e-otp-secret-0123456789012345';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(COURIER_FETCH)
    .useValue(steadfast.fetch)
    // Slice 7.7: how far the checks' clock runs ahead, for a check that never came.
    .overrideProvider(FRAUD_CHECK_CLOCK)
    .useValue(() => new Date(Date.now() + clockShift))
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

beforeEach(() => {
  steadfast.reset();
  clockShift = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

interface Check {
  id: string;
  phone: string;
  checkedAt: string;
  trigger: FraudCheckTrigger;
  orderId: string | null;
  sources: { source: FraudSource; state: FraudSourceState; cached: boolean }[];
  steadfast: {
    deliveredPercent: number | null;
    cancelledPercent: number | null;
    returnedPercent: number | null;
    volumeBand: string | null;
    volumeRange: string | null;
    reports: number;
    doubtful: boolean;
    categories: string[];
  } | null;
  ownOrders: { delivered: number; returned: number; cancelled: number };
  cost: string;
}

function freshMobile(): string {
  return `017${String(randomInt(10_000_000, 99_999_999))}`;
}

const SCORE = (phone: string): string => `/fraud_check/score/${phone}`;

async function connected(shop: ShopClient): Promise<void> {
  const made = await shop.post('/couriers/connections', {
    courierKey: 'steadfast',
    credentials: freshSteadfastKeys(),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  steadfast.calls.length = 0;
}

async function shop(options: { steadfast: boolean } = { steadfast: true }): Promise<ShopClient> {
  const opened = await openShop(port, texts, 'frd');
  if (options.steadfast) await connected(opened);
  return opened;
}

function check(client: ShopClient, phone: string): Promise<HttpResult> {
  return client.post('/fraud-checks', { phone });
}

async function checked(client: ShopClient, phone: string): Promise<Check> {
  const answer = await check(client, phone);
  expect(answer.status, JSON.stringify(answer.body)).toBe(201);
  return answer.body as Check;
}

let thana: number | null = null;
async function mirpur(client: ShopClient): Promise<number> {
  if (thana !== null) return thana;
  const { zillas } = (await client.get('/locations')).body as {
    zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
  };
  thana =
    zillas.find((row) => row.nameEn === 'Dhaka')?.thanas.find((row) => row.nameEn === 'Mirpur')
      ?.id ?? null;
  if (thana === null) throw new Error('no thana Dhaka/Mirpur');
  return thana;
}

async function variantOf(client: ShopClient): Promise<string> {
  const made = await client.post('/products', {
    name: `Kurti ${randomUUID().slice(0, 6)}`,
    basePrice: 900,
    variants: [{ optionIds: [], openingStock: 50 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '';
}

/** An order made by staff; a delivery collects its whole total on delivery. */
async function order(
  client: ShopClient,
  variantId: string,
  phone: string,
  extra: Record<string, unknown> = {},
): Promise<{ id: string; grandTotal: string }> {
  const delivery = extra['fulfilmentType'] === undefined || extra['fulfilmentType'] === 'delivery';
  const made = await postJson(
    port,
    '/orders',
    {
      customerName: 'Rahima Akter',
      phone,
      ...(delivery
        ? { locationId: await mirpur(client), deliveryAddress: 'House 12, Road 3' }
        : {}),
      items: [{ variantId, quantity: 1 }],
      ...extra,
    },
    client.headers({ 'idempotency-key': randomUUID() }),
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as { id: string; grandTotal: string };
}

/** The fraud-check jobs a shop's new orders queued, oldest first. */
async function queued(client: ShopClient): Promise<FraudCheckJob[]> {
  const { rows } = await admin.query<{ payload: FraudCheckJob }>(
    `SELECT payload FROM control.job_outbox WHERE queue_name = $1 AND payload->>'tenantId' = $2
     ORDER BY id`,
    [QueueName.OrderFraudCheck, client.tenantId],
  );
  return rows.map((row) => row.payload);
}

async function rowsOf(
  client: ShopClient,
): Promise<{ trigger: string; order_id: string | null; steadfast_state: string; cost: string }[]> {
  return (
    await admin.query<{
      trigger: string;
      order_id: string | null;
      steadfast_state: string;
      cost: string;
    }>(
      'SELECT trigger, order_id, steadfast_state, cost FROM tenant.fraud_checks WHERE tenant_id = $1 ORDER BY created_at',
      [client.tenantId],
    )
  ).rows;
}

async function ledgerChecks(client: ShopClient): Promise<string[]> {
  return (
    await admin.query<{ amount: string }>(
      'SELECT amount FROM tenant.balance_ledger WHERE tenant_id = $1 AND type = $2',
      [client.tenantId, LedgerEntryType.FraudCheck],
    )
  ).rows.map((row) => row.amount);
}

/** Checks priced at `value` taka for the rest of a test. */
function priced(value: string): void {
  const rates = app.get(RateService);
  const real = rates.current.bind(rates);
  vi.spyOn(rates, 'current').mockImplementation(async (key) => {
    const rate = await real(key);
    return key === RateKey.FraudCheck && rate ? { ...rate, value } : rate;
  });
}

describeIfDatabase(
  "checking a phone: Steadfast's record and the shop's own orders (FRD-01 to FRD-04)",
  () => {
    it("shows Steadfast's figures through the shop's own key and the shop's own finished orders, free at launch", async () => {
      const client = await shop();
      const phone = freshMobile();
      steadfast.fraudRecords.set(phone, {
        delivery_ratio: 75,
        cancellation_ratio: 25,
        return_ratio: 25,
        volume_band: 'medium',
        volume_range: '8',
        total_reports: 2,
        doubtful_reports: true,
        fraud_categories: ['fake_order', { name: 'refused_parcel' }],
      });
      const variant = await variantOf(client);
      const ids: string[] = [];
      for (let made = 0; made < 6; made += 1) ids.push((await order(client, variant, phone)).id);
      await admin.query("UPDATE tenant.orders SET fulfillment_status = 'delivered' WHERE id = $1", [
        ids[0],
      ]);
      await admin.query(
        "UPDATE tenant.orders SET fulfillment_status = 'partially_delivered' WHERE id = $1",
        [ids[1]],
      );
      await admin.query("UPDATE tenant.orders SET fulfillment_status = 'returned' WHERE id = $1", [
        ids[2],
      ]);
      await admin.query(
        "UPDATE tenant.orders SET status_override = 'cancelled', cancel_reason = 'fake_order', cancelled_at = now() WHERE id = $1",
        [ids[3]],
      );
      await admin.query(
        "UPDATE tenant.orders SET status_override = 'cancelled', cancel_reason = 'out_of_stock', cancelled_at = now() WHERE id = $1",
        [ids[4]],
      );
      // ids[5] is still open, and says nothing yet.
      const before = ((await client.get('/balance')).body as { amount: string }).amount;

      const result = await checked(client, `+880 ${phone.slice(1, 5)}-${phone.slice(5)}`);
      expect(result).toMatchObject({
        phone,
        trigger: FraudCheckTrigger.Staff,
        orderId: null,
        sources: [
          { source: FraudSource.Steadfast, state: FraudSourceState.Answered, cached: false },
          { source: FraudSource.OwnOrders, state: FraudSourceState.Answered, cached: false },
        ],
        steadfast: {
          deliveredPercent: 75,
          cancelledPercent: 25,
          returnedPercent: 25,
          volumeBand: 'medium',
          volumeRange: '8',
          reports: 2,
          doubtful: true,
          categories: ['fake_order', 'refused_parcel'],
        },
        ownOrders: { delivered: 2, returned: 1, cancelled: 1 },
        cost: '0.00',
      });
      const calls = steadfast.callsTo(SCORE(phone));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        apiKey: expect.stringMatching(new RegExp(`^${RIGHT_API_KEY}-`)) as string,
        secretKey: RIGHT_SECRET_KEY,
      });
      expect(((await client.get('/balance')).body as { amount: string }).amount).toBe(before);
      expect(await ledgerChecks(client)).toEqual([]);
      // CRR-26, SEC-11: the call is in the shop's credential log, never the phone.
      const logged = await admin.query<{ action: string; succeeded: boolean }>(
        "SELECT action, succeeded FROM tenant.courier_credential_uses WHERE tenant_id = $1 AND action = 'fraud_check'",
        [client.tenantId],
      );
      expect(logged.rows).toEqual([{ action: 'fraud_check', succeeded: true }]);
      // FRD-01: the latest check reads back, asking no one.
      const latest = await client.get(`/fraud-checks?phone=${phone}`);
      expect(latest.status).toBe(200);
      expect((latest.body as { latest: Check }).latest.id).toBe(result.id);
      expect(steadfast.callsTo(SCORE(phone))).toHaveLength(1);
    });

    it("reuses Steadfast's answer for three days, counting the shop's own orders afresh each time (FRD-04)", async () => {
      const client = await shop();
      const phone = freshMobile();
      const first = await checked(client, phone);
      expect(first.steadfast?.volumeBand).toBe('none');
      expect(first.steadfast?.deliveredPercent).toBeNull();
      const variant = await variantOf(client);
      const made = await order(client, variant, phone);
      await admin.query("UPDATE tenant.orders SET fulfillment_status = 'delivered' WHERE id = $1", [
        made.id,
      ]);

      const second = await checked(client, phone);
      expect(second.sources[0]).toEqual({
        source: FraudSource.Steadfast,
        state: FraudSourceState.Answered,
        cached: true,
      });
      expect(second.ownOrders.delivered).toBe(1);
      expect(steadfast.callsTo(SCORE(phone))).toHaveLength(1);

      // Three days from the answer itself, not from its last reuse.
      await admin.query(
        "UPDATE tenant.fraud_checks SET created_at = created_at - interval '3 days 1 minute' WHERE tenant_id = $1 AND steadfast_from IS NULL",
        [client.tenantId],
      );
      const third = await checked(client, phone);
      expect(third.sources[0]?.cached).toBe(false);
      expect(steadfast.callsTo(SCORE(phone))).toHaveLength(2);
    });

    it('gives a shop without Steadfast its own orders only, and asks no courier (D7-46)', async () => {
      const client = await shop({ steadfast: false });
      const result = await checked(client, freshMobile());
      expect(result.sources).toEqual([
        { source: FraudSource.Steadfast, state: FraudSourceState.NotConnected, cached: false },
        { source: FraudSource.OwnOrders, state: FraudSourceState.Answered, cached: false },
      ]);
      expect(result.steadfast).toBeNull();
      expect(result.ownOrders).toEqual({ delivered: 0, returned: 0, cancelled: 0 });
      expect(steadfast.calls).toEqual([]);
    });

    it('D7-46: a shop that disconnects Steadfast is told so, and an earlier answer is no longer shown or charged', async () => {
      const client = await shop();
      const phone = freshMobile();
      expect((await checked(client, phone)).sources[0]?.state).toBe(FraudSourceState.Answered);
      const gone = await client.delete('/couriers/connections/steadfast');
      expect(gone.status, JSON.stringify(gone.body)).toBe(200);
      const after = await checked(client, phone);
      expect(after.sources[0]?.state).toBe(FraudSourceState.NotConnected);
      expect(after.steadfast).toBeNull();
    });

    it('FRD-03: a shop with no Steadfast and no balance still gets its own orders, free', async () => {
      const client = await shop({ steadfast: false });
      priced('1.00');
      await admin.query("UPDATE control.tenants SET state = 'active' WHERE id = $1", [
        client.tenantId,
      ]);
      app.get(TenantCache).invalidateTenant(client.tenantId);
      const result = await checked(client, freshMobile());
      expect(result.sources[0]?.state).toBe(FraudSourceState.NotConnected);
      expect(result.cost).toBe('0.00');
      expect(await ledgerChecks(client)).toEqual([]);
    });

    it('goes on without a Steadfast that fails, notes it, reuses nothing and charges nothing for it (FRD-11)', async () => {
      const client = await shop();
      const phone = freshMobile();
      priced('1.00');
      await app.get(BalanceService).creditStandalone({
        tenantId: client.tenantId,
        amount: '5.00',
        type: LedgerEntryType.TopUp,
      });
      await admin.query("UPDATE control.tenants SET state = 'active' WHERE id = $1", [
        client.tenantId,
      ]);
      app.get(TenantCache).invalidateTenant(client.tenantId);
      for (const behaviour of [
        { down: true },
        { keysRevoked: true },
        { fraudCheckUnreadable: true },
      ]) {
        steadfast.behaviour = behaviour;
        const result = await checked(client, phone);
        expect(result.sources[0]?.state, JSON.stringify(behaviour)).toBe(FraudSourceState.Failed);
        expect(result.steadfast).toBeNull();
        expect(result.cost).toBe('0.00');
      }
      expect(await ledgerChecks(client)).toEqual([]);
      steadfast.behaviour = {};
      const answered = await checked(client, phone);
      expect(answered.sources[0]).toMatchObject({
        state: FraudSourceState.Answered,
        cached: false,
      });
      expect(answered.cost).toBe('1.00');
      expect(await ledgerChecks(client)).toEqual(['-1.00']);
      // FRD-03: a reused answer is charged too, with no call made.
      const calls = steadfast.callsTo(SCORE(phone)).length;
      const reused = await checked(client, phone);
      expect(reused.sources[0]).toMatchObject({ cached: true });
      expect(reused.cost).toBe('1.00');
      expect(steadfast.callsTo(SCORE(phone))).toHaveLength(calls);
      expect(await ledgerChecks(client)).toEqual(['-1.00', '-1.00']);
    });

    it('refuses a number that is not a Bangladeshi mobile before asking anyone', async () => {
      const client = await shop();
      for (const phone of ['0171', '01211000000', 'call me']) {
        const refused = await check(client, phone);
        expect(refused.status, phone).toBe(400);
        expect(errorOf(refused).code).toBe('validation_error');
      }
      expect(steadfast.calls).toEqual([]);
    });

    it("keeps each shop's checks to itself", async () => {
      const one = await shop();
      const other = await shop();
      const phone = freshMobile();
      await checked(one, phone);
      const seen = await other.get(`/fraud-checks?phone=${phone}`);
      expect(seen.status).toBe(200);
      expect((seen.body as { latest: Check | null }).latest).toBeNull();
      // Another shop's answer is never reused: it asks Steadfast with its own key.
      await checked(other, phone);
      expect(steadfast.callsTo(SCORE(phone))).toHaveLength(2);
    });

    it('replays a check sent twice with one Idempotency-Key, asking Steadfast once (API-11)', async () => {
      const client = await shop();
      const phone = freshMobile();
      const headers = client.headers({ 'idempotency-key': randomUUID() });
      const first = await postJson(port, '/fraud-checks', { phone }, headers);
      const again = await postJson(port, '/fraud-checks', { phone }, headers);
      expect(first.status).toBe(201);
      expect(again.status).toBe(201);
      expect(again.headers['idempotent-replay']).toBe('true');
      expect((again.body as Check).id).toBe((first.body as Check).id);
      expect(steadfast.callsTo(SCORE(phone))).toHaveLength(1);
      expect(await rowsOf(client)).toHaveLength(1);
    });
  },
);

describeIfDatabase('who may check, and when (FRD-07, FRD-08, D7-47, D7-51)', () => {
  it('needs fraud:read to check and read, and fraud:manage to change the automatic check', async () => {
    // A starter shop has one seat besides its owner, so each role gets its own shop.
    const phone = freshMobile();
    const change = { codOrders: false, minAmount: null };
    const orders = await staffWith(port, texts, admin, await shop(), ['orders:manage']);
    expect((await sendExact(port, 'POST', '/api/v1/fraud-checks', { phone }, orders)).status).toBe(
      403,
    );
    const reader = await staffWith(port, texts, admin, await shop(), ['fraud:read']);
    const ran = await sendExact(port, 'POST', '/api/v1/fraud-checks', { phone }, reader);
    expect(ran.status, JSON.stringify(ran.body)).toBe(201);
    expect(
      (await sendExact(port, 'GET', `/api/v1/fraud-checks?phone=${phone}`, undefined, reader))
        .status,
    ).toBe(200);
    expect(
      (await sendExact(port, 'GET', '/api/v1/fraud-checks/rule', undefined, reader)).status,
    ).toBe(200);
    expect((await sendExact(port, 'PUT', '/api/v1/fraud-checks/rule', change, reader)).status).toBe(
      403,
    );
    const manager = await staffWith(port, texts, admin, await shop(), ['fraud:manage']);
    expect(
      (await sendExact(port, 'PUT', '/api/v1/fraud-checks/rule', change, manager)).status,
    ).toBe(200);
    expect((await sendExact(port, 'POST', '/api/v1/fraud-checks', { phone }, manager)).status).toBe(
      403,
    );
  });

  it('lets a trial check while checks are free, refuses it once they are charged, and refuses a lapsed shop always', async () => {
    const client = await shop();
    expect((await check(client, freshMobile())).status).toBe(201);
    priced('1.00');
    await app.get(BalanceService).creditStandalone({
      tenantId: client.tenantId,
      amount: '5.00',
      type: LedgerEntryType.TopUp,
    });
    const trial = await check(client, freshMobile());
    expect(trial.status).toBe(402);
    expect(errorOf(trial).code).toBe('plan_feature_unavailable');
    vi.restoreAllMocks();
    await admin.query(
      "UPDATE control.tenants SET state = 'read_only', balance_frozen = true WHERE id = $1",
      [client.tenantId],
    );
    app.get(TenantCache).invalidateTenant(client.tenantId);
    const lapsed = await check(client, freshMobile());
    expect(lapsed.status).toBe(403);
    expect(errorOf(lapsed).code).toBe('tenant_offline');
    expect(
      steadfast.callsTo().filter((call) => call.path.startsWith('/fraud_check/')),
    ).toHaveLength(1);
  });

  it('refuses a paying shop whose balance is short of the rate, before asking anyone', async () => {
    const client = await shop();
    await admin.query("UPDATE control.tenants SET state = 'active' WHERE id = $1", [
      client.tenantId,
    ]);
    app.get(TenantCache).invalidateTenant(client.tenantId);
    priced('1.00');
    const short = await check(client, freshMobile());
    expect(short.status).toBe(429);
    expect(errorOf(short).code).toBe('quota_exceeded');
    expect(steadfast.calls).toEqual([]);
  });

  it("holds one shop to its checks a minute, staff's and automatic together, and doesn't count a refused one (FRD-07)", async () => {
    const settings = app.get(PlatformSettingsService);
    const real = settings.current.bind(settings);
    vi.spyOn(settings, 'current').mockImplementation(async (key) =>
      key === PlatformSettingKey.FraudChecksPerShopPerMinute
        ? { key, value: 3, description: '', updatedAt: new Date(), updatedBy: null }
        : real(key),
    );
    const client = await shop();
    for (let checks = 0; checks < 3; checks += 1) {
      expect((await check(client, freshMobile())).status).toBe(201);
    }
    const refused = await check(client, freshMobile());
    expect(refused.status).toBe(429);
    expect(errorOf(refused).code).toBe('rate_limited');
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    const variant = await variantOf(client);
    const made = await order(client, variant, freshMobile());
    const [job] = await queued(client);
    expect(job?.orderId).toBe(made.id);
    expect(await app.get(FraudChecks).onNewOrder(job as FraudCheckJob)).toBeNull();
    expect(await rowsOf(client)).toHaveLength(3);
    const other = await shop();
    expect((await check(other, freshMobile())).status).toBe(201);
  });
});

describeIfDatabase(
  'the automatic check of a new cash-on-delivery order (FRD-05, FRD-06, D7-50)',
  () => {
    it('FRD-05: the real job, once the relay hands it over, runs the check and charges for it', async () => {
      const client = await shop();
      priced('1.00');
      await app.get(BalanceService).creditStandalone({
        tenantId: client.tenantId,
        amount: '5.00',
        type: LedgerEntryType.TopUp,
      });
      await admin.query("UPDATE control.tenants SET state = 'active' WHERE id = $1", [
        client.tenantId,
      ]);
      app.get(TenantCache).invalidateTenant(client.tenantId);
      steadfast.behaviour = {};
      const variant = await variantOf(client);
      // Only this order's job: the other tests' jobs ran by hand and would queue ahead of it.
      await admin.query("UPDATE control.job_outbox SET status = 'sent' WHERE status <> 'sent'");
      const made = await order(client, variant, freshMobile());
      const relay = app.get(JobRelay);
      while ((await relay.runDue()) > 0);
      await expect
        .poll(() => rowsOf(client), { timeout: 20_000 })
        .toEqual([
          { trigger: 'order', order_id: made.id, steadfast_state: 'answered', cost: '1.00' },
        ]);
      expect(await ledgerChecks(client)).toEqual(['-1.00']);
    });

    it('checks every new delivery that collects cash, on by default, apart from the order', async () => {
      const client = await shop();
      const rule = await client.get('/fraud-checks/rule');
      expect(rule.body).toEqual({ codOrders: true, minAmount: null });
      const variant = await variantOf(client);
      const phone = freshMobile();
      const made = await order(client, variant, phone);
      // A takeaway collects nothing on delivery, so it isn't checked.
      await order(client, variant, freshMobile(), { fulfilmentType: 'takeaway' });
      const jobs = await queued(client);
      expect(jobs).toEqual([
        { tenantId: client.tenantId, orderId: made.id, phone, codAmount: made.grandTotal },
      ]);
      // The order was made before any check ran: nothing is checked until the job runs.
      expect(await rowsOf(client)).toEqual([]);
      expect(steadfast.calls).toEqual([]);

      const ran = await app.get(FraudChecks).onNewOrder(jobs[0] as FraudCheckJob);
      expect(ran).toMatchObject({ trigger: FraudCheckTrigger.Order, orderId: made.id, phone });
      expect(await rowsOf(client)).toEqual([
        { trigger: 'order', order_id: made.id, steadfast_state: 'answered', cost: '0.00' },
      ]);
      const latest = await client.get(`/fraud-checks?phone=${phone}`);
      expect((latest.body as { latest: Check }).latest.orderId).toBe(made.id);
    });

    it('follows the rule: off checks none, and a smallest amount leaves out orders below it', async () => {
      const client = await shop();
      const variant = await variantOf(client);
      const saved = await client.put('/fraud-checks/rule', { codOrders: true, minAmount: 5000 });
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
      expect(saved.body).toEqual({ codOrders: true, minAmount: '5000.00' });
      await order(client, variant, freshMobile());
      const [small] = await queued(client);
      expect(await app.get(FraudChecks).onNewOrder(small as FraudCheckJob)).toBeNull();
      const big = await order(client, variant, freshMobile(), {
        items: [{ variantId: variant, quantity: 6 }],
      });
      const bigJob = (await queued(client)).find((job) => job.orderId === big.id);
      expect(await app.get(FraudChecks).onNewOrder(bigJob as FraudCheckJob)).not.toBeNull();
      await client.put('/fraud-checks/rule', { codOrders: false, minAmount: null });
      expect(await app.get(FraudChecks).onNewOrder(bigJob as FraudCheckJob)).toBeNull();
      expect((await rowsOf(client)).map((row) => row.order_id)).toEqual([big.id]);
    });

    it("skips a check it can't run, and never touches the order (FRD-05, FRD-06)", async () => {
      const client = await shop();
      const variant = await variantOf(client);
      const made = await order(client, variant, freshMobile());
      const [job] = await queued(client);
      await admin.query(
        "UPDATE control.tenants SET state = 'read_only', balance_frozen = true WHERE id = $1",
        [client.tenantId],
      );
      app.get(TenantCache).invalidateTenant(client.tenantId);
      expect(await app.get(FraudChecks).onNewOrder(job as FraudCheckJob)).toBeNull();
      expect(await rowsOf(client)).toEqual([]);
      expect(steadfast.calls).toEqual([]);
      const still = await admin.query<{ status_override: string | null }>(
        'SELECT status_override FROM tenant.orders WHERE id = $1',
        [made.id],
      );
      expect(still.rows).toEqual([{ status_override: null }]);
    });
  },
);

interface OrderCheck {
  state: string;
  reason: string | null;
  minAmount: string | null;
  message: string | null;
  check: Check | null;
}

describeIfDatabase("an order's automatic check as its page shows it (FRD-05, Slice 7.7)", () => {
  const read = async (
    client: ShopClient,
    orderId: string,
    language = 'bn',
  ): Promise<OrderCheck> => {
    const got = await sendExact(port, 'GET', `/api/v1/fraud-checks/orders/${orderId}`, undefined, {
      ...client.headers(),
      'accept-language': language,
    });
    expect(got.status, JSON.stringify(got.body)).toBe(200);
    return got.body as OrderCheck;
  };

  it("is being checked until the job runs, then shows the check; a takeaway is none of the rule's", async () => {
    const client = await shop();
    const variant = await variantOf(client);
    const made = await order(client, variant, freshMobile());
    expect(await read(client, made.id)).toMatchObject({
      state: 'pending',
      reason: null,
      check: null,
    });
    const [job] = await queued(client);
    await app.get(FraudChecks).onNewOrder(job as FraudCheckJob);
    const done = await read(client, made.id);
    expect(done.state).toBe('done');
    expect(done.check?.orderId).toBe(made.id);
    const takeaway = await order(client, variant, freshMobile(), { fulfilmentType: 'takeaway' });
    expect((await read(client, takeaway.id)).state).toBe('not_applicable');
  });

  it("says why it was skipped, the smallest amount as the rule had it then, and a refusal in the reader's words", async () => {
    const client = await shop();
    const variant = await variantOf(client);
    await client.put('/fraud-checks/rule', { codOrders: true, minAmount: 5000 });
    const small = await order(client, variant, freshMobile());
    const [smallJob] = await queued(client);
    await app.get(FraudChecks).onNewOrder(smallJob as FraudCheckJob);
    // The rule changes after: the order keeps the amount it was skipped under.
    await client.put('/fraud-checks/rule', { codOrders: false, minAmount: null });
    expect(await read(client, small.id)).toMatchObject({
      state: 'skipped',
      reason: 'below_minimum',
      minAmount: '5000.00',
    });
    const off = await order(client, variant, freshMobile());
    const offJob = (await queued(client)).find((job) => job.orderId === off.id);
    await app.get(FraudChecks).onNewOrder(offJob as FraudCheckJob);
    expect(await read(client, off.id)).toMatchObject({ state: 'skipped', reason: 'rule_off' });

    await client.put('/fraud-checks/rule', { codOrders: true, minAmount: null });
    const frozen = await order(client, variant, freshMobile());
    const frozenJob = (await queued(client)).find((job) => job.orderId === frozen.id);
    await admin.query('UPDATE control.tenants SET balance_frozen = true WHERE id = $1', [
      client.tenantId,
    ]);
    app.get(TenantCache).invalidateTenant(client.tenantId);
    await app.get(FraudChecks).onNewOrder(frozenJob as FraudCheckJob);
    const refused = await read(client, frozen.id, 'en');
    expect(refused).toMatchObject({ state: 'skipped', reason: 'refused' });
    expect(refused.message).toMatch(/balance/i);
    expect((await read(client, frozen.id, 'bn')).message).toMatch(/ব্যালেন্স/);
  });

  it("says when the minute's checks were used up, and that a check that never came failed", async () => {
    const settings = app.get(PlatformSettingsService);
    const real = settings.current.bind(settings);
    vi.spyOn(settings, 'current').mockImplementation(async (key) =>
      key === PlatformSettingKey.FraudChecksPerShopPerMinute
        ? { key, value: 1, description: '', updatedAt: new Date(), updatedBy: null }
        : real(key),
    );
    const client = await shop();
    expect((await check(client, freshMobile())).status).toBe(201);
    const variant = await variantOf(client);
    const made = await order(client, variant, freshMobile());
    const [job] = await queued(client);
    await app.get(FraudChecks).onNewOrder(job as FraudCheckJob);
    expect(await read(client, made.id)).toMatchObject({ state: 'skipped', reason: 'minute_limit' });

    const lost = await order(client, variant, freshMobile());
    expect((await read(client, lost.id)).state).toBe('pending');
    // Sixteen minutes on, its job never having written a check or a skip.
    clockShift = 16 * 60 * 1000;
    expect(await read(client, lost.id)).toMatchObject({ state: 'skipped', reason: 'failed' });
  });

  it("shows staff who see the order its check, and never another shop's order (SEC-02)", async () => {
    const client = await shop();
    const variant = await variantOf(client);
    const made = await order(client, variant, freshMobile());
    const viewer = await staffWith(port, texts, admin, client, ['orders:read']);
    const seen = await sendExact(
      port,
      'GET',
      `/api/v1/fraud-checks/orders/${made.id}`,
      undefined,
      viewer,
    );
    expect(seen.status, JSON.stringify(seen.body)).toBe(200);
    const other = await shop();
    const hidden = await sendExact(
      port,
      'GET',
      `/api/v1/fraud-checks/orders/${made.id}`,
      undefined,
      other.headers(),
    );
    expect(hidden.status).toBe(404);
    expect(
      (
        await sendExact(
          port,
          'GET',
          '/api/v1/fraud-checks/orders/not-an-id',
          undefined,
          other.headers(),
        )
      ).status,
    ).toBe(404);
  });
});
