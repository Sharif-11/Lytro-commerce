import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { SmsCapture } from './support/sms-capture';
import { cookieFrom, getJson, patchJson, postJson, type HttpResult } from './support/http';

// TEN-30: a tenant's own contact phone/email/business address, over real HTTP and the real database. Runs
// only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_shop_settings_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const STAFF_PASSWORD = 'staff-horse-9';

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);
const get = (path: string, headers: Record<string, string> = {}) => getJson(port, path, headers);
const patch = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  patchJson(port, path, payload, headers);

const freshSlug = (): string => `g${randomUUID().replace(/-/g, '').slice(0, 10)}`;

function errorOf(result: HttpResult): unknown {
  return (result.body as { error?: unknown }).error;
}

interface Owner {
  phone: string;
  slug: string;
  cookie: string;
  csrfToken: string;
}

/** An owner with a fresh shop, signed in by code. Shop settings has no plan dependency, unlike staff seats. */
async function owner(): Promise<Owner> {
  const phone = texts.freshPhone();
  const slug = freshSlug();
  await post('/auth/phone/code', { phone });
  const entered = await post('/auth/phone/verify', { phone, code: texts.codeFor(phone) });
  const session = {
    cookie: cookieFrom(entered),
    csrfToken: (entered.body as { csrfToken: string }).csrfToken,
  };
  const headers = { cookie: session.cookie, 'x-csrf-token': session.csrfToken };
  const shop = await post(
    '/shops',
    { ownerName: 'Owner', shopName: `Shop ${slug}`, address: slug },
    headers,
  );
  expect(shop.status).toBe(201);
  return { phone, slug, ...session };
}

function shopCall(who: Owner): { cookie: string; 'x-csrf-token': string; host: string } {
  return { cookie: who.cookie, 'x-csrf-token': who.csrfToken, host: `${who.slug}.localhost` };
}

/** Trial has one seat (the owner only, STF-02) -- a staff-holding test needs at least Starter's two. */
async function moveToPlan(slug: string, planName: string): Promise<void> {
  await admin.query(
    `UPDATE control.tenants
       SET plan_id = (SELECT id FROM control.plans WHERE name = $1)
     WHERE slug = $2`,
    [planName, slug],
  );
}

/** A staff member holding exactly the given permissions, signed in on the shop host (STF-10/11's own test
    pattern, duplicated here rather than shared -- each e2e spec in this suite keeps its own copy). */
async function viewerSession(who: Owner, permissions: string[]): Promise<Record<string, string>> {
  await moveToPlan(who.slug, 'Starter');
  const role = (
    await post('/roles', { name: `Role ${randomUUID().slice(0, 6)}`, permissions }, shopCall(who))
  ).body as { id: string };
  const phone = texts.freshPhone();
  const hired = await post(
    '/staff',
    { phone, password: STAFF_PASSWORD, roleIds: [role.id] },
    shopCall(who),
  );
  expect(hired.status).toBe(201);
  const signedIn = await post(
    '/auth/staff/signin',
    { phone, password: STAFF_PASSWORD },
    {
      host: `${who.slug}.localhost`,
    },
  );
  expect(signedIn.status).toBe(200);
  return {
    cookie: cookieFrom(signedIn),
    'x-csrf-token': (signedIn.body as { csrfToken: string }).csrfToken,
    host: `${who.slug}.localhost`,
  };
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'shop-settings-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('shop contact settings (TEN-30)', () => {
  it('starts with every field unset, then saves and redisplays all three', async () => {
    const who = await owner();
    const initial = await get('/shop-settings', shopCall(who));
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({
      contactPhone: null,
      contactEmail: null,
      businessAddress: null,
    });

    const updated = await patch(
      '/shop-settings',
      {
        contactPhone: '+8801711111111',
        contactEmail: 'support@example.com',
        businessAddress: '12 Gulshan Avenue, Dhaka',
      },
      shopCall(who),
    );
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      contactPhone: '+8801711111111',
      contactEmail: 'support@example.com',
      businessAddress: '12 Gulshan Avenue, Dhaka',
    });

    const reloaded = await get('/shop-settings', shopCall(who));
    expect(reloaded.body).toMatchObject(updated.body as Record<string, unknown>);
  });

  it('clearing one field with null leaves the other two unchanged', async () => {
    const who = await owner();
    await patch(
      '/shop-settings',
      {
        contactPhone: '+8801711111111',
        contactEmail: 'support@example.com',
        businessAddress: '12 Gulshan Avenue, Dhaka',
      },
      shopCall(who),
    );

    const cleared = await patch('/shop-settings', { contactPhone: null }, shopCall(who));
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({
      contactPhone: null,
      contactEmail: 'support@example.com',
      businessAddress: '12 Gulshan Avenue, Dhaka',
    });
  });

  it('omitting a key from the request leaves it untouched (distinct from sending null)', async () => {
    const who = await owner();
    await patch('/shop-settings', { contactPhone: '+8801711111111' }, shopCall(who));
    const partial = await patch(
      '/shop-settings',
      { contactEmail: 'owner@example.com' },
      shopCall(who),
    );
    expect(partial.status).toBe(200);
    expect(partial.body).toMatchObject({
      contactPhone: '+8801711111111',
      contactEmail: 'owner@example.com',
    });
  });

  it('rejects a malformed email, leaving the stored value unchanged', async () => {
    const who = await owner();
    await patch('/shop-settings', { contactEmail: 'support@example.com' }, shopCall(who));
    const rejected = await patch('/shop-settings', { contactEmail: 'not-an-email' }, shopCall(who));
    expect(rejected.status).toBe(400);
    expect(errorOf(rejected)).toMatchObject({ code: 'validation_error' });

    const unchanged = await get('/shop-settings', shopCall(who));
    expect(unchanged.body).toMatchObject({ contactEmail: 'support@example.com' });
  });

  it('refuses a staff member without settings:manage (STF-10/11)', async () => {
    const who = await owner();
    const noPermission = await viewerSession(who, ['staff:read']);
    const denied = await get('/shop-settings', noPermission);
    expect(denied.status).toBe(403);
    expect(errorOf(denied)).toMatchObject({
      code: 'forbidden',
      details: { permission: 'settings:manage' },
    });
  });

  it('allows a staff member who holds settings:manage (STF-10/11)', async () => {
    const who = await owner();
    const withPermission = await viewerSession(who, ['settings:manage']);
    const allowed = await get('/shop-settings', withPermission);
    expect(allowed.status).toBe(200);
  });

  it('refuses a session carried over to another shop’s host, for both GET and PATCH (TEN-28)', async () => {
    const mine = await owner();
    const theirs = await owner();
    const crossHost = { cookie: mine.cookie, host: `${theirs.slug}.localhost` };

    const read = await get('/shop-settings', crossHost);
    expect(read.status).toBe(403);

    const write = await patch(
      '/shop-settings',
      { contactPhone: '+8801711111111' },
      { ...crossHost, 'x-csrf-token': mine.csrfToken },
    );
    expect(write.status).toBe(403);
  });
});
