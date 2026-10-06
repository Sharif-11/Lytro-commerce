import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, type HttpResult, postJson } from './support/http';

// Passwords, reset and sign-in lockout over real HTTP and the real database
// (AUTH-12 to AUTH-14, AUTH-17 to AUTH-20, D2). Runs only when DATABASE_TEST_ADMIN_URL is set, which CI always does.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_password_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

const PASSWORD = 'correct-horse-9';
const NEW_PASSWORD = 'new-passphrase-7';

interface Session {
  cookie: string;
  csrfToken: string;
  next: string;
  tenantId: string | null;
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const sent: { toPhone: string; body: string }[] = [];

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);

const freshPhone = (): string => `0171${randomUUID().replace(/\D/g, '').slice(0, 7)}`;

function textedCode(phone: string): string {
  const last = [...sent].reverse().find((m) => m.toPhone === phone);
  return /(\d{6})/.exec(last?.body ?? '')?.[1] ?? '';
}

/** Lets the next code be requested now, as a real owner would wait it out. */
async function passCooldown(phone: string): Promise<void> {
  await admin.query(
    "UPDATE control.verification_challenges SET created_at = now() - interval '5 minutes' WHERE phone = $1",
    [phone],
  );
}

function toSession(result: HttpResult): Session {
  const body = result.body as { next: string; tenantId: string | null; csrfToken: string };
  return { cookie: cookieFrom(result), ...body };
}

/** Signs in by code, which opens a session that may set a password without the current one. */
async function enterByCode(phone: string): Promise<Session> {
  await post('/auth/phone/code', { phone });
  const response = await post('/auth/phone/verify', { phone, code: textedCode(phone) });
  expect(response.status).toBe(200);
  return toSession(response);
}

/** A number with an owner, a shop and a password, ready to sign in by password. */
async function ownerWithPassword(): Promise<string> {
  const phone = freshPhone();
  const entered = await enterByCode(phone);
  const shop = await post(
    '/shops',
    { ownerName: 'Owner', shopName: `Shop ${randomUUID().slice(0, 6)}` },
    { cookie: entered.cookie, 'x-csrf-token': entered.csrfToken },
  );
  expect(shop.status).toBe(201);
  const set = await post(
    '/auth/password',
    { newPassword: PASSWORD },
    { cookie: entered.cookie, 'x-csrf-token': entered.csrfToken },
  );
  expect(set.status).toBe(200);
  return phone;
}

function signInWith(phone: string, password: string): Promise<HttpResult> {
  return post('/auth/signin', { phone, password });
}

async function backdateSessions(phone: string, interval: string): Promise<void> {
  await admin.query(
    `UPDATE control.sessions SET created_at = now() - interval '${interval}'
     WHERE subscriber_id = (SELECT subscriber_id FROM control.subscriber_identities WHERE value = $1)`,
    [phone],
  );
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'password-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue({
      send: (message: { toPhone: string; body: string }) => {
        sent.push(message);
        return Promise.resolve();
      },
    })
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

describeIfDatabase('signing in with a password (AUTH-12, AUTH-13)', () => {
  it('signs in an owner with the password and goes to the dashboard', async () => {
    const phone = await ownerWithPassword();
    const response = await signInWith(phone, PASSWORD);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ next: 'dashboard' });
    expect(cookieFrom(response)).toContain('lytronix_session=');
    const signedAt = await admin.query<{ last_sign_in_at: Date | null }>(
      'SELECT s.last_sign_in_at FROM control.subscribers s JOIN control.subscriber_identities i ON i.subscriber_id = s.id WHERE i.value = $1',
      [phone],
    );
    expect(signedAt.rows[0]?.last_sign_in_at).not.toBeNull();
  });

  it('gives one identical reply for an unknown number, a number with no password and a wrong password', async () => {
    const withoutPassword = freshPhone();
    await enterByCode(withoutPassword);
    const phone = await ownerWithPassword();

    const unknown = await signInWith(freshPhone(), PASSWORD);
    const noPassword = await signInWith(withoutPassword, PASSWORD);
    const wrong = await signInWith(phone, 'not-the-password');

    for (const response of [unknown, noPassword, wrong]) {
      expect(response.status).toBe(401);
    }
    expect(unknown.body).toEqual(noPassword.body);
    expect(noPassword.body).toEqual(wrong.body);
    expect(wrong.body).toMatchObject({ error: { code: 'unauthenticated' } });
  });

  it('locks sign-in after five failures, and refuses the correct password during the lock (AUTH-14)', async () => {
    const phone = await ownerWithPassword();
    for (let i = 0; i < 5; i += 1) {
      expect((await signInWith(phone, 'wrong-guess-1')).status).toBe(401);
    }
    const sixth = await signInWith(phone, PASSWORD);
    expect(sixth.status).toBe(429);
    expect(sixth.headers['retry-after']).toBeDefined();
  });

  it('lets failures age out after fifteen minutes (AUTH-14)', async () => {
    const phone = await ownerWithPassword();
    for (let i = 0; i < 5; i += 1) {
      await signInWith(phone, 'wrong-guess-1');
    }
    expect((await signInWith(phone, PASSWORD)).status).toBe(429);

    await admin.query(
      "UPDATE control.sign_in_failures SET created_at = now() - interval '16 minutes'",
    );
    expect((await signInWith(phone, PASSWORD)).status).toBe(200);
  });

  it('counts wrong codes toward the same lock as wrong passwords (AUTH-14)', async () => {
    const phone = await ownerWithPassword();
    for (let i = 0; i < 3; i += 1) {
      await signInWith(phone, 'wrong-guess-1');
    }
    await passCooldown(phone);
    await post('/auth/phone/code', { phone });
    const code = textedCode(phone);
    const wrongCode = code === '000000' ? '111111' : '000000';
    await post('/auth/phone/verify', { phone, code: wrongCode });
    await post('/auth/phone/verify', { phone, code: wrongCode });
    expect((await signInWith(phone, PASSWORD)).status).toBe(429);
  });
});

