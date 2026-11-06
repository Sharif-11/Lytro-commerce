import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LedgerEntryType } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { SmsCapture } from './support/sms-capture';
import { cookieFrom, getJson, postJson } from './support/http';

// AUTH-21, SMS-04 to SMS-08: the shop's essential-SMS allowance, over real HTTP and the real database. A sign-up
// code (no shop yet) and the shop-ready SMS are both platform cost; a sign-in code to an existing shop, its owner's
// or a staff member's, and a staff member's reset code are the shop's own use: free within its allowance, then
// charged from its balance, never below zero (Slice 7.1). Runs only when DATABASE_TEST_ADMIN_URL is set.
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

/** SMS-09, D7-13: a text's units at the seeded 67-character unit, whatever the language. */
const unitsOf = (body: string): number => Math.max(1, Math.ceil(Array.from(body).length / 67));

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

    const expectedParts = unitsOf(texts.sent.at(-1)?.body ?? '');
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

async function seedUsage(tenantId: string, units: number, daysAgo: number): Promise<void> {
  await admin.query(
    `INSERT INTO control.essential_sms_usage (tenant_id, kind, units, created_at)
     VALUES ($1, 'otp', $2, now() - make_interval(days => $3))`,
    [tenantId, units, daysAgo],
  );
}

/** PLN-11: the shop's free SMS, set straight on it -- a trial's total is the allowance (TRL-03). */
async function allowance(tenantId: string, total: number): Promise<void> {
  await admin.query(
    `INSERT INTO control.plan_limit_overrides (tenant_id, limit_key, value, reason, set_by)
     VALUES ($1, 'essential_sms_total', $2, 'test', $3)
     ON CONFLICT (tenant_id, limit_key) DO UPDATE SET value = EXCLUDED.value`,
    [tenantId, JSON.stringify(total), randomUUID()],
  );
}

async function topUp(tenantId: string, amount: string): Promise<void> {
  await app.get(BalanceService).creditStandalone({ tenantId, amount, type: LedgerEntryType.TopUp });
}

/** The balance's SMS charges and their reversals, oldest first. */
async function smsMoney(tenantId: string): Promise<string[][]> {
  const rows = await admin.query<{ type: string; amount: string }>(
    `SELECT type, amount::text AS amount FROM tenant.balance_ledger
     WHERE tenant_id = $1 AND type IN ('sms', 'reversal') ORDER BY id`,
    [tenantId],
  );
  return rows.rows.map((row) => [row.type, row.amount]);
}

interface LoggedSms {
  kind: string;
  status: string;
  units: number;
  cost: string;
  is_essential: boolean;
  blocked_reason: string | null;
  provider_message_id: string | null;
}

async function smsLog(tenantId: string): Promise<LoggedSms[]> {
  const rows = await admin.query<LoggedSms>(
    `SELECT kind, status, units, cost::text AS cost, is_essential, blocked_reason, provider_message_id
     FROM tenant.sms_log WHERE tenant_id = $1 ORDER BY id`,
    [tenantId],
  );
  return rows.rows;
}

