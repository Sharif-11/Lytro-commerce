import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { prepareTestDatabase } from './support/database';
import { SmsCapture } from './support/sms-capture';
import { cookieFrom, type HttpResult, postJson } from './support/http';

// Sign-up by phone over real HTTP and the real database (P1-E01 to P1-E04, AUTH-05 to AUTH-11, AUTH-28, TRL-01).
// Runs only when DATABASE_TEST_ADMIN_URL is set, which CI always does.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_signup_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

interface Entered {
  cookie: string;
  csrfToken: string;
  next: string;
  tenantId: string | null;
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);

const wrong = (code: string): string => (code === '000000' ? '111111' : '000000');

/** Requests a code, reads it from the provider log and verifies it. Returns the session the reply opens. */
async function enter(phone: string): Promise<Entered> {
  await post('/auth/phone/code', { phone });
  const response = await post('/auth/phone/verify', { phone, code: texts.codeFor(phone) });
  expect(response.status).toBe(200);
  const body = response.body as { next: string; tenantId: string | null; csrfToken: string };
  return { cookie: cookieFrom(response), ...body };
}

function createShop(entered: Entered, payload: Record<string, unknown>): Promise<HttpResult> {
  return post('/shops', payload, { cookie: entered.cookie, 'x-csrf-token': entered.csrfToken });
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'signup-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  app = moduleRef.createNestApplication();
  await app.listen(0, '127.0.0.1');
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
});

// Every request comes from 127.0.0.1, so failures from one test must not lock the next (AUTH-14).
beforeEach(async () => {
  if (!ADMIN_URL) return;
  await admin.query('DELETE FROM control.sign_in_failures');
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('sign-up by phone, end to end', () => {
  it('sends a six-digit code to a valid number (AUTH-05)', async () => {
    const phone = texts.freshPhone();
    const response = await post('/auth/phone/code', { phone });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 60 });
    expect(texts.codeFor(phone)).toMatch(/^\d{6}$/);
  });

  it('refuses a resend within 60 seconds, with a Retry-After header (AUTH-07)', async () => {
    const phone = texts.freshPhone();
    await post('/auth/phone/code', { phone });
    const response = await post('/auth/phone/code', { phone });
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBeDefined();
    expect(response.body).toMatchObject({ error: { code: 'rate_limited' } });
  });

  it('refuses a number that is not Bangladeshi, with the field named (AUTH-02)', async () => {
    const response = await post('/auth/phone/code', { phone: '+14155550100' });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: 'validation_error', details: { field: 'phone' } },
    });
  });

  it('verifies a new number into a session that goes to create-shop, as an HttpOnly cookie (AUTH-12, D1)', async () => {
    const phone = texts.freshPhone();
    await post('/auth/phone/code', { phone });
    const response = await post('/auth/phone/verify', { phone, code: texts.codeFor(phone) });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ next: 'create-shop', tenantId: null });
    expect(response.body).toHaveProperty('csrfToken');
    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toContain('lytronix_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
  });

  it('creates a trial shop from the session, and texts the live address (AUTH-10, AUTH-28, TRL-01)', async () => {
    const phone = texts.freshPhone();
    const entered = await enter(phone);
    const response = await createShop(entered, {
      ownerName: 'Rahim',
      shopName: 'Fashion House',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      address: 'fashion-house',
      shopUrl: 'http://fashion-house.localhost',
      next: 'set-password',
    });

    const shop = await admin.query<{ state: string; plan: string }>(
      `SELECT t.state::text AS state, p.name AS plan
       FROM control.tenants t JOIN control.plans p ON p.id = t.plan_id
       WHERE t.slug = 'fashion-house'`,
    );
    expect(shop.rows[0]).toEqual({ state: 'trial', plan: 'Trial' });

    const sms = await admin.query<{ body: string }>(
      "SELECT body FROM control.sms_outbox WHERE to_phone = $1 AND kind = 'shop_ready'",
      [phone],
    );
    expect(sms.rows[0]?.body).toContain('http://fashion-house.localhost');
  });

  it('routes a returning number with a shop to the dashboard, and refuses a second shop (AUTH-08, TEN-15)', async () => {
    const phone = texts.freshPhone();
    const first = await enter(phone);
    await createShop(first, { ownerName: 'Karim', shopName: 'First Shop' });

    await admin.query(
      "UPDATE control.verification_challenges SET created_at = now() - interval '2 minutes' WHERE destination = $1",
      [phone],
    );
    const returning = await enter(phone);
    expect(returning).toMatchObject({ next: 'dashboard' });
    expect(returning.tenantId).not.toBeNull();

    const response = await createShop(returning, { ownerName: 'Karim', shopName: 'Second Shop' });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: 'conflict', message: 'This account already has a shop.', details: {} },
    });
  });

  it('suggests the next free address when the name is taken (AUTH-11)', async () => {
    // "fashion-house" is held by the earlier test, so the same name gets a suffix.
    const entered = await enter(texts.freshPhone());
    const response = await createShop(entered, { ownerName: 'Amina', shopName: 'Fashion House' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ address: 'fashion-house-2' });
  });

  it('refuses a typed address that is taken, and offers the next free one', async () => {
    const entered = await enter(texts.freshPhone());
    const response = await createShop(entered, {
      ownerName: 'Amina',
      shopName: 'Other Name',
      address: 'fashion-house',
    });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: { code: 'conflict', details: { field: 'address', suggestion: 'fashion-house-3' } },
    });
  });

  it('refuses shop creation without a session, and without the CSRF token (SEC-14)', async () => {
    const none = await post('/shops', { ownerName: 'Anon', shopName: 'Anon Shop' });
    expect(none.status).toBe(401);
    expect(none.body).toMatchObject({ error: { code: 'unauthenticated' } });

    const entered = await enter(texts.freshPhone());
    const noCsrf = await post(
      '/shops',
      { ownerName: 'Anon', shopName: 'Anon Shop' },
      { cookie: entered.cookie },
    );
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body).toMatchObject({ error: { code: 'forbidden' } });
  });

  it('locks the code after five wrong codes, even when the sixth is correct (AUTH-06)', async () => {
    const phone = texts.freshPhone();
    await post('/auth/phone/code', { phone });
    const correct = texts.codeFor(phone);

    const verifyWith = (code: string) => post('/auth/phone/verify', { phone, code });
    for (let i = 0; i < 4; i += 1) {
      const response = await verifyWith(wrong(correct));
      expect(response.status).toBe(400);
    }
    const fifth = await verifyWith(wrong(correct));
    expect(fifth.status).toBe(429);

    const sixth = await verifyWith(correct);
    expect(sixth.status).toBe(429);

    const newCode = await post('/auth/phone/code', { phone });
    expect(newCode.status).toBe(429);
  });

  it('answers a malformed verify body with the fields named, not a crash', async () => {
    const response = await post('/auth/phone/verify', { phone: texts.freshPhone(), code: 'abc' });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: 'validation_error', details: { fields: expect.any(Array) as unknown } },
    });
  });
});

