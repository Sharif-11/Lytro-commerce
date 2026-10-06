import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, getJson, type HttpResult, postJson } from './support/http';

// The dashboard's host rules and lifecycle gate, over real HTTP and the real database
// (TEN-28, TEN-29, AUTH-22, AUTH-23, LIF-06, LIF-11, LIF-24, SEC-14). Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_dashboard_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

const PASSWORD = 'correct-horse-9';
const PLATFORM = { host: 'localhost' };

interface Owner {
  phone: string;
  slug: string;
  cookie: string;
  csrfToken: string;
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const sent: { toPhone: string; body: string }[] = [];

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);
const get = (path: string, headers: Record<string, string> = {}) => getJson(port, path, headers);

const freshPhone = (): string => `0171${randomUUID().replace(/\D/g, '').slice(0, 7)}`;
const freshSlug = (): string => `d${randomUUID().replace(/-/g, '').slice(0, 10)}`;

function textedCode(phone: string): string {
  const last = [...sent].reverse().find((m) => m.toPhone === phone);
  return /(\d{6})/.exec(last?.body ?? '')?.[1] ?? '';
}

async function enterByCode(phone: string): Promise<{ cookie: string; csrfToken: string }> {
  await post('/auth/phone/code', { phone });
  const response = await post('/auth/phone/verify', { phone, code: textedCode(phone) });
  const body = response.body as { csrfToken: string };
  return { cookie: cookieFrom(response), csrfToken: body.csrfToken };
}

/** An owner with a shop on the given address and a password, signed in by code. */
async function owner(): Promise<Owner> {
  const phone = freshPhone();
  const slug = freshSlug();
  const entered = await enterByCode(phone);
  const shop = await post(
    '/shops',
    { ownerName: 'Owner', shopName: `Shop ${slug}`, address: slug },
    { cookie: entered.cookie, 'x-csrf-token': entered.csrfToken },
  );
  expect(shop.status).toBe(201);
  const set = await post(
    '/auth/password',
    { newPassword: PASSWORD },
    { cookie: entered.cookie, 'x-csrf-token': entered.csrfToken },
  );
  expect(set.status).toBe(200);
  return { phone, slug, ...entered };
}

async function signInWithPassword(phone: string): Promise<HttpResult> {
  return post('/auth/signin', { phone, password: PASSWORD });
}

/** Moves a shop to a lifecycle state, as the scheduled job would. */
async function setState(slug: string, state: string): Promise<void> {
  await admin.query('UPDATE control.tenants SET state = $1::control.tenant_state WHERE slug = $2', [
    state,
    slug,
  ]);
}

function withSession(who: { cookie: string }, host: string): Record<string, string> {
  return { cookie: who.cookie, host };
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'dashboard-e2e-otp-secret-0123456789abcdef';
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

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('the dashboard on each host kind (TEN-28, TEN-29)', () => {
  it('gives an owner the account summary on the platform host, with the shop', async () => {
    const who = await owner();
    const response = await get('/me', withSession(who, PLATFORM.host));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      subscriber: { id: expect.any(String) as unknown },
      tenant: { slug: who.slug, state: 'trial', planName: 'Trial' },
    });
  });

  it('gives a session with no shop yet a null tenant on the platform host', async () => {
    const entered = await enterByCode(freshPhone());
    const response = await get('/me', withSession(entered, PLATFORM.host));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ tenant: null });
  });

  it('gives the owner the same summary on the shop subdomain', async () => {
    const who = await owner();
    const response = await get('/me', withSession(who, `${who.slug}.localhost`));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ tenant: { slug: who.slug } });
  });

  it('refuses a session on another shop subdomain (TEN-28)', async () => {
    const mine = await owner();
    const theirs = await owner();
    const response = await get('/me', withSession(mine, `${theirs.slug}.localhost`));
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: 'forbidden' } });
  });

  it('answers an unknown shop subdomain with 404, and a request without a session with 401', async () => {
    const who = await owner();
    expect((await get('/me', withSession(who, `${freshSlug()}.localhost`))).status).toBe(404);
    expect((await get('/me', PLATFORM)).status).toBe(401);
  });

  it('refuses the dashboard to a session that still owes a password (AUTH-19)', async () => {
    const who = await owner();
    await post('/auth/forgot-password', { phone: who.phone });
    const reset = await post('/auth/forgot-password/verify', {
      phone: who.phone,
      code: textedCode(who.phone),
    });
    const pending = { cookie: cookieFrom(reset) };
    const response = await get('/me', withSession(pending, PLATFORM.host));
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { details: { next: 'set-password' } } });
  });
});

describeIfDatabase('the lifecycle gate at sign-in and on the dashboard (AUTH-22, AUTH-23)', () => {
  it('sends an owner of an active shop to the dashboard', async () => {
    const who = await owner();
    await setState(who.slug, 'read_only');
    const response = await signInWithPassword(who.phone);
    expect(response.body).toMatchObject({ next: 'dashboard' });
  });

  it('sends an owner of a locked shop to renewal, and lets them reach the summary (LIF-11)', async () => {
    const who = await owner();
    await setState(who.slug, 'locked');
    const signedIn = await signInWithPassword(who.phone);
    expect(signedIn.body).toMatchObject({ next: 'renewal' });
    const summary = await get('/me', withSession({ cookie: cookieFrom(signedIn) }, PLATFORM.host));
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({ tenant: { state: 'locked' } });
  });

  it('sends an owner of an archived shop to renewal', async () => {
    const who = await owner();
    await setState(who.slug, 'archived');
    expect((await signInWithPassword(who.phone)).body).toMatchObject({ next: 'renewal' });
  });

  it('sends an owner of a deleted shop to the purchase screen, with the account summary (AUTH-23)', async () => {
    const who = await owner();
    await setState(who.slug, 'deleted');
    const signedIn = await signInWithPassword(who.phone);
    expect(signedIn.body).toMatchObject({ next: 'purchase' });
    const summary = await get('/me', withSession({ cookie: cookieFrom(signedIn) }, PLATFORM.host));
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({ tenant: { state: 'deleted' } });
  });

  it('refuses a suspended shop to the dashboard, and sends the owner to the unavailable screen (LIF-24)', async () => {
    const who = await owner();
    await admin.query('UPDATE control.tenants SET suspended_at = now() WHERE slug = $1', [
      who.slug,
    ]);
    const signedIn = await signInWithPassword(who.phone);
    expect(signedIn.body).toMatchObject({ next: 'unavailable' });
    const summary = await get('/me', withSession({ cookie: cookieFrom(signedIn) }, PLATFORM.host));
    expect(summary.status).toBe(403);
    expect(summary.body).toMatchObject({ error: { code: 'tenant_offline' } });
  });
});

describeIfDatabase('session expiry (D1, SEC-07)', () => {
  it('refuses a session after its expiry time', async () => {
    const who = await owner();
    expect((await get('/me', withSession(who, PLATFORM.host))).status).toBe(200);
    await admin.query(
      `UPDATE control.sessions SET expires_at = now() - interval '1 minute'
       WHERE subscriber_id = (SELECT subscriber_id FROM control.subscriber_identities WHERE value = $1)`,
      [who.phone],
    );
    const response = await get('/me', withSession(who, PLATFORM.host));
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'unauthenticated' } });
  });
});