/** A staff member of the shop with a password, on Starter so the shop has a seat for them (D3-9). */
async function staffOf(who: Owner): Promise<string> {
  const tenantId = await tenantIdOf(who.slug);
  await admin.query(
    "UPDATE control.tenants SET plan_id = (SELECT id FROM control.plans WHERE name = 'Starter'), plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Starter') WHERE id = $1",
    [tenantId],
  );
  const role = await post(
    '/roles',
    { name: 'Readers', permissions: ['products:read'] },
    shopCall(who),
  );
  expect(role.status, JSON.stringify(role.body)).toBe(201);
  const phone = texts.freshPhone();
  const made = await post(
    '/staff',
    { phone, password: 'staff-pass-2468', roleIds: [(role.body as { id: string }).id] },
    shopCall(who),
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return phone;
}

describeIfDatabase("SMS-04 to SMS-08 (Slice 7.1): the shop's own codes, free then charged", () => {
  const SIGNIN_TEXT = /^Lytro-এ লগইনের জন্য OTP হচ্ছে \d{6}। কারো সাথে শেয়ার করবেন না।$/;

  it('is free as far as the allowance reaches, then charged from the balance at the SMS rate', async () => {
    const who = await owner();
    const tenantId = await tenantIdOf(who.slug);
    await allowance(tenantId, 1);
    await topUp(tenantId, '10.00');

    await passCooldown(who.phone);
    expect((await post('/auth/phone/code', { phone: who.phone })).status).toBe(200);
    const body = texts.sent.at(-1)?.body ?? '';
    expect(body).toMatch(SIGNIN_TEXT);
    expect(unitsOf(body)).toBe(1);
    // D7-25: migration 0110 moved the seeded unit from 75 to 67 characters.
    const unit = await admin.query<{ value: string }>(
      "SELECT value::text AS value FROM control.rates WHERE key = 'sms_unit_size_chars'",
    );
    expect(unit.rows.map((row) => Number(row.value))).toEqual([67]);
    expect(await usageRows(tenantId)).toBe(1);
    expect(await smsMoney(tenantId)).toEqual([]);

    await passCooldown(who.phone);
    expect((await post('/auth/phone/code', { phone: who.phone })).status).toBe(200);
    expect(await usageRows(tenantId)).toBe(1);
    expect(await smsMoney(tenantId)).toEqual([['sms', '-0.55']]);
    const logged = await smsLog(tenantId);
    expect(
      logged.map((row) => [
        row.kind,
        row.status,
        row.units,
        row.cost,
        row.is_essential,
        row.blocked_reason,
      ]),
    ).toEqual([
      ['signin_code', 'sent', 1, '0.00', true, null],
      ['signin_code', 'sent', 1, '0.55', true, null],
    ]);
    for (const row of logged) expect(row.provider_message_id).toMatch(/^capture-\d+$/);
  });

  it('SMS-06: with no allowance left and no balance, no code is made or sent, and the refusal says why', async () => {
    const who = await owner();
    const tenantId = await tenantIdOf(who.slug);
    await allowance(tenantId, 0);
    await passCooldown(who.phone);
    const textsBefore = texts.countFor(who.phone);
    const codesBefore = await admin.query(
      'SELECT 1 FROM control.verification_challenges WHERE destination = $1',
      [who.phone],
    );

    const refused = await post(
      '/auth/phone/code',
      { phone: who.phone },
      { 'accept-language': 'bn' },
    );
    expect(refused.status).toBe(429);
    expect(refused.body).toMatchObject({
      error: {
        code: 'quota_exceeded',
        message: 'শপের ব্যালেন্সে এই কোডের টাকা নেই। পাসওয়ার্ড দিয়ে লগইন করুন বা টপ-আপ করুন।',
      },
    });
    expect(texts.countFor(who.phone)).toBe(textsBefore);
    const codesAfter = await admin.query(
      'SELECT 1 FROM control.verification_challenges WHERE destination = $1',
      [who.phone],
    );
    expect(codesAfter.rowCount).toBe(codesBefore.rowCount);
    expect(await smsMoney(tenantId)).toEqual([]);
    expect(await smsLog(tenantId)).toEqual([
      {
        kind: 'signin_code',
        status: 'blocked',
        units: 1,
        cost: '0.00',
        is_essential: true,
        blocked_reason: 'insufficient_balance',
        provider_message_id: null,
      },
    ]);

    // No code was made, so no resend wait started: a top-up lets the very next ask through.
    await topUp(tenantId, '1.00');
    expect((await post('/auth/phone/code', { phone: who.phone })).status).toBe(200);
    expect(await smsMoney(tenantId)).toEqual([['sms', '-0.55']]);
  });

  it('SMS-06: the balance is never taken below zero for a code', async () => {
    const who = await owner();
    const tenantId = await tenantIdOf(who.slug);
    await allowance(tenantId, 0);
    await topUp(tenantId, '0.50');
    await passCooldown(who.phone);
    expect((await post('/auth/phone/code', { phone: who.phone })).status).toBe(429);
    expect(await smsMoney(tenantId)).toEqual([]);
  });

  it('SMS-08: a charged code that fails to send is given back, and logged as failed', async () => {
    const who = await owner();
    const tenantId = await tenantIdOf(who.slug);
    await allowance(tenantId, 0);
    await topUp(tenantId, '10.00');
    await passCooldown(who.phone);
    texts.down = true;
    try {
      expect((await post('/auth/phone/code', { phone: who.phone })).status).toBe(503);
    } finally {
      texts.down = false;
    }
    expect(await smsMoney(tenantId)).toEqual([
      ['sms', '-0.55'],
      ['reversal', '0.55'],
    ]);
    expect((await smsLog(tenantId)).map((row) => [row.status, row.cost])).toEqual([
      ['failed', '0.00'],
    ]);
  });

  it('SMS-08: a free code that fails to send uses none of the allowance', async () => {
    const who = await owner();
    const tenantId = await tenantIdOf(who.slug);
    await passCooldown(who.phone);
    texts.down = true;
    try {
      expect((await post('/auth/phone/code', { phone: who.phone })).status).toBe(503);
    } finally {
      texts.down = false;
    }
    expect(await usageRows(tenantId)).toBe(0);
  });

  it("AUTH-21: a staff member's sign-in code comes out of their shop's allowance", async () => {
    const who = await owner();
    const tenantId = await tenantIdOf(who.slug);
    const staffPhone = await staffOf(who);
    const before = await usageRows(tenantId);
    expect((await post('/auth/phone/code', { phone: staffPhone })).status).toBe(200);
    expect(await usageRows(tenantId)).toBe(before + 1);
    expect((await smsLog(tenantId)).map((row) => row.kind)).toEqual(['signin_code']);
  });

  it("AUTH-21: a staff member's reset code is their shop's use; the owner's own reset is Lytro's", async () => {
    const who = await owner();
    const tenantId = await tenantIdOf(who.slug);
    const staffPhone = await staffOf(who);

    expect((await post('/auth/forgot-password', { phone: who.phone })).status).toBe(200);
    expect(texts.sent.at(-1)?.toPhone).toBe(who.phone);
    expect(await usageRows(tenantId)).toBe(0);

    expect((await post('/auth/forgot-password', { phone: staffPhone })).status).toBe(200);
    const body = texts.sent.at(-1)?.body ?? '';
    expect(texts.sent.at(-1)?.toPhone).toBe(staffPhone);
    expect(body).toMatch(
      /^Lytro-এ পাসওয়ার্ড রিসেটের জন্য OTP হচ্ছে \d{6}। কারো সাথে শেয়ার করবেন না।$/,
    );
    expect(await usageRows(tenantId)).toBe(1);
    expect((await smsLog(tenantId)).map((row) => row.kind)).toEqual(['staff_reset_code']);
  });

  it("AUTH-17: a staff member's reset the shop can't pay for reads the same as any other", async () => {
    const who = await owner();
    const tenantId = await tenantIdOf(who.slug);
    const staffPhone = await staffOf(who);
    await allowance(tenantId, 0);
    const reply = await post('/auth/forgot-password', { phone: staffPhone });
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 120 });
    expect(texts.countFor(staffPhone)).toBe(0);
    expect((await smsLog(tenantId)).map((row) => row.status)).toEqual(['blocked']);
  });

  it("SMS-07: a shop's SMS log is held to its own rows, as every shop table is", async () => {
    const { rows } = await admin.query<{ forced: boolean; policies: number }>(
      `SELECT c.relforcerowsecurity AS forced,
         (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'tenant' AND p.tablename = 'sms_log') AS policies
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'tenant' AND c.relname = 'sms_log'`,
    );
    expect(rows).toEqual([{ forced: true, policies: 1 }]);
  });
});

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

    // An upgrade starts a new period at its confirmation (UPG-09). The start comes from this process's clock, the
    // one the server reads its `now` from: the database's clock can run a few milliseconds ahead, and a start after
    // the server's now is a period not yet begun, counted from a month earlier.
    await admin.query(`UPDATE control.tenants SET period_start = $2 WHERE id = $1`, [
      tenantId,
      new Date(),
    ]);
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
