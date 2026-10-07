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
import { ActivityLogPurger } from '@lytronix/db';
import { prepareTestDatabase } from './support/database';
import { SmsCapture } from './support/sms-capture';
import { cookieFrom, getJson, type HttpResult, postJson } from './support/http';

// The activity log over real HTTP and the real database (AUD-01 to AUD-08). Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_activity_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const PASSWORD = 'correct-horse-9';
const STAFF_PASSWORD = 'staff-pass-2468';

let app: INestApplication;
let port: number;
let admin: pg.Client;
let activityAdminUrl: string;
const texts = new SmsCapture();

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);
const get = (path: string, headers: Record<string, string> = {}) => getJson(port, path, headers);

const freshSlug = (): string => `a${randomUUID().replace(/-/g, '').slice(0, 10)}`;

interface Owner {
  phone: string;
  slug: string;
  cookie: string;
  csrfToken: string;
}

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
  return { phone, slug, ...session };
}

function shopCall(who: Owner): { cookie: string; 'x-csrf-token': string; host: string } {
  return { cookie: who.cookie, 'x-csrf-token': who.csrfToken, host: `${who.slug}.localhost` };
}

async function moveToPlan(slug: string, planName: string): Promise<void> {
  await admin.query(
    `UPDATE control.tenants SET plan_id = (SELECT id FROM control.plans WHERE name = $1) WHERE slug = $2`,
    [planName, slug],
  );
}

async function activityOf(who: Owner, query = ''): Promise<HttpResult> {
  return get(`/activity${query}`, shopCall(who));
}