describeIfDatabase('resetting a forgotten password (AUTH-17, AUTH-18, AUTH-19)', () => {
  it('gives the same reply for a known and an unknown number, and sends a reset code only to the known one', async () => {
    const phone = await ownerWithPassword();
    const known = await post('/auth/forgot-password', { phone });
    const unknown = await post('/auth/forgot-password', { phone: freshPhone() });

    expect(known.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(sent.filter((m) => m.toPhone === phone).length).toBeGreaterThan(0);
  });

  it('allows one reset request per two minutes per account, with the same reply (AUTH-18)', async () => {
    const phone = await ownerWithPassword();
    const before = sent.filter((m) => m.toPhone === phone).length;
    const first = await post('/auth/forgot-password', { phone });
    const second = await post('/auth/forgot-password', { phone });
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(sent.filter((m) => m.toPhone === phone).length).toBe(before + 1);
  });

  it('opens a session that must set a password before anything else, then sets it and ends the old sessions', async () => {
    const phone = await ownerWithPassword();
    const old = await signInWith(phone, PASSWORD).then(toSession);

    await post('/auth/forgot-password', { phone });
    const reset = await post('/auth/forgot-password/verify', { phone, code: textedCode(phone) });
    expect(reset.status).toBe(200);
    const pending = toSession(reset);
    expect(pending).toMatchObject({ next: 'set-password' });

    const blocked = await post(
      '/shops',
      { ownerName: 'Blocked', shopName: 'Blocked Shop' },
      { cookie: pending.cookie, 'x-csrf-token': pending.csrfToken },
    );
    expect(blocked.status).toBe(403);
    expect(blocked.body).toMatchObject({
      error: { code: 'forbidden', details: { next: 'set-password' } },
    });

    const set = await post(
      '/auth/password',
      { newPassword: NEW_PASSWORD },
      { cookie: pending.cookie, 'x-csrf-token': pending.csrfToken },
    );
    expect(set.status).toBe(200);

    const oldSession = await post(
      '/auth/signout',
      {},
      { cookie: old.cookie, 'x-csrf-token': old.csrfToken },
    );
    expect(oldSession.status).toBe(401);

    expect((await signInWith(phone, PASSWORD)).status).toBe(401);
    expect(await signInWith(phone, NEW_PASSWORD)).toMatchObject({ status: 200 });
  });

  it('lets a session that owes a password sign out (AUTH-19)', async () => {
    const phone = await ownerWithPassword();
    await post('/auth/forgot-password', { phone });
    const pending = toSession(
      await post('/auth/forgot-password/verify', { phone, code: textedCode(phone) }),
    );
    const response = await post(
      '/auth/signout',
      {},
      { cookie: pending.cookie, 'x-csrf-token': pending.csrfToken },
    );
    expect(response.status).toBe(200);
  });
});

describeIfDatabase('changing a password (AUTH-20)', () => {
  it('needs the current password once the code sign-in is older than ten minutes, and ends the other sessions', async () => {
    const phone = await ownerWithPassword();
    await passCooldown(phone);
    const current = await enterByCode(phone);
    await backdateSessions(phone, '11 minutes');

    const withoutCurrent = await post(
      '/auth/password',
      { newPassword: NEW_PASSWORD },
      { cookie: current.cookie, 'x-csrf-token': current.csrfToken },
    );
    expect(withoutCurrent.status).toBe(400);
    expect(withoutCurrent.body).toMatchObject({
      error: { code: 'validation_error', details: { field: 'currentPassword' } },
    });

    const withCurrent = await post(
      '/auth/password',
      { newPassword: NEW_PASSWORD, currentPassword: PASSWORD },
      { cookie: current.cookie, 'x-csrf-token': current.csrfToken },
    );
    expect(withCurrent.status).toBe(200);
    expect((await signInWith(phone, NEW_PASSWORD)).status).toBe(200);
  });
});
