import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import {
  cookieFrom,
  getJson,
  patchJson,
  postJson,
  sendExact,
  type HttpResult,
} from './support/http';
import { errorOf, fieldsOf, openShop } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 8 Slice 8.7, read agreed 2026-11-10 (D8-4, D8-68): Lytro's one help line -- WhatsApp, phone and hours -- set in the console and
// read without a session by the dashboard and the website alike. Runs only with DATABASE_TEST_ADMIN_URL.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_help_line_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 60_000 });

const PASSWORD = 'help-line-operator-9';
let app: INestApplication;
let port: number;
let admin: pg.Client;
let operator: Record<string, string> = {};
const texts = new SmsCapture();
// Slice 8.8: Slices 8.6's and 8.7's nine settings, which migration 0128 gives rows.
const NINE_SETTINGS = [
  'help_whatsapp',
  'help_phone',
  'help_opens_hour',
  'help_closes_hour',
  'media_budget_usd',
  'media_budget_alert_percent',
  'media_cost_alert_email',
  'cloudflare_billing_day',
  'cloudflare_prices',
];
// Slice 8.8: the rows the migration gave Slices 8.6's and 8.7's settings, read before any test deletes them.
let seeded: Record<string, unknown> = {};

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'help-line-e2e-otp-secret-0123456789012345678';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const rows = await admin.query<{ key: string; value: unknown }>(
    'SELECT key, value FROM control.platform_settings WHERE key = ANY($1)',
    [NINE_SETTINGS],
  );
  seeded = Object.fromEntries(rows.rows.map((row) => [row.key, row.value]));
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  operator = await operatorHeaders();
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

beforeEach(async () => {
  if (!ADMIN_URL) return;
  await admin.query("DELETE FROM control.platform_settings WHERE key LIKE 'help_%'");
});

