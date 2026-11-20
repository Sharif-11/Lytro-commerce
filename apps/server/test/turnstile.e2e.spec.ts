import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { BREAKER_FAILURES } from '../src/common/circuit-breaker';
import { TURNSTILE_TEST_SECRETS } from '../src/config/turnstile';
import { STRICT_ADDRESS_LIMITS } from '../src/modules/identity/address-limits';
import { SITEVERIFY_URL } from '../src/modules/identity/services/human-check';
import { TURNSTILE_FETCH } from '../src/modules/identity/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { postJson } from './support/http';
import { SmsCapture } from './support/sms-capture';

// SUP-08, SMS-11, AUTH-09 as amended 2026-11-20 (the owner's "Raise them + bot check"): with the widget's secret set,
// every dashboard request that texts a code carries a Turnstile token Cloudflare passes, or is refused and texts
// nothing; while Cloudflare can't say, it goes on under the strict per-address limit. The server runs with Cloudflare's
// always-passes test secret, and Siteverify answers as it answers the test secrets (seen live on 2026-11-20), or not at
// all. One sequential suite: every request comes from this process's one address.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_turnstile_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

type Mode = 'passes' | 'fails' | 'spent' | 'down';

/** Cloudflare's Siteverify as it answers the test secrets, and what it was asked. */
class FakeSiteverify {
  mode: Mode = 'passes';
  asked: URLSearchParams[] = [];

  readonly send = ((url: string, init: RequestInit) => {
    if (url !== SITEVERIFY_URL) return Promise.reject(new Error(`unexpected ${url}`));
    this.asked.push(new URLSearchParams(init.body as URLSearchParams));
    const testing = { metadata: { result_with_testing_key: true } };
    switch (this.mode) {
      case 'passes':
        return Promise.resolve(
          Response.json({ success: true, 'error-codes': [], hostname: 'example.com', ...testing }),
        );
      case 'fails':
        return Promise.resolve(
          Response.json({ success: false, 'error-codes': ['invalid-input-response'], ...testing }),
        );
      case 'spent':
        return Promise.resolve(
          Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'], ...testing }),
        );
      case 'down':
        return Promise.reject(new TypeError('fetch failed'));
    }
  }) as unknown as typeof fetch;
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const siteverify = new FakeSiteverify();

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'turnstile-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['TURNSTILE_SECRET_KEY'] = TURNSTILE_TEST_SECRETS.passes;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(TURNSTILE_FETCH)
    .useValue(siteverify.send)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  delete process.env['TURNSTILE_SECRET_KEY'];
  await app.close();
  await admin.end();
});

beforeEach(async () => {
  if (!ADMIN_URL) return;
  siteverify.mode = 'passes';
  // Each test starts with this address's last hour empty.
  await admin.query(
    "UPDATE control.verification_challenges SET created_at = now() - interval '2 hours'",
  );
});

describeIfDatabase('the bot check on code SMS (Turnstile)', () => {
  it('texts a sign-in code and a reset code for a token Cloudflare passes, sending it the secret and the token', async () => {
    const phone = texts.freshPhone();
    const signin = await post('/auth/phone/code', { phone, turnstileToken: TOKEN });
    expect(signin.status).toBe(200);
    expect(texts.countFor(phone)).toBe(1);
    const asked = siteverify.asked.at(-1);
    expect(asked?.get('secret')).toBe(TURNSTILE_TEST_SECRETS.passes);
    expect(asked?.get('response')).toBe(TOKEN);
    expect(asked?.get('remoteip')).not.toBeNull();

    // Signed up, the phone can ask for a reset and a resend, each with a token of its own.
    expect((await post('/auth/phone/verify', { phone, code: texts.codeFor(phone) })).status).toBe(
      200,
    );
    expect((await post('/auth/forgot-password', { phone, turnstileToken: TOKEN })).status).toBe(
      200,
    );
    expect(texts.countFor(phone)).toBe(2);
    await admin.query(
      "UPDATE control.verification_challenges SET created_at = now() - interval '2 hours'",
    );
    expect(
      (await post('/auth/forgot-password/resend', { phone, turnstileToken: TOKEN })).status,
    ).toBe(200);
    expect(texts.countFor(phone)).toBe(3);
  });

  it('refuses a request with no token, or one Cloudflare fails or has seen, in Bangla and English, and texts nothing', async () => {
    const phone = texts.freshPhone();
    const asksBefore = siteverify.asked.length;
    const none = await post('/auth/phone/code', { phone }, { 'accept-language': 'bn' });
    expect(none.status).toBe(403);
    expect(none.body).toMatchObject({
      error: {
        code: 'forbidden',
        message: 'একজন মানুষ চাইছেন কিনা নিশ্চিত হওয়া যায়নি। পেজটা রিলোড করে আবার ট্রাই করুন।',
      },
    });
    // No token, no call.
    expect(siteverify.asked.length).toBe(asksBefore);

    siteverify.mode = 'fails';
    const failed = await post(
      '/auth/forgot-password',
      { phone, turnstileToken: TOKEN },
      { 'accept-language': 'en' },
    );
    expect(failed.status).toBe(403);
    expect(failed.body).toMatchObject({
      error: {
        code: 'forbidden',
        message: "We couldn't confirm a person is asking. Reload the page and try again.",
      },
    });

    siteverify.mode = 'spent';
    for (const path of ['/auth/phone/code', '/auth/forgot-password/resend']) {
      const spent = await post(path, { phone, turnstileToken: TOKEN });
      expect(spent.status).toBe(403);
    }
    expect(texts.countFor(phone)).toBe(0);
    const stored = await admin.query(
      'SELECT 1 FROM control.verification_challenges WHERE destination = $1',
      [phone],
    );
    expect(stored.rows).toHaveLength(0);
  });

  it("while Cloudflare can't say, texts the code under the strict per-address limit, and its circuit opens", async () => {
    siteverify.mode = 'down';
    const asksBefore = siteverify.asked.length;
    const cap = STRICT_ADDRESS_LIMITS.codeSmsPerHour;
    for (let index = 0; index < cap; index += 1) {
      expect(
        (await post('/auth/phone/code', { phone: texts.freshPhone(), turnstileToken: TOKEN }))
          .status,
      ).toBe(200);
    }
    const stopped = await post('/auth/phone/code', {
      phone: texts.freshPhone(),
      turnstileToken: TOKEN,
    });
    expect(stopped.status).toBe(429);
    expect(stopped.body).toMatchObject({ error: { code: 'rate_limited' } });
    // PRF-05: five failures in a row open the circuit, and no call is made while it is open.
    expect(siteverify.asked.length - asksBefore).toBe(BREAKER_FAILURES);
  });
});
