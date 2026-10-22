import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { dhakaDate } from '../src/common/time';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { LifecycleService } from '../src/modules/billing/services/lifecycle.service';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { SmsCapture } from './support/sms-capture';
import { cookieFrom, postJson, type HttpResult } from './support/http';
import { passFirstSignIn } from './support/shop-client';

// PYG-09: the owner closing a pay-as-you-go shop, and an operator suspending one -- both archive it at once, with
// no grace or read-only stage, and its deletion clock (LIF-18, LIF-19) runs from that moment. Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_shop_close_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const STAFF_PASSWORD = 'staff-horse-9';
const DAY_MS = 24 * 60 * 60 * 1000;

let app: INestApplication;
let port: number;
let admin: pg.Client;
let lifecycle: LifecycleService;
const texts = new SmsCapture();

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);

const freshSlug = (): string => `c${randomUUID().replace(/-/g, '').slice(0, 10)}`;

function errorOf(result: HttpResult): unknown {
  return (result.body as { error?: unknown }).error;
}

interface Owner {
  phone: string;
  slug: string;
  tenantId: string;
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
  const shop = await post(
    '/shops',
    { ownerName: 'Owner', shopName: `Shop ${slug}`, address: slug },
    { cookie: session.cookie, 'x-csrf-token': session.csrfToken },
  );
  expect(shop.status).toBe(201);
  const row = await admin.query<{ id: string }>('SELECT id FROM control.tenants WHERE slug = $1', [
    slug,
  ]);
  return { phone, slug, tenantId: row.rows[0]?.id ?? '', ...session };
}

function shopCall(who: Owner): Record<string, string> {
  return {
    cookie: who.cookie,
    'x-csrf-token': who.csrfToken,
    host: 'localhost',
    'x-lytro-shop': who.slug,
  };
}

/** A staff member holding every permission a role can carry is still not the owner. */
async function staffSession(who: Owner): Promise<Record<string, string>> {
  // A trial has one seat (the owner's); a Starter plan has room to hire.
  await admin.query(
    `UPDATE control.tenants SET plan_id = (SELECT id FROM control.plans WHERE name = 'Starter'), plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Starter')
     WHERE id = $1`,
    [who.tenantId],
  );
  const role = (
    await post(
      '/roles',
      {
        name: `Role ${randomUUID().slice(0, 6)}`,
        permissions: ['payments:manage', 'payments:read'],
      },
      shopCall(who),
    )
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
    { host: 'localhost', 'x-lytro-shop': who.slug },
  );
  expect(signedIn.status).toBe(200);
  await passFirstSignIn(port, signedIn, STAFF_PASSWORD, {
    host: 'localhost',
    'x-lytro-shop': who.slug,
  });
  return {
    cookie: cookieFrom(signedIn),
    'x-csrf-token': (signedIn.body as { csrfToken: string }).csrfToken,
    host: 'localhost',
    'x-lytro-shop': who.slug,
  };
}

/** On pay-as-you-go with recent activity -- so its own idle clock (PYG-21) is far from archiving it. */
async function makePayAsYouGo(tenantId: string): Promise<void> {
  await admin.query(
    `UPDATE control.tenants SET state = 'pay_as_you_go',
       plan_id = (SELECT id FROM control.plans WHERE name = 'Pay-as-you-go'), plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Pay-as-you-go'),
       period_start = now(), period_end = NULL, last_activity_at = now()
     WHERE id = $1`,
    [tenantId],
  );
}

async function tenantRow(tenantId: string) {
  const row = await admin.query<{
    state: string;
    archived_at: Date | null;
    suspended_at: Date | null;
    balance_frozen: boolean;
    period_start: Date | null;
    deleted_at: Date | null;
  }>(
    `SELECT state, archived_at, suspended_at, balance_frozen, period_start, deleted_at
     FROM control.tenants WHERE id = $1`,
    [tenantId],
  );
  return row.rows[0];
}

