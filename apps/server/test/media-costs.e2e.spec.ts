import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CLOUDFLARE_PRICES, PlatformSettingKey } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import {
  R2UsageUnavailable,
  type R2DayFigures,
  type R2Usage,
} from '../src/modules/media-costs/ports/r2-usage';
import { MediaCosts } from '../src/modules/media-costs/services/media-costs';
import { MEDIA_COSTS_CLOCK, R2_USAGE } from '../src/modules/media-costs/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, getJson, patchJson, postJson, type HttpResult } from './support/http';
import { openShop } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// MED-12, D8-17, D8-57 to D8-64 (Phase 8 Slice 8.6, read agreed 2026-11-10): R2's days read from Cloudflare's analytics
// (a stand-in here), the period's estimate against the budget, the alert to its one address once a period, the top
// shops by the media Worker's requests, and the settings behind them. Each case keeps to its own months of 2031, so
// none reads another's days. Runs only with DATABASE_TEST_ADMIN_URL.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_media_costs_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 40_000 });

const PASSWORD = 'media-costs-pass-1';
const GB = 1_000_000_000;

/** Cloudflare's analytics, played by the test: the figures it holds by day, and each set of days asked for. */
class FakeR2 implements R2Usage {
  connected = true;
  readonly asked: string[][] = [];
  fail = false;
  private readonly held = new Map<string, R2DayFigures[]>();

  hold(day: string, ...buckets: Omit<R2DayFigures, 'day'>[]): void {
    this.held.set(
      day,
      buckets.map((bucket) => ({ ...bucket, day })),
    );
  }

  days(days: readonly string[]): Promise<R2DayFigures[]> {
    this.asked.push([...days]);
    if (this.fail) return Promise.reject(new R2UsageUnavailable('Cloudflare answered 503'));
    return Promise.resolve(days.flatMap((day) => this.held.get(day) ?? []));
  }
}

const bucket = (
  name: string,
  given: Partial<Omit<R2DayFigures, 'day' | 'bucket'>> = {},
): Omit<R2DayFigures, 'day'> => ({
  bucket: name,
  classA: 0,
  classB: 0,
  freeOps: 0,
  peakBytes: 0,
  objects: 0,
  ...given,
});

const r2 = new FakeR2();
const texts = new SmsCapture();
let now = new Date('2031-01-15T10:00:00Z');

let app: INestApplication;
let port: number;
let admin: pg.Client;
let costs: MediaCosts;
let operator: Record<string, string> = {};

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'media-costs-e2e-otp-secret-012345678901234';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(R2_USAGE)
    .useValue(r2)
    .overrideProvider(MEDIA_COSTS_CLOCK)
    .useValue(() => now)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  costs = app.get(MediaCosts);
  const email = `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
  await admin.query(
    'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2)',
    [email, await hash(PASSWORD, 12)],
  );
  const signedIn = await postJson(port, '/auth/operator/signin', { email, password: PASSWORD });
  const secret = (signedIn.body as { secret?: string }).secret;
  if (!secret) throw new Error(`operator sign-in: ${String(signedIn.status)}`);
  const enrolled = await postJson(port, '/auth/operator/enroll', {
    email,
    password: PASSWORD,
    code: await generate({ secret }),
  });
  operator = {
    cookie: cookieFrom(enrolled),
    'x-csrf-token': (enrolled.body as { csrfToken: string }).csrfToken,
  };
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

beforeEach(() => {
  r2.connected = true;
  r2.fail = false;
  r2.asked.length = 0;
});

function setting(key: PlatformSettingKey, value: unknown): Promise<HttpResult> {
  return patchJson(
    port,
    `/operator/settings/${key}`,
    { value, reason: 'media costs test' },
    operator,
  );
}

async function settings(values: Partial<Record<PlatformSettingKey, unknown>>): Promise<void> {
  for (const key of Object.values(PlatformSettingKey)) {
    if (!(key in values)) continue;
    const answer = await setting(key, values[key]);
    expect(answer.status, `${key}: ${JSON.stringify(answer.body)}`).toBe(200);
  }
}

interface View {
  period: { dateFrom: string; dateTo: string; days: number; daysRecorded: number };
  connected: boolean;
  readAt: string | null;
  budget: {
    amount: string;
    alertPercent: number;
    alertAt: string;
    usedPercent: number;
    alertEmail: string | null;
    alertSentAt: string | null;
  };
  r2: {
    classA: { operations: number; billableMillions: number; cost: string };
    classB: { operations: number; billableMillions: number; cost: string };
    storage: { gbMonths: number; billableGbMonths: number; cost: string };
    cost: string;
    buckets: {
      bucket: string;
      classA: number;
      classB: number;
      freeOps: number;
      gbMonths: number;
      latestBytes: number;
      objects: number;
    }[];
  };
  workers: {
    requests: number;
    bytes: number;
    billableMillions: number;
    monthly: string;
    cost: string;
  };
  total: string;
  topShops: { tenantId: string; name: string; requests: number; bytes: number }[];
  periods: { dateFrom: string; dateTo: string }[];
}

async function view(query = ''): Promise<View> {
  const answer = await getJson(port, `/operator/media-costs${query}`, operator);
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  return answer.body as View;
}

/** The media Worker's day for a shop, as the bandwidth minute writes it (BND-08). */
async function served(tenantId: string, day: string, requests: number, bytes = 0): Promise<void> {
  await admin.query(
    `INSERT INTO control.media_bandwidth_daily (tenant_id, cycle_start, day, bytes, requests)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, `${day}T00:00:00Z`, day, bytes, requests],
  );
}

