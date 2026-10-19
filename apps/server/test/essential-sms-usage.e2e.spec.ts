import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { countSmsParts } from '../src/modules/shared/messaging/sms-parts';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { SmsCapture } from './support/sms-capture';
import { cookieFrom, getJson, postJson } from './support/http';

// AUTH-21: the tenant's essential-SMS allowance usage, over real HTTP and the real database. A sign-up
// code (no shop yet) and the shop-ready SMS are both platform cost; a sign-in code to an already-existing
// shop is the owner's own choice (they have a password) and counts. Runs only when DATABASE_TEST_ADMIN_URL
// is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_essential_sms_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);
const get = (path: string, headers: Record<string, string> = {}) => getJson(port, path, headers);

const freshSlug = (): string => `s${randomUUID().replace(/-/g, '').slice(0, 10)}`;

/** AUTH-07's own 60-second resend cooldown is per (destination, channel, kind) regardless of whether the
 * latest challenge was ever consumed -- this test needs a second real code on the same phone right away. */
async function passCooldown(phone: string): Promise<void> {
  await admin.query(
    "UPDATE control.verification_challenges SET created_at = now() - interval '5 minutes' WHERE destination = $1",
    [phone],
  );
}

interface Owner {
  phone: string;
  slug: string;
  cookie: string;
  csrfToken: string;
}

/** Signs up a brand-new phone and creates its shop -- the shop-ready SMS fires during this, platform cost. */
async function owner(): Promise<Owner> {
  const phone = texts.freshPhone();
  const slug = freshSlug();
  await post('/auth/phone/code', { phone });
  const entered = await post('/auth/phone/verify', { phone, code: texts.codeFor(phone) });
  const session = {
    cookie: cookieFrom(entered),
    csrfToken: (entered.body as { csrfToken: string }).csrfToken,
  };
  const shop = await post(
    '/shops',
    { ownerName: 'Owner', shopName: `Shop ${slug}`, address: slug },
    { cookie: session.cookie, 'x-csrf-token': session.csrfToken },
  );
  expect(shop.status).toBe(201);
  return { phone, slug, ...session };
}

function shopCall(who: Owner): Record<string, string> {
  return {
    cookie: who.cookie,
    'x-csrf-token': who.csrfToken,
    host: 'localhost',
    'x-lytro-shop': who.slug,
  };
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'essential-sms-e2e-otp-secret-0123456789ab';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
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

describeIfDatabase('AUTH-21: essential-SMS allowance', () => {
  it('a sign-up code and the shop-ready SMS are both platform cost -- neither counts', async () => {
    const who = await owner();
    const usage = await get('/balance/essential-sms', shopCall(who));
    expect(usage.status).toBe(200);
    expect(usage.body).toMatchObject({ monthlyUsed: 0, totalUsed: 0 });
  });

  it('the request-code response never differs by account state (AUTH-13/P1-E10), but verify reveals the suggestion', async () => {
    const who = await owner();
    await passCooldown(who.phone);

    const codeResponse = await post('/auth/phone/code', { phone: who.phone });
    expect(codeResponse.status).toBe(200);
    expect(codeResponse.body).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 60 });

    const verifyResponse = await post('/auth/phone/verify', {
      phone: who.phone,
      code: texts.codeFor(who.phone),
    });
    expect(verifyResponse.status).toBe(200);
    expect((verifyResponse.body as { suggestPassword: boolean }).suggestPassword).toBe(true);

    const expectedParts = countSmsParts(texts.sent.at(-1)?.body ?? '').parts;
    const usage = await get('/balance/essential-sms', shopCall(who));
    expect(usage.body).toMatchObject({ monthlyUsed: expectedParts, totalUsed: expectedParts });

    // A second sign-in code adds to the same running total, it doesn't replace it.
    await passCooldown(who.phone);
    await post('/auth/phone/code', { phone: who.phone });
    const after = await get('/balance/essential-sms', shopCall(who));
    expect(after.body).toMatchObject({
      monthlyUsed: expectedParts * 2,
      totalUsed: expectedParts * 2,
    });
  });

  it("one shop's sign-in codes never raise another shop's usage", async () => {
    const first = await owner();
    const second = await owner();
    await passCooldown(first.phone);
    await post('/auth/phone/code', { phone: first.phone });

    const firstUsage = await get('/balance/essential-sms', shopCall(first));
    const secondUsage = await get('/balance/essential-sms', shopCall(second));
    expect((firstUsage.body as { totalUsed: number }).totalUsed).toBeGreaterThan(0);
    expect(secondUsage.body).toMatchObject({ monthlyUsed: 0, totalUsed: 0 });
  });

  it('PLN-11: a per-tenant override wins over the plan snapshot for both limits', async () => {
    const who = await owner();
    await admin.query(
      `INSERT INTO control.plan_limit_overrides (tenant_id, limit_key, value, reason, set_by)
       VALUES
         ((SELECT id FROM control.tenants WHERE slug = $1), 'essential_sms_total', '500', 'goodwill credit', $2),
         ((SELECT id FROM control.tenants WHERE slug = $1), 'essential_sms_monthly', 'null', 'goodwill credit', $2)`,
      [who.slug, randomUUID()],
    );

    const usage = await get('/balance/essential-sms', shopCall(who));
    expect(usage.status).toBe(200);
    expect(usage.body).toMatchObject({ totalLimit: 500, monthlyLimit: null });
  });
});

