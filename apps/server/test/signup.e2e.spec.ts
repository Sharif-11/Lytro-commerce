import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { SMS_PROVIDER } from '../src/messaging/tokens';
import { prepareTestDatabase } from './support/database';

// Sign-up by phone over real HTTP and the real database (P1-E01 to P1-E04, AUTH-05 to AUTH-11, TRL-01).
// Runs only when DATABASE_TEST_ADMIN_URL is set, which CI always does.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_signup_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const sent: { toPhone: string; body: string }[] = [];
// Switched on by a test to simulate an SMS provider outage.
let smsDown = false;

function post(path: string, payload: unknown): Promise<HttpResult> {
  const data = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString();
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: text ? (JSON.parse(text) as unknown) : undefined,
          });
        });
      },
    );
    req.on('error', reject);
    req.end(data);
  });
}

/** A fresh Bangladeshi number, so runs never collide. */
const freshPhone = (): string => `0171${randomUUID().replace(/\D/g, '').slice(0, 7)}`;

/** The code most recently texted to a number, read back from the stub outbox as the owner would see it. */
/** The code most recently sent to a number, as the owner received it (the provider log). */
function textedCode(phone: string): Promise<string> {
  const last = [...sent].reverse().find((m) => m.toPhone === phone);
  return Promise.resolve(/(\d{6})/.exec(last?.body ?? '')?.[1] ?? '');
}

const wrong = (code: string): string => (code === '000000' ? '111111' : '000000');

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
    .useValue({
      send: (message: { toPhone: string; body: string }) => {
        if (smsDown) return Promise.reject(new Error('provider down'));
        sent.push(message);
        return Promise.resolve();
      },
    })
    .compile();
  app = moduleRef.createNestApplication();
  await app.listen(0, '127.0.0.1');
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('sign-up by phone, end to end', () => {
  it('sends a six-digit code to a valid number (AUTH-05)', async () => {
    const phone = freshPhone();
    const response = await post('/signup/phone/code', { phone });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 60 });
    expect(await textedCode(phone)).toMatch(/^\d{6}$/);
  });

  it('refuses a resend within 60 seconds, with a Retry-After header (AUTH-07)', async () => {
    const phone = freshPhone();
    await post('/signup/phone/code', { phone });
    const response = await post('/signup/phone/code', { phone });
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBeDefined();
    expect(response.body).toMatchObject({ error: { code: 'rate_limited' } });
  });

  it('refuses a number that is not Bangladeshi, with the field named (AUTH-02)', async () => {
    const response = await post('/signup/phone/code', { phone: '+14155550100' });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: 'validation_error', details: { field: 'phone' } },
    });
  });

  it('creates a trial shop from a correct code, and texts the live address (AUTH-10, TRL-01)', async () => {
    const phone = freshPhone();
    await post('/signup/phone/code', { phone });
    const response = await post('/signup/phone/complete', {
      phone,
      code: await textedCode(phone),
      ownerName: 'Rahim',
      shopName: 'Fashion House',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      address: 'fashion-house',
      shopUrl: 'http://fashion-house.localhost',
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

  it('refuses a second shop for the same number, without saying which numbers exist (AUTH-08)', async () => {
    const phone = freshPhone();
    await post('/signup/phone/code', { phone });
    await post('/signup/phone/complete', {
      phone,
      code: await textedCode(phone),
      ownerName: 'Karim',
      shopName: 'First Shop',
    });

    // The same number asks again; the earlier shop already holds it.
    await admin.query(
      "UPDATE control.verification_challenges SET created_at = now() - interval '2 minutes' WHERE phone = $1",
      [phone],
    );
    await post('/signup/phone/code', { phone });
    const response = await post('/signup/phone/complete', {
      phone,
      code: await textedCode(phone),
      ownerName: 'Karim',
      shopName: 'Second Shop',
    });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: 'conflict', message: 'Sign in to continue.', details: {} },
    });
  });

  it('suggests the next free address when the name is taken (AUTH-11)', async () => {
    // "fashion-house" is held by the earlier test, so the same name gets a suffix.
    const phone = freshPhone();
    await post('/signup/phone/code', { phone });
    const response = await post('/signup/phone/complete', {
      phone,
      code: await textedCode(phone),
      ownerName: 'Amina',
      shopName: 'Fashion House',
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ address: 'fashion-house-2' });
  });

  it('refuses a typed address that is taken, and offers the next free one', async () => {
    const phone = freshPhone();
    await post('/signup/phone/code', { phone });
    const response = await post('/signup/phone/complete', {
      phone,
      code: await textedCode(phone),
      ownerName: 'Amina',
      shopName: 'Other Name',
      address: 'fashion-house',
    });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: { code: 'conflict', details: { field: 'address', suggestion: 'fashion-house-3' } },
    });
  });

  it('locks the code after five wrong codes, even when the sixth is correct (AUTH-06)', async () => {
    const phone = freshPhone();
    await post('/signup/phone/code', { phone });
    const correct = await textedCode(phone);

    const bodyFor = (code: string) => ({ phone, code, ownerName: 'Lock', shopName: 'Lock Shop' });
    for (let i = 0; i < 4; i += 1) {
      const response = await post('/signup/phone/complete', bodyFor(wrong(correct)));
      expect(response.status).toBe(400);
    }
    const fifth = await post('/signup/phone/complete', bodyFor(wrong(correct)));
    expect(fifth.status).toBe(429);

    const sixth = await post('/signup/phone/complete', bodyFor(correct));
    expect(sixth.status).toBe(429);

    const newCode = await post('/signup/phone/code', { phone });
    expect(newCode.status).toBe(429);
  });

  it('answers a malformed sign-up body with the fields named, not a crash', async () => {
    const response = await post('/signup/phone/complete', { phone: freshPhone(), code: 'abc' });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: 'validation_error', details: { fields: expect.any(Array) as unknown } },
    });
  });
});

describeIfDatabase('an SMS outage does not block sign-up (SMS-18)', () => {
  it('creates the shop and keeps the ready message for retry', async () => {
    const phone = freshPhone();
    await post('/signup/phone/code', { phone });
    const code = await textedCode(phone);

    smsDown = true;
    let response: HttpResult;
    try {
      response = await post('/signup/phone/complete', {
        phone,
        code,
        ownerName: 'Outage',
        shopName: 'Outage Shop',
      });
    } finally {
      smsDown = false;
    }

    expect(response.status).toBe(201);
    const row = await admin.query<{ status: string; attempts: number }>(
      "SELECT status, attempts FROM control.sms_outbox WHERE to_phone = $1 AND kind = 'shop_ready'",
      [phone],
    );
    expect(row.rows[0]).toEqual({ status: 'pending', attempts: 1 });
  });
});