async function operatorHeaders(): Promise<Record<string, string>> {
  const email = `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
  await admin.query(
    'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2)',
    [email, await hash(PASSWORD, 12)],
  );
  const signedIn = await postJson(port, '/auth/operator/signin', { email, password: PASSWORD });
  expect(signedIn.status, JSON.stringify(signedIn.body)).toBeLessThan(300);
  const code = await generate({ secret: (signedIn.body as { secret: string }).secret });
  const enrolled = await postJson(port, '/auth/operator/enroll', {
    email,
    password: PASSWORD,
    code,
  });
  return {
    cookie: cookieFrom(enrolled),
    'x-csrf-token': (enrolled.body as { csrfToken: string }).csrfToken,
  };
}

const set = (key: string, value: unknown): Promise<HttpResult> =>
  patchJson(
    port,
    `/operator/settings/${key}`,
    { value, reason: 'The help line changed' },
    operator,
  );

const read = (headers: Record<string, string> = { host: 'localhost' }): Promise<HttpResult> =>
  getJson(port, '/help-line', headers);

describeIfDatabase("Lytro's help line (D8-4, D8-68)", () => {
  it('answers anyone, with no numbers and 9 am to 10 pm until the operator sets them, and may be cached', async () => {
    const answered = await read();
    expect(answered.status, JSON.stringify(answered.body)).toBe(200);
    expect(answered.body).toEqual({ whatsapp: null, phone: null, opensHour: 9, closesHour: 22 });
    expect(answered.headers['cache-control']).toBe('public, max-age=300');
  });

  it('shows what the operator sets, to a signed-in shop as to anyone', async () => {
    expect((await set('help_whatsapp', '01711000001')).status).toBe(200);
    expect((await set('help_phone', '01811000002')).status).toBe(200);
    expect((await set('help_opens_hour', 0)).status).toBe(200);
    expect((await set('help_closes_hour', 23)).status).toBe(200);
    const expected = {
      whatsapp: '01711000001',
      phone: '01811000002',
      opensHour: 0,
      closesHour: 23,
    };
    expect((await read()).body).toEqual(expected);
    const shop = await openShop(port, texts, 'help');
    expect((await read(shop.headers())).body).toEqual(expected);
    const audit = await admin.query<{ summary: Record<string, unknown> }>(
      "SELECT summary FROM control.platform_audit_log WHERE action = 'settings_changed' AND summary->>'key' = 'help_phone' ORDER BY created_at DESC LIMIT 1",
    );
    expect(audit.rows[0]?.summary).toMatchObject({
      newValue: '01811000002',
      reason: 'The help line changed',
    });
  });

  it('answers the listener app on the API host at /v1/listener/help-line, the same line, with no token (D8-74)', async () => {
    expect((await set('help_whatsapp', '01711000001')).status).toBe(200);
    expect((await set('help_closes_hour', 21)).status).toBe(200);
    const asTheApp = await sendExact(port, 'GET', '/v1/listener/help-line', undefined, {
      host: 'api.localhost',
      'x-app-version': '1.0.0',
    });
    expect(asTheApp.status, JSON.stringify(asTheApp.body)).toBe(200);
    // The settings' cache may still hold the last test's other values for a few seconds; these two were just set.
    expect(asTheApp.body).toMatchObject({ whatsapp: '01711000001', closesHour: 21 });
    expect(asTheApp.headers['cache-control']).toBe('public, max-age=300');
    expect(asTheApp.body).toEqual((await read()).body);
    // A public route answers only on the API host (API-14), and the dashboard's own is not served there.
    const offTheApiHost = await getJson(port, '/public/listener/help-line', { host: 'localhost' });
    expect(offTheApiHost.status).toBe(404);
    const dashboardsOnApiHost = await sendExact(port, 'GET', '/v1/help-line', undefined, {
      host: 'api.localhost',
    });
    expect(dashboardsOnApiHost.status).toBe(404);
  });

  it('takes a number only in the local form every page shows, and an hour of a 24-hour clock', async () => {
    for (const value of [
      '+8801711000001',
      '8801711000001',
      '0171100000',
      '01211000001',
      1711000001,
    ]) {
      const refused = await set('help_whatsapp', value);
      expect(refused.status, `help_whatsapp ${String(value)}`).toBe(400);
    }
    for (const value of [24, -1, 9.5, '9']) {
      const refused = await set('help_opens_hour', value);
      expect(refused.status, `help_opens_hour ${String(value)}`).toBe(400);
    }
    expect((await set('help_closes_hour', 24)).status).toBe(400);
    // Read from the table: the settings' cache may still hold the last test's values for a few seconds.
    const stored = await admin.query(
      "SELECT key FROM control.platform_settings WHERE key LIKE 'help_%'",
    );
    expect(stored.rows).toEqual([]);
  });
});

// Phase 8 Slice 8.8 (OPERATOR-CONSOLE-DESIGN §15, D8-76, D8-77): the console's settings page can show and change the help line.
describeIfDatabase('The help line on the console (Slice 8.8)', () => {
  it("has a row for each of Slices 8.6's and 8.7's nine settings, the numbers and the alert's address empty", () => {
    expect(seeded).toEqual({
      help_whatsapp: '',
      help_phone: '',
      help_opens_hour: 9,
      help_closes_hour: 22,
      media_budget_usd: 10,
      media_budget_alert_percent: 80,
      media_cost_alert_email: '',
      cloudflare_billing_day: 1,
      cloudflare_prices: {
        r2ClassAPerMillion: 4.5,
        r2ClassBPerMillion: 0.36,
        r2StoragePerGbMonth: 0.015,
        r2FreeClassAMillions: 1,
        r2FreeClassBMillions: 10,
        r2FreeStorageGbMonths: 10,
        workersMonthly: 5,
        workersIncludedMillions: 10,
        workersPerMillion: 0.3,
      },
    });
  });

  it('clears a number with a reason, which then reads as none, and the other number stays (D8-76)', async () => {
    expect((await set('help_whatsapp', '01711000001')).status).toBe(200);
    expect((await set('help_phone', '01811000002')).status).toBe(200);
    const cleared = await set('help_whatsapp', '');
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
    expect((await read()).body).toMatchObject({ whatsapp: null, phone: '01811000002' });
    const audit = await admin.query<{ summary: Record<string, unknown> }>(
      "SELECT summary FROM control.platform_audit_log WHERE action = 'settings_changed' AND summary->>'key' = 'help_whatsapp' ORDER BY created_at DESC LIMIT 1",
    );
    expect(audit.rows[0]?.summary).toMatchObject({
      oldValue: '01711000001',
      newValue: '',
      reason: 'The help line changed',
    });
    // The alert's address is not a help number: emptying it is still refused.
    expect((await set('media_cost_alert_email', '')).status).toBe(400);
  });

  it('refuses a closing hour at or before the opening hour, whichever is changed (D8-77)', async () => {
    // Against the defaults, 9 and 22.
    for (const [key, value] of [
      ['help_closes_hour', 9],
      ['help_closes_hour', 8],
      ['help_opens_hour', 22],
      ['help_opens_hour', 23],
    ] as const) {
      const refused = await set(key, value);
      expect(refused.status, `${key} ${String(value)}`).toBe(400);
      expect(fieldsOf(refused)).toEqual({ value: 'invalid_format' });
      expect(errorOf(refused).message).toMatch(/closing hour must be after|খোলার সময়ের পরে/);
    }
    // Against stored values.
    expect((await set('help_opens_hour', 10)).status).toBe(200);
    expect((await set('help_closes_hour', 11)).status).toBe(200);
    expect((await set('help_opens_hour', 11)).status).toBe(400);
    expect((await set('help_closes_hour', 10)).status).toBe(400);
    expect((await read()).body).toMatchObject({ opensHour: 10, closesHour: 11 });
  });
});
