import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { postJson } from './support/http';
import { SmsCapture } from './support/sms-capture';

// SMS-11, D7-27 (Phase 7 Slice 7.1): one client address may ask for only so many code SMS an hour, across every phone,
// so codes asked for made-up numbers can't run up Lytro's or a shop's SMS bill. Production's value (20) is lowered
// here; the count is the same. One sequential test, since every request comes from this process's one address.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_code_ip_limit_test';
const CAP = 3;
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

const post = (path: string, payload: unknown) => postJson(port, path, payload);

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'code-ip-limit-e2e-otp-secret-0123456789ab';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['CODE_SMS_PER_IP_PER_HOUR'] = String(CAP);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  delete process.env['CODE_SMS_PER_IP_PER_HOUR'];
  await app.close();
  await admin.end();
});

describeIfDatabase('SMS-11: code SMS from one address', () => {
  it('stops at the cap across every phone, says nothing different for a reset, and lets up after an hour', async () => {
    const owner = texts.freshPhone();
    expect((await post('/auth/phone/code', { phone: owner })).status).toBe(200);
    const verified = await post('/auth/phone/verify', { phone: owner, code: texts.codeFor(owner) });
    expect(verified.status).toBe(200);

    for (let index = 1; index < CAP; index += 1) {
      expect((await post('/auth/phone/code', { phone: texts.freshPhone() })).status).toBe(200);
    }
    const sentBefore = texts.sent.length;

    const stopped = await post('/auth/phone/code', { phone: texts.freshPhone() });
    expect(stopped.status).toBe(429);
    expect(stopped.body).toMatchObject({ error: { code: 'rate_limited' } });

    // AUTH-17: a reset past the cap reads as any other, and sends nothing.
    const reset = await post('/auth/forgot-password', { phone: owner });
    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 120 });
    expect(texts.sent.length).toBe(sentBefore);

    // An email code costs nothing and isn't counted.
    expect((await post('/auth/email/code', { email: 'ip-limit@example.com' })).status).toBe(200);

    const asked = await admin.query<{ ip: string | null }>(
      "SELECT host(requested_ip) AS ip FROM control.verification_challenges WHERE channel = 'sms'",
    );
    expect(asked.rows).toHaveLength(CAP);
    expect(asked.rows.every((row) => row.ip !== null)).toBe(true);

    await admin.query(
      "UPDATE control.verification_challenges SET created_at = now() - interval '61 minutes'",
    );
    expect((await post('/auth/phone/code', { phone: texts.freshPhone() })).status).toBe(200);
  });
});