async function auditEntries(tenantId: string) {
  const log = await admin.query<{ action: string; summary: Record<string, unknown> | null }>(
    'SELECT action, summary FROM tenant.activity_log WHERE tenant_id = $1 ORDER BY created_at ASC',
    [tenantId],
  );
  return log.rows;
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'shop-close-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  lifecycle = app.get(LifecycleService);
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('PYG-09: the owner closes a pay-as-you-go shop', () => {
  it('archives it at once, freezes the balance, and tells the owner the deletion date', async () => {
    const who = await owner();
    await makePayAsYouGo(who.tenantId);

    const closed = await post('/billing/close', {}, shopCall(who));
    expect(closed.status).toBe(201);

    const tenant = await tenantRow(who.tenantId);
    expect(tenant?.state).toBe('archived');
    expect(tenant?.balance_frozen).toBe(true);
    const archivedAt = tenant?.archived_at ?? new Date(0);
    expect(Math.abs(archivedAt.getTime() - Date.now())).toBeLessThan(60_000);
    expect((await auditEntries(who.tenantId)).map((entry) => entry.action)).toContain(
      'shop_closed',
    );

    const sms = await admin.query<{ body: string }>(
      'SELECT body FROM control.sms_outbox WHERE to_phone = $1 ORDER BY created_at DESC LIMIT 1',
      [who.phone],
    );
    const deletionDate = dhakaDate(new Date(archivedAt.getTime() + 60 * DAY_MS));
    expect(sms.rows[0]?.body).toContain(`is closed. Its data will be deleted on ${deletionDate}`);
  });

  it('refuses a staff member, whatever their role, and a shop not on pay-as-you-go', async () => {
    const who = await owner();
    const staff = await staffSession(who);
    await makePayAsYouGo(who.tenantId);

    const byStaff = await post('/billing/close', {}, staff);
    expect(byStaff.status).toBe(403);
    expect(errorOf(byStaff)).toMatchObject({ code: 'forbidden' });
    expect((await tenantRow(who.tenantId))?.state).toBe('pay_as_you_go');

    const onTrial = await owner();
    const refused = await post('/billing/close', {}, shopCall(onTrial));
    expect(refused.status).toBe(409);
    expect(errorOf(refused)).toMatchObject({ code: 'conflict' });
    expect((await tenantRow(onTrial.tenantId))?.state).toBe('trial');
  });

  it('LIF-15: choosing pay-as-you-go reopens a closed shop', async () => {
    const who = await owner();
    await makePayAsYouGo(who.tenantId);
    await post('/billing/close', {}, shopCall(who));

    const reopened = await post('/billing/pay-as-you-go', {}, shopCall(who));
    expect(reopened.status).toBe(201);
    expect(reopened.body).toMatchObject({ effective: 'now' });

    const tenant = await tenantRow(who.tenantId);
    expect(tenant?.state).toBe('pay_as_you_go');
    expect(tenant?.archived_at).toBeNull();
    expect(tenant?.balance_frozen).toBe(false);
  });
});

describeIfDatabase('PYG-09, LIF-18, LIF-19: the deletion clock runs from the closure', () => {
  it('warns at day 45 and deletes at day 60 after closure, whatever the idle clock says', async () => {
    const who = await owner();
    await makePayAsYouGo(who.tenantId);
    await lifecycle.closePayAsYouGo(who.tenantId);

    // Its last activity is today, so an idle-clock count would put archival 30 days ahead -- no warning yet.
    await admin.query(
      `UPDATE control.tenants SET archived_at = now() - interval '45 days' WHERE id = $1`,
      [who.tenantId],
    );
    await lifecycle.runTick(new Date());
    const warnings = (await auditEntries(who.tenantId)).filter(
      (entry) => entry.action === 'deletion_warning_sent',
    );
    expect(warnings.map((entry) => entry.summary?.['day'])).toEqual([45]);
    expect((await tenantRow(who.tenantId))?.deleted_at).toBeNull();

    await admin.query(
      `UPDATE control.tenants SET archived_at = now() - interval '60 days' WHERE id = $1`,
      [who.tenantId],
    );
    await lifecycle.runTick(new Date());
    expect((await tenantRow(who.tenantId))?.deleted_at).not.toBeNull();
  });
});

describeIfDatabase('PYG-09, LIF-24: an operator suspension of a pay-as-you-go shop', () => {
  it('archives it, and restoring puts it back on pay-as-you-go with a fresh idle clock', async () => {
    const who = await owner();
    await makePayAsYouGo(who.tenantId);
    await admin.query(
      `UPDATE control.tenants SET period_start = now() - interval '20 days' WHERE id = $1`,
      [who.tenantId],
    );

    await lifecycle.suspend(who.tenantId, 'chargeback fraud', randomUUID());
    const suspended = await tenantRow(who.tenantId);
    expect(suspended?.state).toBe('archived');
    expect(suspended?.archived_at?.getTime()).toBe(suspended?.suspended_at?.getTime());
    expect(suspended?.balance_frozen).toBe(true);
    expect(
      (await auditEntries(who.tenantId)).find(
        (entry) =>
          entry.action === 'lifecycle_state_changed' && entry.summary?.['reason'] === 'suspended',
      ),
    ).toBeDefined();

    await lifecycle.restore(who.tenantId, randomUUID());
    const restored = await tenantRow(who.tenantId);
    expect(restored?.state).toBe('pay_as_you_go');
    expect(restored?.archived_at).toBeNull();
    expect(restored?.suspended_at).toBeNull();
    expect(restored?.balance_frozen).toBe(false);
    const idleClockStart = restored?.period_start ?? new Date(0);
    expect(Math.abs(idleClockStart.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('a shop its owner had already closed stays archived when the suspension is lifted', async () => {
    const who = await owner();
    await makePayAsYouGo(who.tenantId);
    await lifecycle.closePayAsYouGo(who.tenantId);
    const closedAt = (await tenantRow(who.tenantId))?.archived_at;

    await lifecycle.suspend(who.tenantId, 'chargeback fraud', randomUUID());
    await lifecycle.restore(who.tenantId, randomUUID());

    const tenant = await tenantRow(who.tenantId);
    expect(tenant?.state).toBe('archived');
    expect(tenant?.archived_at?.getTime()).toBe(closedAt?.getTime()); // its deletion clock is unchanged
    expect(tenant?.balance_frozen).toBe(true);
  });

  it('a shop on a plan keeps its state; only the suspension itself applies', async () => {
    const who = await owner();
    await admin.query(
      `UPDATE control.tenants SET state = 'active', period_start = now(),
         period_end = now() + interval '20 days'
       WHERE id = $1`,
      [who.tenantId],
    );

    await lifecycle.suspend(who.tenantId, 'chargeback fraud', randomUUID());
    expect((await tenantRow(who.tenantId))?.state).toBe('active');
    await lifecycle.restore(who.tenantId, randomUUID());
    const tenant = await tenantRow(who.tenantId);
    expect(tenant?.state).toBe('active');
    expect(tenant?.balance_frozen).toBe(false);
  });
});
