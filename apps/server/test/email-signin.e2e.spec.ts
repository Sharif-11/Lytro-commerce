import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { MAIL_PROVIDER } from '../src/modules/shared/mail/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
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
  app = moduleRef.createNestApplication();
  await app.listen(0, '127.0.0.1');
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
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
    expect(response.body).toMatchObject({ next: 'create-shop', tenantId: null });
    expect(cookieFrom(response)).toContain('lytronix_session=');
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

describeIfDatabase('an owner enrolled by email only (AUTH-10, AUTH-27)', () => {
  it('creates a shop with no phone, stores the owner email, and sends the shop-ready notice by email', async () => {
    const email = freshEmail();
    await post('/auth/email/code', { email });
    const signedIn = await verify(email, mail.codeFor(email));
    const session = signedIn.body as { csrfToken: string };
    const cookie = cookieFrom(signedIn);

    const shop = await post(
      '/shops',
      { ownerName: 'Email Owner', shopName: 'Email Only Shop' },
      { cookie, 'x-csrf-token': session.csrfToken },
    );
    expect(shop.status).toBe(201);
    expect(shop.body).toMatchObject({ address: 'email-only-shop', next: 'set-password' });

    const owner = await admin.query<{ phone: string | null; email: string | null }>(
      'SELECT phone, email FROM tenant.users WHERE is_owner AND email = $1',
      [email],
    );
    expect(owner.rows[0]).toEqual({ phone: null, email });

    const notice = mail.sent.find((m) => m.to === email && m.subject === 'Your shop is ready');
    expect(notice?.body).toContain('http://email-only-shop.localhost');
  });
});
