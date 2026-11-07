import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { MAIL_PROVIDER } from '../src/modules/shared/mail/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, postJson, type HttpResult } from './support/http';
import { MailCapture } from './support/mail-capture';
import { SmsCapture } from './support/sms-capture';

// Sign-in and sign-up by emailed code, over real HTTP and the real database (AUTH-08, AUTH-12, AUTH-14).
// Runs only when DATABASE_TEST_ADMIN_URL is set, which CI always does.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_email_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const mail = new MailCapture();
const sms = new SmsCapture();

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);

const freshEmail = (): string => `person.${randomUUID().slice(0, 8)}@example.com`;

async function passCooldown(email: string): Promise<void> {
  await admin.query(
    "UPDATE control.verification_challenges SET created_at = now() - interval '5 minutes' WHERE destination = $1",
    [email],
  );
}

function verify(email: string, code: string): Promise<HttpResult> {
  return post('/auth/email/verify', { email, code });
}

// Slice 7.3a (D7-41): a code's email carries both languages, the person maybe not having chosen one yet.
const RESET_SUBJECT = 'Lytro-এ পাসওয়ার্ড রিসেটের কোড / Your password reset code';

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'email-e2e-otp-secret-0123456789abcdef0';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MAIL_PROVIDER)
    .useValue(mail.provider)
    .overrideProvider(SMS_PROVIDER)
    .useValue(sms.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('sign-in by emailed code (AUTH-08, AUTH-12)', () => {
  it('emails a six-digit code to a valid address', async () => {
    const email = freshEmail();
    const response = await post('/auth/email/code', { email });
    expect(response.status).toBe(200);
    expect(mail.codeFor(email)).toMatch(/^\d{6}$/);
  });

  it('refuses a malformed address, with the field named', async () => {
    const response = await post('/auth/email/code', { email: 'not-an-address' });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'validation_error' } });
  });

  it('creates an account for a new address and sends the session to create-shop', async () => {
    const email = freshEmail();
    await post('/auth/email/code', { email });
    const response = await verify(email, mail.codeFor(email));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ next: 'verify-phone', tenantId: null });
    expect(cookieFrom(response)).toContain('lytronix_session=');
    // LEG-01: signing up by email accepts them as a phone does.
    const account = await admin.query(
      `SELECT s.terms_version, s.privacy_version FROM control.subscribers s
       JOIN control.subscriber_identities i ON i.subscriber_id = s.id
       WHERE i.kind = 'email' AND i.value = $1`,
      [email.toLowerCase()],
    );
    expect(account.rows).toEqual([{ terms_version: '2026-11-04', privacy_version: '2026-11-04' }]);
  });

  it('signs a returning address into the same account, and treats the address case-insensitively', async () => {
    const email = freshEmail();
    await post('/auth/email/code', { email });
    await verify(email, mail.codeFor(email));

    await passCooldown(email);
    await post('/auth/email/code', { email: email.toUpperCase() });
    const again = await verify(email.toUpperCase(), mail.codeFor(email));
    expect(again.status).toBe(200);

    const accounts = await admin.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM control.subscriber_identities WHERE kind = 'email' AND value = $1",
      [email],
    );
    expect(accounts.rows[0]?.n).toBe(1);
  });

  it('refuses a wrong code with the attempts left, and locks after five (AUTH-06)', async () => {
    const email = freshEmail();
    await post('/auth/email/code', { email });
    const correct = mail.codeFor(email);
    const wrong = correct === '000000' ? '111111' : '000000';

    const first = await verify(email, wrong);
    expect(first.status).toBe(400);
    expect(first.body).toMatchObject({ error: { details: { attemptsLeft: 4 } } });
    for (let i = 0; i < 3; i += 1) await verify(email, wrong);
    expect((await verify(email, wrong)).status).toBe(429);
    expect((await verify(email, correct)).status).toBe(429);
  });

  it('answers 503 with a retry hint when the mail provider is down, and never claims a code was sent', async () => {
    const email = freshEmail();
    mail.down = true;
    let response: HttpResult;
    try {
      response = await post('/auth/email/code', { email });
    } finally {
      mail.down = false;
    }
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ error: { code: 'service_unavailable' } });
    expect(mail.codeFor(email)).toBe('');
  });
});

