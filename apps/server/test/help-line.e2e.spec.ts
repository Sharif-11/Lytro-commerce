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
import { cookieFrom, getJson, patchJson, postJson, type HttpResult } from './support/http';
import { openShop } from './support/shop-client';
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

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'help-line-e2e-otp-secret-0123456789012345678';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
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
