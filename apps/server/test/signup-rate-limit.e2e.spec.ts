import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { prepareTestDatabase } from './support/database';
import { SmsCapture } from './support/sms-capture';
import { postJson } from './support/http';

// SUP-08, P1-N01: at most a configured number of new accounts per client IP per hour. The real SRS value
// (10) is too generous to exercise quickly in a test, so this file lowers it via SIGNUP_RATE_LIMIT_PER_IP —
// the limiter's own logic (packages/db's signup_attempts + SignupRateLimiter) is identical to production,
// only the threshold differs. One sequential test: the cap is a cumulative, sliding count against this
// process's one client IP, so separate `it` blocks would each inherit the previous one's count rather than
// starting fresh.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_signup_rate_limit_test';
const CAP = 3;
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

const post = (path: string, payload: unknown) => postJson(port, path, payload);

/** Lets the next code be requested now, as a real owner would wait it out (password.e2e.spec.ts's own pattern). */
async function passCooldown(phone: string): Promise<void> {
  await admin.query(
    "UPDATE control.verification_challenges SET created_at = now() - interval '5 minutes' WHERE destination = $1",
    [phone],
  );
}

async function signUp(phone: string): Promise<number> {
  await post('/auth/phone/code', { phone });
  const response = await post('/auth/phone/verify', { phone, code: texts.codeFor(phone) });
  return response.status;
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'signup-rate-limit-e2e-otp-secret-0123456789';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['SIGNUP_RATE_LIMIT_PER_IP'] = String(CAP);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  app = moduleRef.createNestApplication();
  await app.listen(0, '127.0.0.1');
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
  delete process.env['SIGNUP_RATE_LIMIT_PER_IP'];
});

describeIfDatabase('sign-up is capped per client IP (SUP-08, P1-N01)', () => {
  it('refuses the next new account past the cap, with no limit on a phone that already signed up', async () => {
    const firstPhone = texts.freshPhone();
    expect(await signUp(firstPhone)).toBe(200);
    for (let i = 1; i < CAP; i++) {
      expect(await signUp(texts.freshPhone())).toBe(200);
    }

    const overCap = texts.freshPhone();
    await post('/auth/phone/code', { phone: overCap });
    const refused = await post('/auth/phone/verify', {
      phone: overCap,
      code: texts.codeFor(overCap),
    });
    expect(refused.status).toBe(429);
    expect(refused.headers['retry-after']).toBe(String(60 * 60));
    expect(refused.body).toMatchObject({ error: { code: 'rate_limited' } });

    // The cap counts new accounts only — the very first phone, already a subscriber, signs back in freely,
    // even though the IP is over its new-account cap right now.
    await passCooldown(firstPhone);
    expect(await signUp(firstPhone)).toBe(200);
  });
});