describeIfDatabase('an SMS outage does not block sign-up (SMS-18)', () => {
  it('creates the shop and keeps the ready message for retry', async () => {
    const phone = texts.freshPhone();
    const entered = await enter(phone);

    texts.down = true;
    let response: HttpResult;
    try {
      response = await createShop(entered, { ownerName: 'Outage', shopName: 'Outage Shop' });
    } finally {
      texts.down = false;
    }

    expect(response.status).toBe(201);
    const row = await admin.query<{ status: string; attempts: number }>(
      "SELECT status, attempts FROM control.sms_outbox WHERE to_phone = $1 AND kind = 'shop_ready'",
      [phone],
    );
    expect(row.rows[0]).toEqual({ status: 'pending', attempts: 1 });
  });
});

describeIfDatabase('an SMS outage on a code request is reported honestly (AUTH-05)', () => {
  it('answers 503 service_unavailable with a retry hint, and never claims a code was sent', async () => {
    const phone = texts.freshPhone();
    texts.down = true;
    let response: HttpResult;
    try {
      response = await post('/auth/phone/code', { phone });
    } finally {
      texts.down = false;
    }

    expect(response.status).toBe(503);
    expect(response.headers['retry-after']).toBe('60');
    expect(response.body).toMatchObject({ error: { code: 'service_unavailable' } });
    const row = await admin.query<{ status: string; body: string | null }>(
      "SELECT status, body FROM control.sms_outbox WHERE to_phone = $1 AND kind = 'otp'",
      [phone],
    );
    expect(row.rows[0]).toEqual({ status: 'failed', body: null });
  });
});