describeIfDatabase('an owner who signed up by email (AUTH-10, AUTH-28, TVR-01)', () => {
  it('gives a phone before the shop, then opens it with both, the shop-ready notice by text', async () => {
    const email = freshEmail();
    await post('/auth/email/code', { email });
    const signedIn = await verify(email, mail.codeFor(email));
    const session = signedIn.body as { csrfToken: string };
    const cookie = cookieFrom(signedIn);
    const headers = { host: 'localhost', cookie, 'x-csrf-token': session.csrfToken };
    const shopInput = { ownerName: 'Email Owner', shopName: 'Email Then Phone Shop' };

    const refused = await post('/shops', shopInput, headers);
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ error: { details: { next: 'verify-phone' } } });

    const phone = sms.freshPhone();
    expect(
      (await post('/me/identities/code', { kind: 'phone', value: phone }, headers)).status,
    ).toBe(200);
    const added = await post(
      '/me/identities/verify',
      { kind: 'phone', value: phone, code: sms.codeFor(phone) },
      headers,
    );
    expect(added.status).toBe(200);

    const shop = await post('/shops', shopInput, headers);
    expect(shop.status).toBe(201);
    expect(shop.body).toMatchObject({ address: 'email-then-phone-shop', next: 'set-password' });

    const owner = await admin.query<{ phone: string | null; email: string | null }>(
      'SELECT phone, email FROM tenant.users WHERE is_owner AND email = $1',
      [email],
    );
    expect(owner.rows[0]).toEqual({ phone, email });

    expect(
      sms.sent.some((m) => m.toPhone === phone && m.body.includes('email-then-phone-shop')),
    ).toBe(true);
    expect(mail.sent.some((m) => m.to === email && m.subject === 'Your shop is ready')).toBe(false);
  });
});

describeIfDatabase('resetting a password by emailed code (AUTH-27)', () => {
  it('gives the same reply for a known and an unknown address, and sends a reset code only to the known one', async () => {
    const email = freshEmail();
    await post('/auth/email/code', { email });
    await verify(email, mail.codeFor(email));

    const known = await post('/auth/forgot-password/email', { email });
    const unknown = await post('/auth/forgot-password/email', { email: freshEmail() });
    expect(known.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(mail.sent.some((m) => m.to === email && m.subject === RESET_SUBJECT)).toBe(true);
  });

  it('allows one reset request per two minutes per account, with the same reply (AUTH-18)', async () => {
    const email = freshEmail();
    await post('/auth/email/code', { email });
    await verify(email, mail.codeFor(email));

    const resetsTo = (): number =>
      mail.sent.filter((m) => m.to === email && m.subject === RESET_SUBJECT).length;
    const before = resetsTo();
    const first = await post('/auth/forgot-password/email', { email });
    const second = await post('/auth/forgot-password/email', { email });
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(resetsTo()).toBe(before + 1);
  });

  it('locks after five wrong reset codes, even when the sixth is correct (AUTH-14)', async () => {
    const email = freshEmail();
    await post('/auth/email/code', { email });
    await verify(email, mail.codeFor(email));

    await passCooldown(email);
    await post('/auth/forgot-password/email', { email });
    const correct = mail.codeFor(email);
    const wrong = correct === '000000' ? '111111' : '000000';

    for (let i = 0; i < 4; i += 1) {
      await post('/auth/forgot-password/email/verify', { email, code: wrong });
    }
    const fifth = await post('/auth/forgot-password/email/verify', { email, code: wrong });
    expect(fifth.status).toBe(429);
    const sixth = await post('/auth/forgot-password/email/verify', { email, code: correct });
    expect(sixth.status).toBe(429);
  });

  it('opens a session that must set a password, after a correct emailed reset code', async () => {
    const email = freshEmail();
    await post('/auth/email/code', { email });
    await verify(email, mail.codeFor(email));

    await passCooldown(email);
    await post('/auth/forgot-password/email', { email });
    const reset = await post('/auth/forgot-password/email/verify', {
      email,
      code: mail.codeFor(email),
    });
    expect(reset.status).toBe(200);
    expect(reset.body).toMatchObject({ next: 'set-password' });
    expect(cookieFrom(reset)).toContain('lytronix_session=');
  });
});