async function alertMail(to: string): Promise<{ subject: string; body: string }[]> {
  const { rows } = await admin.query<{ subject: string; body: string }>(
    'SELECT subject, body FROM control.mail_outbox WHERE to_email = $1',
    [to],
  );
  return rows;
}

async function recordedDays(
  from: string,
  to: string,
): Promise<{ day: string; bucket: string; class_a: string; class_b: string; free_ops: string }[]> {
  const { rows } = await admin.query<{
    day: string;
    bucket: string;
    class_a: string;
    class_b: string;
    free_ops: string;
  }>(
    `SELECT day::text, bucket, class_a::text, class_b::text, free_ops::text FROM control.media_cost_days
     WHERE day >= $1 AND day <= $2 ORDER BY day, bucket`,
    [from, to],
  );
  return rows;
}

describeIfDatabase("Lytro's media costs (MED-12, D8-57 to D8-64)", () => {
  it('reads every day of the period so far, then only the last three again, every bucket kept apart', async () => {
    now = new Date('2031-01-05T10:00:00Z');
    for (const day of ['2031-01-01', '2031-01-02', '2031-01-03', '2031-01-04', '2031-01-05']) {
      r2.hold(
        day,
        bucket('lytro-media', {
          classA: 10,
          classB: 300,
          freeOps: 2,
          peakBytes: 3 * GB,
          objects: 40,
        }),
        bucket('lytro-evidence', { classA: 1, classB: 4, peakBytes: GB / 2, objects: 3 }),
        bucket('', { classA: 5 }),
      );
    }
    expect(await costs.pull()).toMatchObject({ days: 5, rows: 15 });
    expect(r2.asked).toEqual([
      ['2031-01-01', '2031-01-02', '2031-01-03', '2031-01-04', '2031-01-05'],
    ]);
    const days = await recordedDays('2031-01-01', '2031-01-05');
    expect(days).toHaveLength(15);
    expect(days.filter((day) => day.bucket === 'lytro-media')[0]).toMatchObject({
      class_a: '10',
      class_b: '300',
      free_ops: '2',
    });

    // The next hour: only the days still settling, today and the two before it.
    r2.asked.length = 0;
    now = new Date('2031-01-05T11:00:00Z');
    expect(await costs.pull()).toMatchObject({ days: 3 });
    expect(r2.asked).toEqual([['2031-01-03', '2031-01-04', '2031-01-05']]);

    const page = await view();
    expect(page.connected).toBe(true);
    expect(page.period).toEqual({
      dateFrom: '2031-01-01',
      dateTo: '2031-01-31',
      days: 31,
      daysRecorded: 5,
    });
    expect(page.readAt).not.toBeNull();
    // Every bucket on the account, the screenshots' and the account's own operations each on their own line (D8-59).
    expect(page.r2.buckets.map((line) => line.bucket)).toEqual([
      'lytro-media',
      'lytro-evidence',
      '',
    ]);
    expect(page.r2.buckets[0]).toMatchObject({
      classA: 50,
      classB: 1500,
      freeOps: 10,
      gbMonths: 0.5,
      latestBytes: 3 * GB,
      objects: 40,
    });
    expect(page.r2.classA.operations).toBe(80);
    expect(page.r2.classB.operations).toBe(1520);
  });

  it("works the bill out as Cloudflare does: rounded up, then the month's allowance off", async () => {
    now = new Date('2031-02-11T10:00:00Z');
    for (let index = 1; index <= 10; index += 1) {
      const day = `2031-02-${String(index).padStart(2, '0')}`;
      r2.hold(
        day,
        bucket('lytro-media', {
          classA: index === 1 ? 1_000_001 : 0,
          classB: 900_000,
          peakBytes: 60 * GB,
        }),
      );
    }
    const shop = await openShop(port, texts, 'mc');
    await served(shop.tenantId, '2031-02-03', 10_500_000);
    await costs.pull();
    const page = await view();
    // 1,000,001 writes bill as 2 million, less the month's 1 million free: one million at $4.50.
    expect(page.r2.classA).toEqual({ operations: 1_000_001, billableMillions: 1, cost: '4.50' });
    // 9 million reads are inside the 10 million free.
    expect(page.r2.classB).toEqual({ operations: 9_000_000, billableMillions: 0, cost: '0.00' });
    // 60 GB on each of 10 days is 20 GB-months: 10 past the free 10, at $0.015.
    expect(page.r2.storage).toEqual({ gbMonths: 20, billableGbMonths: 10, cost: '0.15' });
    expect(page.r2.cost).toBe('4.65');
    // 10.5 million requests bill as 11 million, 1 past the 10 included, on top of the $5 a month.
    expect(page.workers).toMatchObject({
      requests: 10_500_000,
      billableMillions: 1,
      monthly: '5.00',
      cost: '5.30',
    });
    expect(page.total).toBe('9.95');
    // The owner's $10 default (D8-58), its alert at 80%.
    expect(page.budget).toMatchObject({ amount: '10.00', alertPercent: 80, alertAt: '8.00' });
  });

  it('emails the one alert address once a period, and only logs while none is set', async () => {
    now = new Date('2031-03-04T10:00:00Z');
    r2.hold('2031-03-02', bucket('lytro-media', { classA: 2_000_000 }));
    const address = `owner.${randomUUID().slice(0, 8)}@example.com`;

    // $5 for Workers and $4.50 for writes passes $8, but no address is set: nothing is sent, nothing is recorded.
    expect((await costs.pull()).alerted).toBe(false);
    expect((await view()).budget.alertSentAt).toBeNull();

    await settings({ [PlatformSettingKey.MediaCostAlertEmail]: address });
    expect((await costs.pull()).alerted).toBe(true);
    const sent = await alertMail(address);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toContain('95%');
    expect(sent[0]?.body).toContain('2031-03-01 to 2031-03-31');
    expect(sent[0]?.body).toContain('$9.50');

    // The hours after send nothing more this period.
    now = new Date('2031-03-04T11:00:00Z');
    expect((await costs.pull()).alerted).toBe(false);
    expect(await alertMail(address)).toHaveLength(1);
    const page = await view();
    expect(page.budget.alertEmail).toBe(address);
    expect(page.budget.alertSentAt).not.toBeNull();
  });

  it("holds the estimate against the operator's budget and percent", async () => {
    now = new Date('2031-04-04T10:00:00Z');
    r2.hold('2031-04-02', bucket('lytro-media', { classA: 2_000_000 }));
    const address = `owner.${randomUUID().slice(0, 8)}@example.com`;
    await settings({
      [PlatformSettingKey.MediaCostAlertEmail]: address,
      [PlatformSettingKey.MediaBudgetUsd]: 50,
    });
    // $9.50 of $50 is under 80%: no alert.
    expect((await costs.pull()).alerted).toBe(false);
    expect((await view()).budget).toMatchObject({
      amount: '50.00',
      alertAt: '40.00',
      usedPercent: 19,
    });

    await settings({ [PlatformSettingKey.MediaBudgetAlertPercent]: 15 });
    expect((await costs.pull()).alerted).toBe(true);
    expect(await alertMail(address)).toHaveLength(1);
    await settings({
      [PlatformSettingKey.MediaBudgetUsd]: 10,
      [PlatformSettingKey.MediaBudgetAlertPercent]: 80,
    });
  });

  it("starts the period on Cloudflare's billing day", async () => {
    await settings({ [PlatformSettingKey.CloudflareBillingDay]: 15 });
    now = new Date('2031-05-10T10:00:00Z');
    r2.hold('2031-04-20', bucket('lytro-media', { classB: 7 }));
    r2.hold('2031-05-10', bucket('lytro-media', { classB: 3 }));
    await costs.pull();
    // Day 15 of April to day 14 of May; the 20th of April is still within Cloudflare's 31 days.
    expect(r2.asked[0]?.[0]).toBe('2031-04-15');
    const page = await view();
    expect(page.period).toMatchObject({ dateFrom: '2031-04-15', dateTo: '2031-05-14', days: 30 });
    expect(page.r2.classB.operations).toBe(10);
    await settings({ [PlatformSettingKey.CloudflareBillingDay]: 1 });
  });

  it("ranks the shops by the media Worker's requests, with every shop's in the Workers line", async () => {
    now = new Date('2031-06-20T10:00:00Z');
    const [busy, quiet] = [await openShop(port, texts, 'mc'), await openShop(port, texts, 'mc')];
    await served(busy.tenantId, '2031-06-02', 900, 5_000_000);
    await served(busy.tenantId, '2031-06-03', 100, 1_000_000);
    await served(quiet.tenantId, '2031-06-02', 40, 9_000_000);
    // A day of the period before counts in neither.
    await served(quiet.tenantId, '2031-05-31', 5_000);
    const page = await view();
    expect(page.topShops.map((shop) => [shop.tenantId, shop.requests, shop.bytes])).toEqual([
      [busy.tenantId, 1000, 6_000_000],
      [quiet.tenantId, 40, 9_000_000],
    ]);
    expect(page.workers).toMatchObject({ requests: 1040, bytes: 15_000_000 });
  });

  it('keeps past periods after Cloudflare forgets them, and steps back through them', async () => {
    now = new Date('2031-07-02T10:00:00Z');
    r2.hold('2031-07-01', bucket('lytro-media', { classA: 1 }));
    await costs.pull();
    r2.asked.length = 0;
    r2.hold('2031-08-01', bucket('lytro-media', { classA: 1000 }));
    now = new Date('2031-08-20T10:00:00Z');
    await costs.pull();
    // July's period is over and Cloudflare has forgotten its first day: never asked for again, still on record, and
    // August's first day is August's alone.
    expect(r2.asked.flat()).not.toContain('2031-07-01');
    const july = await view('?period=2031-07-19');
    expect(july.period).toMatchObject({ dateFrom: '2031-07-01', dateTo: '2031-07-31' });
    expect(july.r2.classA.operations).toBe(1);
    const august = await view();
    expect(august.periods[0]).toEqual({ dateFrom: '2031-08-01', dateTo: '2031-08-31' });
    expect(august.periods).toContainEqual({ dateFrom: '2031-07-01', dateTo: '2031-07-31' });
    expect(august.periods).toContainEqual({ dateFrom: '2031-01-01', dateTo: '2031-01-31' });
  });

  it("follows the operator's price sheet, and refuses settings it can't use", async () => {
    now = new Date('2031-09-04T10:00:00Z');
    r2.hold('2031-09-02', bucket('lytro-media', { classA: 2_000_000 }));
    await costs.pull();
    expect((await view()).r2.classA.cost).toBe('4.50');
    await settings({
      [PlatformSettingKey.CloudflarePrices]: {
        ...DEFAULT_CLOUDFLARE_PRICES,
        r2ClassAPerMillion: 6,
      },
    });
    expect((await view()).r2.classA.cost).toBe('6.00');
    await settings({ [PlatformSettingKey.CloudflarePrices]: DEFAULT_CLOUDFLARE_PRICES });

    const refused: [PlatformSettingKey, unknown][] = [
      [PlatformSettingKey.MediaBudgetUsd, 0],
      [PlatformSettingKey.MediaBudgetUsd, 12.5],
      [PlatformSettingKey.MediaBudgetAlertPercent, 101],
      [PlatformSettingKey.MediaCostAlertEmail, 'not an address'],
      [PlatformSettingKey.MediaCostAlertEmail, ' owner@example.com'],
      [PlatformSettingKey.CloudflareBillingDay, 29],
      [PlatformSettingKey.CloudflarePrices, { r2ClassAPerMillion: 4.5 }],
      [
        PlatformSettingKey.CloudflarePrices,
        { ...DEFAULT_CLOUDFLARE_PRICES, workersPerMillion: -1 },
      ],
    ];
    for (const [key, value] of refused) {
      expect((await setting(key, value)).status, `${key} ${JSON.stringify(value)}`).toBe(400);
    }
  });

  it('records nothing from a failed read and keeps what was there', async () => {
    now = new Date('2031-10-03T10:00:00Z');
    r2.hold('2031-10-02', bucket('lytro-media', { classB: 11 }));
    await costs.pull();
    r2.hold('2031-10-02', bucket('lytro-media', { classB: 99 }));
    r2.fail = true;
    await expect(costs.pull()).rejects.toThrow(R2UsageUnavailable);
    expect((await view()).r2.classB.operations).toBe(11);
  });

  it("reads nothing without Cloudflare's token, and says it isn't connected", async () => {
    now = new Date('2031-11-03T10:00:00Z');
    r2.connected = false;
    expect(await costs.pull()).toEqual({ days: 0, rows: 0, alerted: false });
    expect(r2.asked).toHaveLength(0);
    expect((await view()).connected).toBe(false);
  });

  it('is for operators only, and refuses a period that is not a day', async () => {
    expect((await getJson(port, '/operator/media-costs')).status).toBe(401);
    expect((await getJson(port, '/operator/media-costs?period=2031-13-01', operator)).status).toBe(
      400,
    );
    expect((await getJson(port, '/operator/media-costs?month=2031-01', operator)).status).toBe(400);
  });
});
