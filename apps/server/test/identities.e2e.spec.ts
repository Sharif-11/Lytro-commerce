import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { MAIL_PROVIDER } from '../src/modules/shared/mail/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, deleteJson, getJson, postJson, type HttpResult } from './support/http';
import { MailCapture } from './support/mail-capture';
import { SmsCapture } from './support/sms-capture';

// Adding, listing and removing sign-in methods on an account (AUTH-08, AUTH-26), over real HTTP and the database.
// Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_identities_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const mail = new MailCapture();
const sms = new SmsCapture();
// The account routes are platform-host routes (D13).
const PLATFORM = { host: 'localhost' };

interface Session {
  cookie: string;
  csrfToken: string;
}

async function emailSession(email: string): Promise<Session> {
  await postJson(port, '/auth/email/code', { email });
  const response = await postJson(port, '/auth/email/verify', { email, code: mail.codeFor(email) });
  expect(response.status).toBe(200);
  return {
    cookie: cookieFrom(response),
    csrfToken: (response.body as { csrfToken: string }).csrfToken,
  };
}

async function phoneOnlyAccount(phone: string): Promise<void> {
  await postJson(port, '/auth/phone/code', { phone });
  const response = await postJson(port, '/auth/phone/verify', { phone, code: sms.codeFor(phone) });
  expect(response.status).toBe(200);
}

function freshEmail(): string {
  return `owner.${Math.random().toString(36).slice(2, 10)}@example.com`;
}

function freshPhone(): string {
  return sms.freshPhone();
}

function listIdentities(session: Session): Promise<HttpResult> {
  return getJson(port, '/me/identities', { ...PLATFORM, cookie: session.cookie });
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'identities-e2e-otp-secret-0123456789abcdef';
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

describeIfDatabase('sign-in methods on an account (AUTH-08, AUTH-26)', () => {
  it('lists the one identity an email sign-up created', async () => {
    const email = freshEmail();
    const session = await emailSession(email);
    const response = await listIdentities(session);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ identities: [{ kind: 'email', value: email }] });
  });

  it('refuses to remove the only identity (AUTH-26)', async () => {
    const session = await emailSession(freshEmail());
    const listed = (await listIdentities(session)).body as { identities: { id: string }[] };
    const response = await deleteJson(port, `/me/identities/${listed.identities[0]?.id ?? ''}`, {
      ...PLATFORM,
      cookie: session.cookie,
      'x-csrf-token': session.csrfToken,
    });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: 'conflict' } });
  });

  it('adds a verified phone by code, then removes it again', async () => {
    const session = await emailSession(freshEmail());
    const phone = freshPhone();
    const headers = { ...PLATFORM, cookie: session.cookie, 'x-csrf-token': session.csrfToken };

    expect(
      (await postJson(port, '/me/identities/code', { kind: 'phone', value: phone }, headers))
        .status,
    ).toBe(200);
    const added = await postJson(
      port,
      '/me/identities/verify',
      { kind: 'phone', value: phone, code: sms.codeFor(phone) },
      headers,
    );
    expect(added.status).toBe(200);
    expect(added.body).toEqual({ attached: 'phone' });

    const listed = (await listIdentities(session)).body as {
      identities: { id: string; kind: string }[];
    };
    expect(listed.identities.map((i) => i.kind).sort()).toEqual(['email', 'phone']);

    const phoneId = listed.identities.find((i) => i.kind === 'phone')?.id ?? '';
    expect((await deleteJson(port, `/me/identities/${phoneId}`, headers)).status).toBe(200);
    expect(
      ((await listIdentities(session)).body as { identities: unknown[] }).identities,
    ).toHaveLength(1);
  });

  it('refuses a number that another account already holds', async () => {
    const other = freshPhone();
    await phoneOnlyAccount(other);

    const session = await emailSession(freshEmail());
    const headers = { ...PLATFORM, cookie: session.cookie, 'x-csrf-token': session.csrfToken };
    await admin.query(
      "UPDATE control.verification_challenges SET created_at = now() - interval '5 minutes' WHERE destination = $1",
      [other],
    );
    await postJson(port, '/me/identities/code', { kind: 'phone', value: other }, headers);
    const response = await postJson(
      port,
      '/me/identities/verify',
      { kind: 'phone', value: other, code: sms.codeFor(other) },
      headers,
    );
    expect(response.status).toBe(409);
  });

  it('refuses a wrong code when adding, with the attempts left', async () => {
    const session = await emailSession(freshEmail());
    const phone = freshPhone();
    const headers = { ...PLATFORM, cookie: session.cookie, 'x-csrf-token': session.csrfToken };
    await postJson(port, '/me/identities/code', { kind: 'phone', value: phone }, headers);
    const correct = sms.codeFor(phone);
    const wrong = correct === '000000' ? '111111' : '000000';
    const response = await postJson(
      port,
      '/me/identities/verify',
      { kind: 'phone', value: phone, code: wrong },
      headers,
    );
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { details: { attemptsLeft: 4 } } });
  });

  it('refuses a change without the CSRF token (SEC-14)', async () => {
    const session = await emailSession(freshEmail());
    const response = await postJson(
      port,
      '/me/identities/code',
      { kind: 'phone', value: freshPhone() },
      {
        ...PLATFORM,
        cookie: session.cookie,
      },
    );
    expect(response.status).toBe(403);
  });

  it('refuses to remove an identity that belongs to another account (isolation)', async () => {
    const mine = await emailSession(freshEmail());
    const theirs = await emailSession(freshEmail());
    const theirIdentity =
      ((await listIdentities(theirs)).body as { identities: { id: string }[] }).identities[0]?.id ??
      '';
    const response = await deleteJson(port, `/me/identities/${theirIdentity}`, {
      ...PLATFORM,
      cookie: mine.cookie,
      'x-csrf-token': mine.csrfToken,
    });
    expect(response.status).toBe(404);
  });

  it('answers an unknown identity id with 404', async () => {
    const session = await emailSession(freshEmail());
    const response = await deleteJson(port, '/me/identities/not-a-uuid', {
      cookie: session.cookie,
      'x-csrf-token': session.csrfToken,
    });
    expect(response.status).toBe(404);
  });
});
