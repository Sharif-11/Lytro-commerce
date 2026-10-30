import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { DAY_MS } from '../src/common/time';
import { PlanLimitOverridesService } from '../src/modules/billing/services/plan-limit-overrides.service';
import { GB } from '../src/modules/media/services/media-bandwidth';
import { MB } from '../src/modules/media/services/media-limits';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson, sendExact } from './support/http';
import { errorOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 10: the usage page, every metric against the shop's own limits -- its snapshot with its overrides, the
// same ones every check reads, never the live plan's (KNOWN-GAPS §83). LIM-02, PLN-05, PLN-06, PLN-11, PLN-19. Runs
// only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_usage_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const SITE = 'https://myshop.com';

interface Figure {
  metric: string;
  used: number;
  limit: number | null;
  packLeft: number | null;
  stopAt: number | null;
  unit: string;
  perCycle: boolean;
  level: number | string | null;
  runsOutAt: string | null;
}

interface UsageBody {
  cycleStart: string;
  cycleEnd: string;
  metrics: Figure[];
  bandwidthDays: unknown[];
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'usage-e2e-otp-secret-0123456789abcdefghijklmn';
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

/** The figures by metric, without the metric's own name. */
function byMetric(body: unknown): Record<string, Omit<Figure, 'metric'>> {
  const figures = new Map<string, Omit<Figure, 'metric'>>();
  for (const { metric, ...figure } of (body as UsageBody).metrics) figures.set(metric, figure);
  return Object.fromEntries(figures);
}

async function usageOf(shop: ShopClient): Promise<UsageBody> {
  const answer = await shop.get('/usage');
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  return answer.body as UsageBody;
}

function overrideLimit(tenantId: string, limitKey: string, value: number | null) {
  return app
    .get(PlanLimitOverridesService)
    .set(tenantId, limitKey, value, 'usage test', randomUUID());
}

describeIfDatabase('the usage page (LIM-02)', () => {
  it("shows every metric against the shop's limits, counting requests not yet stored", async () => {
    const shop = await openShop(port, texts, 'usage');
    for (const name of ['Shirt', 'Saree']) {
      expect((await shop.post('/products', { name, basePrice: 500 })).status).toBe(201);
    }
    const { key } = (await shop.post('/api-keys', { name: 'Website', websites: [SITE] })).body as {
      key: string;
    };
    for (let call = 0; call < 3; call += 1) {
      const answer = await sendExact(port, 'GET', '/v1/shop', undefined, {
        host: 'api.localhost',
        authorization: `Bearer ${key}`,
        origin: SITE,
      });
      expect(answer.status).toBe(200);
    }

    const body = await usageOf(shop);
    // A trial's limits (TRL-03), its free SMS a total rather than a month's; its one seat is the owner's, all in use.
    expect(byMetric(body)).toEqual({
      products: {
        used: 2,
        limit: 20,
        packLeft: null,
        stopAt: null,
        unit: 'count',
        perCycle: false,
        level: null,
        runsOutAt: null,
      },
      seats: {
        used: 1,
        limit: 1,
        packLeft: null,
        stopAt: null,
        unit: 'count',
        perCycle: false,
        level: 100,
        runsOutAt: null,
      },
      storage: {
        used: 0,
        limit: 200 * MB,
        packLeft: null,
        stopAt: null,
        unit: 'bytes',
        perCycle: false,
        level: null,
        runsOutAt: null,
      },
      // BND-04, RTE-11: no packs yet; served up to the limit and its 10% grace.
      bandwidth: {
        used: 0,
        limit: 5 * GB,
        packLeft: 0,
        stopAt: 5.5 * GB,
        unit: 'bytes',
        perCycle: true,
        level: null,
        runsOutAt: null,
      },
      requests: {
        used: 3,
        limit: 20_000,
        packLeft: 0,
        stopAt: 22_000,
        unit: 'count',
        perCycle: true,
        level: null,
        runsOutAt: null,
      },
      essential_sms_total: {
        used: 0,
        limit: 8,
        packLeft: null,
        stopAt: null,
        unit: 'count',
        perCycle: false,
        level: null,
        runsOutAt: null,
      },
      // QTA-04, TRL-03 (Slice 4.3): a trial's orders handled, in its whole life.
      orders_total: {
        used: 0,
        limit: 40,
        packLeft: null,
        stopAt: null,
        unit: 'count',
        perCycle: false,
        level: null,
        runsOutAt: null,
      },
    });
    // The cycle is a month long and running now.
    const start = new Date(body.cycleStart).getTime();
    const end = new Date(body.cycleEnd).getTime();
    expect(start).toBeLessThanOrEqual(Date.now());
    expect(end).toBeGreaterThan(Date.now());
    expect(end - start).toBeGreaterThanOrEqual(28 * DAY_MS);
    expect(end - start).toBeLessThanOrEqual(31 * DAY_MS);
    expect(body.bandwidthDays).toEqual([]);
  });

  it('lays overrides over the snapshot, and shows an unlimited limit as null (PLN-11, PLN-19)', async () => {
    const shop = await openShop(port, texts, 'usage-over');
    await overrideLimit(shop.tenantId, 'products', 50);
    await overrideLimit(shop.tenantId, 'storage_mb', null);
    const figures = byMetric(await usageOf(shop));
    expect(figures['products']?.limit).toBe(50);
    expect(figures['storage']?.limit).toBeNull();
    // SEC-02: only its own -- the first case's shop made two products and three API calls.
    expect(figures['products']?.used).toBe(0);
    expect(figures['requests']?.used).toBe(0);
  });

  it('holds a shop to the limits it bought, never an edit to the live plan (PLN-05, PLN-06)', async () => {
    const shop = await openShop(port, texts, 'usage-frozen');
    // The operator lowers Trial's products and raises its seats; the shop's own snapshot still says 20 and 1.
    await admin.query(
      `UPDATE control.plans SET limits = limits || '{"products": 1, "staff": 5}' WHERE name = 'Trial'`,
    );
    try {
      for (const name of ['One', 'Two']) {
        expect((await shop.post('/products', { name, basePrice: 100 })).status).toBe(201);
      }
      const role = (await shop.post('/roles', { name: 'Clerk', permissions: [] })).body as {
        id: string;
      };
      const seat = await shop.post('/staff', {
        phone: texts.freshPhone(),
        password: 'staff-pass-2468',
        roleIds: [role.id],
      });
      expect(seat.status, JSON.stringify(seat.body)).toBe(402);
      expect(errorOf(seat).code).toBe('plan_limit_reached');
      const frozen = byMetric(await usageOf(shop));
      expect(frozen['products']?.limit).toBe(20);
      expect(frozen['seats']?.limit).toBe(1);

      // A shop opened now freezes the new figures.
      const later = await openShop(port, texts, 'usage-later');
      expect(byMetric(await usageOf(later))['products']?.limit).toBe(1);
    } finally {
      await admin.query(
        `UPDATE control.plans SET limits = limits || '{"products": 20, "staff": 1}' WHERE name = 'Trial'`,
      );
    }
  });

  it("dates the run-out of requests at the cycle's pace, as the email does, until they are used up (LIM-01, Slice 11.5c)", async () => {
    const shop = await openShop(port, texts, 'usage-pace');
    await overrideLimit(shop.tenantId, 'requests_monthly', 10);
    const { key } = (await shop.post('/api-keys', { name: 'Website', websites: [SITE] })).body as {
      key: string;
    };
    const call = (): Promise<unknown> =>
      sendExact(port, 'GET', '/v1/shop', undefined, {
        host: 'api.localhost',
        authorization: `Bearer ${key}`,
        origin: SITE,
      });
    for (let made = 0; made < 3; made += 1) await call();
    // 3 on the cycle's first day, a whole day at least: 3 a day, the 7 left last 7/3 days.
    const paced = byMetric(await usageOf(shop));
    const runsOut = Date.parse(paced['requests']?.runsOutAt ?? '');
    expect(runsOut - Date.now()).toBeGreaterThan((7 / 3) * DAY_MS - 60_000);
    expect(runsOut - Date.now()).toBeLessThan((7 / 3) * DAY_MS + 60_000);
    // Only the metrics that serve shoppers have one; bandwidth is unused, so it lasts.
    expect(paced['products']?.runsOutAt).toBeNull();
    expect(paced['bandwidth']?.runsOutAt).toBeNull();
    // Used up, there is nothing left to run out.
    for (let made = 3; made < 10; made += 1) await call();
    expect(byMetric(await usageOf(shop))['requests']).toMatchObject({ used: 10, runsOutAt: null });
  });

  it("is for whoever may see the shop's billing (payments:read)", async () => {
    const refused = await openShop(port, texts, 'usage-staff');
    const clerk = await staffWith(port, texts, admin, refused, ['products:read']);
    expect((await getJson(port, '/usage', clerk)).status).toBe(403);
    const allowed = await openShop(port, texts, 'usage-billing');
    const accountant = await staffWith(port, texts, admin, allowed, ['payments:read']);
    const answer = await getJson(port, '/usage', accountant);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    // On Starter (staffWith moves the shop there), the free SMS is a month's.
    expect(byMetric(answer.body)['essential_sms_monthly']).toEqual({
      used: 0,
      limit: 10,
      packLeft: null,
      stopAt: null,
      unit: 'count',
      perCycle: true,
      level: null,
      runsOutAt: null,
    });
  });
});
