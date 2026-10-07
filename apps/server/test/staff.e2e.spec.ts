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
import { SmsCapture } from './support/sms-capture';
import { cookieFrom, getJson, type HttpResult, patchJson, postJson } from './support/http';

// Staff accounts and seats over real HTTP and the real database (STF-01 to STF-05, STF-12, AUTH-19 staff case
// is not covered here). Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_staff_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const PASSWORD = 'correct-horse-9';
const PLATFORM = { host: 'localhost' };

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);
const get = (path: string, headers: Record<string, string> = {}) => getJson(port, path, headers);

const freshSlug = (): string => `s${randomUUID().replace(/-/g, '').slice(0, 10)}`;

interface Owner {
  slug: string;
  cookie: string;
  csrfToken: string;
}

/** An owner with a shop and a password, signed in by code. The shop starts on the Trial plan. */
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
  const set = await post('/auth/password', { newPassword: PASSWORD }, headers);
  expect(set.status).toBe(200);
  return { slug, ...session };
}

/** Shop routes are called on the shop's own host, so the dashboard guard matches the session's shop. */
function shopCall(who: Owner): { cookie: string; 'x-csrf-token': string; host: string } {
  return { cookie: who.cookie, 'x-csrf-token': who.csrfToken, host: `${who.slug}.localhost` };
}

async function moveToPlan(slug: string, planName: string): Promise<void> {
  await admin.query(
    `UPDATE control.tenants
       SET plan_id = (SELECT id FROM control.plans WHERE name = $1)
     WHERE slug = $2`,
    [planName, slug],
  );
}

async function addStaff(who: Owner, phone: string): Promise<HttpResult> {
  return post('/staff', { phone, password: PASSWORD, name: 'Staff' }, shopCall(who));
}

async function listStaff(who: Owner): Promise<HttpResult> {
  return get('/staff', shopCall(who));
}

async function setActive(who: Owner, id: string, active: boolean): Promise<HttpResult> {
  return patchJson(port, `/staff/${id}`, { active }, shopCall(who));
}

/** Failures come back as { error: { code, message, details } }. */
function errorOf(result: HttpResult): unknown {
  return (result.body as { error?: unknown }).error;
}

interface StaffBody {
  id: string;
  active: boolean;
  isOwner: boolean;
  phone: string;
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'staff-e2e-otp-secret-0123456789abcdefgh';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

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
});

describeIfDatabase('staff seats on the Trial plan (STF-02)', () => {
  it('shows the owner as the only seat in use', async () => {
    const who = await owner();
    const response = await listStaff(who);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      seats: { used: 1, total: 1 },
      staff: [{ isOwner: true, active: true }],
    });
  });

  it('refuses a staff member above the seat limit with plan_limit_reached', async () => {
    const who = await owner();
    const response = await addStaff(who, texts.freshPhone());
    expect(response.status).toBe(402);
    expect(errorOf(response)).toMatchObject({ code: 'plan_limit_reached', details: { seats: 1 } });
  });
});

describeIfDatabase('staff on the Starter plan (STF-01, STF-02, STF-03, STF-04)', () => {
  it('creates staff with a normalised phone, then refuses the next one at the limit', async () => {
    const who = await owner();
    await moveToPlan(who.slug, 'Starter');
    const phone = texts.freshPhone();

    const created = await post(
      '/staff',
      { phone: `+88${phone}`, password: PASSWORD, name: 'Rahim' },
      shopCall(who),
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ phone, name: 'Rahim', isOwner: false, active: true });
    expect(JSON.stringify(created.body)).not.toContain(PASSWORD);

    const refused = await addStaff(who, texts.freshPhone());
    expect(refused.status).toBe(402);
    expect(errorOf(refused)).toMatchObject({ code: 'plan_limit_reached', details: { seats: 2 } });

    const list = await listStaff(who);
    expect(list.body).toMatchObject({ seats: { used: 2, total: 2 } });
  });

  it('frees a seat on deactivation and refuses reactivation while the shop is full', async () => {
    const who = await owner();
    await moveToPlan(who.slug, 'Starter');
    const first = await addStaff(who, texts.freshPhone());
    expect(first.status).toBe(201);
    const staffId = (first.body as StaffBody).id;

    const off = await setActive(who, staffId, false);
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ id: staffId, active: false });

    const replacement = await addStaff(who, texts.freshPhone());
    expect(replacement.status).toBe(201);

    const back = await setActive(who, staffId, true);
    expect(back.status).toBe(402);
    expect(errorOf(back)).toMatchObject({ code: 'plan_limit_reached' });
  });

  it('answers conflict for a phone already used in the shop, even by an inactive staff member', async () => {
    const who = await owner();
    await moveToPlan(who.slug, 'Starter');
    const phone = texts.freshPhone();
    const first = await addStaff(who, phone);
    expect(first.status).toBe(201);
    await setActive(who, (first.body as StaffBody).id, false);

    const again = await addStaff(who, phone);
    expect(again.status).toBe(409);
    expect(errorOf(again)).toMatchObject({ code: 'conflict', details: { field: 'phone' } });
  });
});

describeIfDatabase('owner row and unknown staff (STF-12, not_found)', () => {
  it('will not deactivate the owner row', async () => {
    const who = await owner();
    const list = await listStaff(who);
    const ownerRow = (list.body as { staff: StaffBody[] }).staff.find((s) => s.isOwner);
    expect(ownerRow).toBeDefined();
    const response = await setActive(who, ownerRow?.id ?? '', false);
    expect(response.status).toBe(403);
    expect(errorOf(response)).toMatchObject({ code: 'forbidden' });
  });

  it('answers not_found for an id that is not a staff member of the shop', async () => {
    const who = await owner();
    const unknown = await setActive(who, randomUUID(), false);
    expect(unknown.status).toBe(404);
    const malformed = await setActive(who, 'not-an-id', false);
    expect(malformed.status).toBe(404);
  });

  it('answers not_found when another shop tries to change a staff member (TEN-03)', async () => {
    const ours = await owner();
    const theirs = await owner();
    await moveToPlan(ours.slug, 'Starter');
    const created = await addStaff(ours, texts.freshPhone());
    expect(created.status).toBe(201);
    const response = await setActive(theirs, (created.body as StaffBody).id, false);
    expect(response.status).toBe(404);
    const stillActive = await listStaff(ours);
    expect((stillActive.body as { staff: StaffBody[] }).staff.every((s) => s.active)).toBe(true);
  });

  it('refuses staff management without a session', async () => {
    const response = await get('/staff', { host: 'localhost' });
    expect(response.status).toBe(401);
    const platform = await post('/staff', { phone: '01712345678', password: PASSWORD }, PLATFORM);
    expect(platform.status).toBe(401);
  });
});