interface ActivityEntry {
  action: string;
  actorId: string | null;
  summary: unknown;
  createdAt: string;
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  activityAdminUrl = adminDbUrl;
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'activity-e2e-otp-secret-0123456789abcdefgh';
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

describeIfDatabase('the activity log (AUD-01, AUD-02, AUD-04)', () => {
  it('logs exactly one entry for a sign-in and one for creating a role, with no secret in either', async () => {
    const who = await owner();
    // The onboarding code sign-in happens before the shop exists, so it is never logged (no tenant to scope it
    // to). A password sign-in, once the shop exists, is a real sign_in event.
    const signedIn = await post('/auth/signin', { phone: who.phone, password: PASSWORD }, {});
    expect(signedIn.status).toBe(200);
    const session = {
      cookie: cookieFrom(signedIn),
      'x-csrf-token': (signedIn.body as { csrfToken: string }).csrfToken,
      host: `${who.slug}.localhost`,
    };
    const before = await get('/activity', session);
    const beforeCount = (before.body as { entries: ActivityEntry[] }).entries.length;

    const created = await post('/roles', { name: 'Viewer', permissions: ['staff:read'] }, session);
    expect(created.status).toBe(201);

    const after = await get('/activity', session);
    const entries = (after.body as { entries: ActivityEntry[] }).entries;
    expect(entries.length).toBe(beforeCount + 1); // the role creation; the password sign-in is already counted

    const roleEntries = entries.filter((e) => e.action === 'role_created');
    expect(roleEntries.length).toBe(1);
    const signInEntries = entries.filter((e) => e.action === 'sign_in');
    expect(signInEntries.length).toBe(1);

    expect(JSON.stringify(entries)).not.toContain(PASSWORD);
  });

  it('refuses a staff member without audit:read, and allows one with it', async () => {
    const who = await owner();
    await moveToPlan(who.slug, 'Starter');
    const readerRole = (
      await post('/roles', { name: 'Reader', permissions: ['staff:read'] }, shopCall(who))
    ).body as { id: string };
    const readerPhone = texts.freshPhone();
    await post(
      '/staff',
      { phone: readerPhone, password: STAFF_PASSWORD, roleIds: [readerRole.id] },
      shopCall(who),
    );
    const readerSignIn = await post(
      '/auth/staff/signin',
      { phone: readerPhone, password: STAFF_PASSWORD },
      { host: `${who.slug}.localhost` },
    );
    const readerCall = {
      cookie: cookieFrom(readerSignIn),
      'x-csrf-token': (readerSignIn.body as { csrfToken: string }).csrfToken,
      host: `${who.slug}.localhost`,
    };
    const denied = await get('/activity', readerCall);
    expect(denied.status).toBe(403);

    // A second shop, so the auditor does not compete with the reader for a seat.
    const other = await owner();
    await moveToPlan(other.slug, 'Starter');
    const auditorRole = (
      await post('/roles', { name: 'Auditor', permissions: ['audit:read'] }, shopCall(other))
    ).body as { id: string };
    const auditorPhone = texts.freshPhone();
    const auditorCreated = await post(
      '/staff',
      { phone: auditorPhone, password: STAFF_PASSWORD, roleIds: [auditorRole.id] },
      shopCall(other),
    );
    expect(auditorCreated.status).toBe(201);
    const auditorSignIn = await post(
      '/auth/staff/signin',
      { phone: auditorPhone, password: STAFF_PASSWORD },
      { host: `${other.slug}.localhost` },
    );
    expect(auditorSignIn.status).toBe(200);
    const auditorCall = {
      cookie: cookieFrom(auditorSignIn),
      'x-csrf-token': (auditorSignIn.body as { csrfToken: string }).csrfToken,
      host: `${other.slug}.localhost`,
    };
    const allowed = await get('/activity', auditorCall);
    expect(allowed.status).toBe(200);
  });

  it('never shows one shop the other shop entries', async () => {
    const ours = await owner();
    const theirs = await owner();
    await post('/roles', { name: 'OnlyOurs', permissions: [] }, shopCall(ours));

    const theirView = await activityOf(theirs);
    const names = (theirView.body as { entries: { summary: unknown }[] }).entries.map((e) =>
      JSON.stringify(e.summary),
    );
    expect(names.join(' ')).not.toContain('OnlyOurs');
  });

  it('narrows by action and by actor', async () => {
    const who = await owner();
    await post('/roles', { name: 'FilterA', permissions: [] }, shopCall(who));
    await post('/roles', { name: 'FilterB', permissions: [] }, shopCall(who));

    const byAction = await activityOf(who, '?action=role_created');
    const actionEntries = (byAction.body as { entries: ActivityEntry[] }).entries;
    expect(actionEntries.length).toBe(2);
    expect(actionEntries.every((e) => e.action === 'role_created')).toBe(true);

    const ownerActorId = actionEntries[0]?.actorId;
    expect(ownerActorId).toEqual(expect.any(String));
    const byActor = await activityOf(who, `?actorId=${ownerActorId ?? ''}`);
    const actorEntries = (byActor.body as { entries: ActivityEntry[] }).entries;
    expect(actorEntries.length).toBeGreaterThanOrEqual(2);
  });

  it('pages with a cursor and never repeats or skips an entry', async () => {
    const who = await owner();
    for (let i = 0; i < 4; i += 1) {
      await post('/roles', { name: `Page ${String(i)}`, permissions: [] }, shopCall(who));
    }
    const full = await activityOf(who);
    const all = (full.body as { entries: ActivityEntry[] }).entries;

    const firstPage = await activityOf(who, '?limit=2');
    const firstBody = firstPage.body as { entries: ActivityEntry[]; nextCursor: string };
    expect(firstBody.entries.length).toBe(2);
    expect(firstBody.nextCursor).toEqual(expect.any(String));

    const secondPage = await activityOf(
      who,
      `?limit=2&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
    );
    const secondBody = secondPage.body as { entries: ActivityEntry[] };
    const seen = [...firstBody.entries, ...secondBody.entries].map((e) => e.createdAt + e.action);
    expect(new Set(seen).size).toBe(seen.length); // no repeats
    expect(firstBody.entries.length + secondBody.entries.length).toBeLessThanOrEqual(all.length);
  });

  it('purges entries past the shop plan retention, and keeps a newer one', async () => {
    const who = await owner();
    // Backdated by a direct insert: the table's own trigger refuses UPDATE even for this admin connection
    // (AUD-03), so an old row has to be inserted old, never aged by editing one after the fact.
    await admin.query(
      `INSERT INTO tenant.activity_log (tenant_id, actor_type, actor_id, action, result, summary, created_at)
       VALUES ((SELECT id FROM control.tenants WHERE slug = $1), 'user', NULL, 'role_created', 'success', '{"name":"Old"}', now() - interval '31 days')`,
      [who.slug],
    );
    await post('/roles', { name: 'New', permissions: [] }, shopCall(who));

    await new ActivityLogPurger().run(activityAdminUrl);

    const after = await activityOf(who);
    const summaries = (after.body as { entries: ActivityEntry[] }).entries.map((e) =>
      JSON.stringify(e.summary),
    );
    expect(summaries.join(' ')).not.toContain('"Old"');
    expect(summaries.join(' ')).toContain('"New"');
  });
});
