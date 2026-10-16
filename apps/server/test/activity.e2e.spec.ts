import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { ActivityLogPurger } from '@lytronix/db';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { SmsCapture } from './support/sms-capture';
import { cookieFrom, getJson, type HttpResult, patchJson, postJson } from './support/http';

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
  ip: string | null;
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
  ({ app, port } = await listenOn(moduleRef));
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
    // AUD-02: the sign-in's own source IP, not left null even though it was sitting right there unused.
    expect(signInEntries[0]?.ip).toBeTruthy();

    expect(JSON.stringify(entries)).not.toContain(PASSWORD);
  });

  it('writes exactly one entry for every auditable action, with no secret or full phone (P1-E26)', async () => {
    const who = await owner();
    await moveToPlan(who.slug, 'Starter');
    const staffPhone = texts.freshPhone();

    // sign_in, sign_in_failed
    const signedIn = await post('/auth/signin', { phone: who.phone, password: PASSWORD }, {});
    expect(signedIn.status).toBe(200);
    const session = {
      cookie: cookieFrom(signedIn),
      'x-csrf-token': (signedIn.body as { csrfToken: string }).csrfToken,
      host: `${who.slug}.localhost`,
    };
    expect((await post('/auth/signin', { phone: who.phone, password: 'wrong' }, {})).status).toBe(
      401,
    );

    // staff_created, staff_updated, staff_deactivated, staff_reactivated, password_reset
    const role = (
      await post('/roles', { name: 'Stock', permissions: ['products:manage'] }, session)
    ).body as { id: string };
    const staffCreated = await post(
      '/staff',
      { phone: staffPhone, password: STAFF_PASSWORD, roleIds: [role.id] },
      session,
    );
    expect(staffCreated.status).toBe(201);
    const staffId = (staffCreated.body as { id: string }).id;
    expect((await patchJson(port, `/staff/${staffId}`, { roleIds: [] }, session)).status).toBe(200);
    expect((await patchJson(port, `/staff/${staffId}`, { active: false }, session)).status).toBe(
      200,
    );
    expect((await patchJson(port, `/staff/${staffId}`, { active: true }, session)).status).toBe(
      200,
    );
    expect(
      (await post(`/staff/${staffId}/password`, { newPassword: 'another-pass-13' }, session))
        .status,
    ).toBe(200);

    // role_updated
    expect(
      (await patchJson(port, `/roles/${role.id}`, { name: 'Stock', permissions: [] }, session))
        .status,
    ).toBe(200);

    // password_changed is already covered by owner()'s own initial password-set above (the same action,
    // PasswordService.set logs it identically whether this is the first password or a later change) — not
    // repeated here, since doing so again would double that one count against the "exactly once" assertion.

    // sign_out — last
    expect((await post('/auth/signout', {}, session)).status).toBe(200);

    // Read straight from the table: the session that did everything above just signed itself out, and
    // signing in again to read the log would add one more sign_in entry, skewing the very count being checked.
    const rows = await admin.query<{ action: string; summary: unknown }>(
      `SELECT action, summary FROM tenant.activity_log WHERE tenant_id = (SELECT id FROM control.tenants WHERE slug = $1)`,
      [who.slug],
    );
    const entries = rows.rows;
    const actionCounts = new Map<string, number>();
    for (const entry of entries) {
      actionCounts.set(entry.action, (actionCounts.get(entry.action) ?? 0) + 1);
    }
    for (const action of [
      'sign_in',
      'sign_in_failed',
      'sign_out',
      'password_changed',
      'staff_created',
      'staff_updated',
      'staff_deactivated',
      'staff_reactivated',
      'role_updated',
      'password_reset',
    ]) {
      expect(actionCounts.get(action)).toBe(1);
    }

    const raw = JSON.stringify(entries);
    expect(raw).not.toContain(PASSWORD);
    expect(raw).not.toContain(STAFF_PASSWORD);
    expect(raw).not.toContain('another-pass-13');
    expect(raw).not.toContain(staffPhone); // the full number — only its last 4 digits may appear
    expect(raw).toContain(staffPhone.slice(-4));
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

  it('keeps a money-related entry past plan retention, but purges it past 24 months (AUD-07)', async () => {
    const who = await owner();
    const tenantRow = await admin.query<{ id: string }>(
      'SELECT id FROM control.tenants WHERE slug = $1',
      [who.slug],
    );
    const tenantId = tenantRow.rows[0]?.id;

    // Past the default 30-day plan retention, but well under 24 months -- AUD-07's own floor keeps this one.
    await admin.query(
      `INSERT INTO tenant.activity_log (tenant_id, actor_type, actor_id, action, result, summary, created_at)
       VALUES ($1, 'user', NULL, 'balance_topped_up', 'success', '{"marker":"kept"}', now() - interval '31 days')`,
      [tenantId],
    );
    // A non-money entry the same age is purged exactly as AUD-06 already requires.
    await admin.query(
      `INSERT INTO tenant.activity_log (tenant_id, actor_type, actor_id, action, result, summary, created_at)
       VALUES ($1, 'user', NULL, 'role_created', 'success', '{"marker":"purged-ordinary"}', now() - interval '31 days')`,
      [tenantId],
    );
    // Even a money-related entry is purged once it's past the 24-month floor itself.
    await admin.query(
      `INSERT INTO tenant.activity_log (tenant_id, actor_type, actor_id, action, result, summary, created_at)
       VALUES ($1, 'user', NULL, 'balance_topped_up', 'success', '{"marker":"purged-too-old"}', now() - interval '25 months')`,
      [tenantId],
    );

    await new ActivityLogPurger().run(activityAdminUrl);

    const remaining = await admin.query<{ summary: { marker?: string } | null }>(
      'SELECT summary FROM tenant.activity_log WHERE tenant_id = $1',
      [tenantId],
    );
    const markers = remaining.rows.map((row) => row.summary?.marker).filter(Boolean);
    expect(markers).toContain('kept');
    expect(markers).not.toContain('purged-ordinary');
    expect(markers).not.toContain('purged-too-old');
  });

  it('DWN-11: an active retention floor protects an entry the new, shorter plan would otherwise purge', async () => {
    const who = await owner();
    const tenantRow = await admin.query<{ id: string }>(
      'SELECT id FROM control.tenants WHERE slug = $1',
      [who.slug],
    );
    const tenantId = tenantRow.rows[0]?.id;

    // The tenant's live plan already says 7 days (as if a downgrade just applied), but a still-active
    // 90-day floor (DowngradeService.apply's own write) is what should actually decide this.
    const plan = await admin.query<{ id: string }>(
      `INSERT INTO control.plans (name, rank, for_sale, limits)
       VALUES ('Test Post-Downgrade Plan', 999, false, '{"activity_retention_days": 7}')
       RETURNING id`,
    );
    await admin.query(
      `UPDATE control.tenants SET plan_id = $1, retention_floor_days = 90,
         retention_floor_until = now() + interval '10 days' WHERE id = $2`,
      [plan.rows[0]?.id, tenantId],
    );
    await admin.query(
      `INSERT INTO tenant.activity_log (tenant_id, actor_type, actor_id, action, result, summary, created_at)
       VALUES ($1, 'user', NULL, 'role_created', 'success', '{"marker":"protected-by-floor"}', now() - interval '31 days')`,
      [tenantId],
    );

    await new ActivityLogPurger().run(activityAdminUrl);
    const whileActive = await admin.query<{ summary: { marker?: string } | null }>(
      'SELECT summary FROM tenant.activity_log WHERE tenant_id = $1',
      [tenantId],
    );
    expect(whileActive.rows.map((r) => r.summary?.marker)).toContain('protected-by-floor');

    // The floor has now lapsed (as it would 10 days later) -- the live plan's own 7-day retention applies.
    await admin.query(
      `UPDATE control.tenants SET retention_floor_until = now() - interval '1 day' WHERE id = $1`,
      [tenantId],
    );
    await new ActivityLogPurger().run(activityAdminUrl);
    const afterExpiry = await admin.query<{ summary: { marker?: string } | null }>(
      'SELECT summary FROM tenant.activity_log WHERE tenant_id = $1',
      [tenantId],
    );
    expect(afterExpiry.rows.map((r) => r.summary?.marker)).not.toContain('protected-by-floor');
  });

  it('refuses an UPDATE or DELETE on the activity log, even on the admin connection (AUD-03, P1-E27)', async () => {
    const who = await owner();
    await post('/roles', { name: 'Marked', permissions: [] }, shopCall(who));
    const row = await admin.query<{ id: string }>(
      `SELECT id FROM tenant.activity_log WHERE tenant_id = (SELECT id FROM control.tenants WHERE slug = $1) ORDER BY created_at DESC LIMIT 1`,
      [who.slug],
    );
    const id = row.rows[0]?.id;
    expect(id).toBeDefined();

    await expect(
      admin.query("UPDATE tenant.activity_log SET summary = '{}' WHERE id = $1", [id]),
    ).rejects.toThrow(/insert-only/);
    await expect(
      admin.query('DELETE FROM tenant.activity_log WHERE id = $1', [id]),
    ).rejects.toThrow(/insert-only/);

    const stillThere = await admin.query('SELECT 1 FROM tenant.activity_log WHERE id = $1', [id]);
    expect(stillThere.rowCount).toBe(1);
  });

  it("purges each tenant by its own plan's retention, never by another tenant's (TEN-07, AUD-06, P1-I04)", async () => {
    const shortRetention = await owner();
    const longRetention = await owner();

    const plan = await admin.query<{ id: string }>(
      `INSERT INTO control.plans (name, rank, for_sale, limits)
       VALUES ('Test Short Retention', 999, false, '{"activity_retention_days": 7}')
       RETURNING id`,
    );
    await admin.query('UPDATE control.tenants SET plan_id = $1 WHERE slug = $2', [
      plan.rows[0]?.id,
      shortRetention.slug,
    ]);
    // longRetention keeps its default (trial) plan, whose own retention is unaffected by the row above.

    for (const who of [shortRetention, longRetention]) {
      await admin.query(
        `INSERT INTO tenant.activity_log (tenant_id, actor_type, actor_id, action, result, summary, created_at)
         VALUES ((SELECT id FROM control.tenants WHERE slug = $1), 'user', NULL, 'role_created', 'success', '{"name":"TenMinusDays"}', now() - interval '10 days')`,
        [who.slug],
      );
    }

    await new ActivityLogPurger().run(activityAdminUrl);

    const short = await activityOf(shortRetention);
    const long = await activityOf(longRetention);
    const shortSummaries = (short.body as { entries: ActivityEntry[] }).entries.map((e) =>
      JSON.stringify(e.summary),
    );
    const longSummaries = (long.body as { entries: ActivityEntry[] }).entries.map((e) =>
      JSON.stringify(e.summary),
    );
    // Ten days old is past the 7-day plan's retention, but well within the default 30-day one — each
    // tenant's own setting decided its own entry, with no cross-tenant effect either way.
    expect(shortSummaries.join(' ')).not.toContain('TenMinusDays');
    expect(longSummaries.join(' ')).toContain('TenMinusDays');
  });
});