async function tenantIdOf(slug: string): Promise<string> {
  const row = await admin.query<{ id: string }>('SELECT id FROM control.tenants WHERE slug = $1', [
    slug,
  ]);
  return row.rows[0]?.id ?? '';
}

/** Past both the resend cooldown and AUTH-07's hourly cap, so one phone can be sent many codes in a test. */
async function forgetCodes(phone: string): Promise<void> {
  await admin.query(
    "UPDATE control.verification_challenges SET created_at = now() - interval '2 hours' WHERE destination = $1",
    [phone],
  );
}

async function usageRows(tenantId: string): Promise<number> {
  const rows = await admin.query('SELECT 1 FROM control.essential_sms_usage WHERE tenant_id = $1', [
    tenantId,
  ]);
  return rows.rowCount ?? 0;
}

async function seedUsage(tenantId: string, parts: number, daysAgo: number): Promise<void> {
  await admin.query(
    `INSERT INTO control.essential_sms_usage (tenant_id, kind, parts, created_at)
     VALUES ($1, 'otp', $2, now() - make_interval(days => $3))`,
    [tenantId, parts, daysAgo],
  );
}

describeIfDatabase('LIF-10, SMS-04: a sign-in code to a lapsed shop is never counted', () => {
  it('counts nothing in grace, read-only, locked or archived, and counts again once live', async () => {
    const who = await owner();
    const tenantId = await tenantIdOf(who.slug);

    for (const state of ['grace', 'read_only', 'locked', 'archived']) {
      await admin.query('UPDATE control.tenants SET state = $2 WHERE id = $1', [tenantId, state]);
      await forgetCodes(who.phone);
      const sent = await post('/auth/phone/code', { phone: who.phone });
      expect(sent.status).toBe(200); // the code itself still goes out
    }
    expect(await usageRows(tenantId)).toBe(0);

    await admin.query(`UPDATE control.tenants SET state = 'active' WHERE id = $1`, [tenantId]);
    await forgetCodes(who.phone);
    await post('/auth/phone/code', { phone: who.phone });
    expect(await usageRows(tenantId)).toBe(1);
  });
});

describeIfDatabase('UPG-10, PYG-19: the monthly allowance cycle', () => {
  it('a plan counts from its period start, so a new period (an upgrade) starts again at zero', async () => {
    const who = await owner();
    const tenantId = await tenantIdOf(who.slug);
    await admin.query(
      `UPDATE control.tenants SET state = 'active', period_start = now() - interval '5 days',
         period_end = now() + interval '25 days'
       WHERE id = $1`,
      [tenantId],
    );
    await seedUsage(tenantId, 2, 8); // before this period: last cycle's
    await seedUsage(tenantId, 3, 2); // this period

    const before = await get('/balance/essential-sms', shopCall(who));
    expect(before.body).toMatchObject({ monthlyUsed: 3, totalUsed: 5 });

    // An upgrade starts a new period at its confirmation (UPG-09).
    await admin.query(`UPDATE control.tenants SET period_start = now() WHERE id = $1`, [tenantId]);
    const after = await get('/balance/essential-sms', shopCall(who));
    expect(after.body).toMatchObject({ monthlyUsed: 0, totalUsed: 5 });
  });

  it('pay-as-you-go counts in months from the shop creation date, not its switch date', async () => {
    const who = await owner();
    const tenantId = await tenantIdOf(who.slug);
    // Created 40 days ago, so its current cycle began 9 to 12 days ago (one calendar month after creation);
    // switched to pay-as-you-go 5 days ago.
    await admin.query(
      `UPDATE control.tenants SET state = 'pay_as_you_go', created_at = now() - interval '40 days',
         period_start = now() - interval '5 days', period_end = NULL
       WHERE id = $1`,
      [tenantId],
    );
    await seedUsage(tenantId, 4, 15); // the previous cycle
    await seedUsage(tenantId, 1, 8); // this cycle, though before the switch

    const usage = await get('/balance/essential-sms', shopCall(who));
    expect(usage.body).toMatchObject({ monthlyUsed: 1, totalUsed: 5 });
  });
});
