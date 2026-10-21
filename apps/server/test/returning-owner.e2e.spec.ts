import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import { SmsCapture } from './support/sms-capture';
import { cookieFrom, getJson, postJson } from './support/http';

// LIF-20, LIF-21, BIL-13, BAL-18: an owner whose shop was deleted signs in again, is sent to create-shop, and
// opens a new shop on the same account -- the old shop's balance moves in, and its invoices stay the owner's.
// Over real HTTP and the real database; runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_returning_owner_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

const PASSWORD = 'correct-horse-9';
const STAFF_PASSWORD = 'staff-pass-2468';
const PLATFORM = 'localhost';

interface Session {
  cookie: string;
  csrfToken: string;
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);
const get = (path: string, headers: Record<string, string> = {}) => getJson(port, path, headers);

const freshSlug = (): string => `r${randomUUID().replace(/-/g, '').slice(0, 10)}`;
// TEN-31: a dashboard call on the platform host, naming the page's shop when there is one.
const call = (who: Session, shop: string | null = null): Record<string, string> => ({
  cookie: who.cookie,
  'x-csrf-token': who.csrfToken,
  host: PLATFORM,
  ...(shop === null ? {} : { 'x-lytro-shop': shop }),
});

function sessionFrom(response: Awaited<ReturnType<typeof post>>): Session {
  return {
    cookie: cookieFrom(response),
    csrfToken: (response.body as { csrfToken: string }).csrfToken,
  };
}

/** A new owner with a shop and a password; returns the shop's id too. */
async function owner(): Promise<{ phone: string; slug: string; tenantId: string } & Session> {
  const phone = texts.freshPhone();
  const slug = freshSlug();
  await post('/auth/phone/code', { phone });
  const entered = sessionFrom(
    await post('/auth/phone/verify', { phone, code: texts.codeFor(phone) }),
  );
  const shop = await post(
    '/shops',
    { ownerName: 'Owner', shopName: `Shop ${slug}`, address: slug },
    call(entered),
  );
  expect(shop.status).toBe(201);
  expect((await post('/auth/password', { newPassword: PASSWORD }, call(entered))).status).toBe(200);
  return { phone, slug, tenantId: (shop.body as { tenantId: string }).tenantId, ...entered };
}

/** As LIF-19's job leaves a shop: deleted, with its balance frozen and whatever it held still on it. */
async function deleteShop(tenantId: string, balance: string): Promise<void> {
  await seedBalance(admin, tenantId, balance);
  await admin.query(
    `UPDATE control.tenants SET state = 'deleted', deleted_at = now(), balance_frozen = true
       WHERE id = $1`,
    [tenantId],
  );
}

async function seedInvoice(tenantId: string): Promise<string> {
  const row = await admin.query<{ id: string }>(
    `INSERT INTO control.invoices (tenant_id, number, kind, plan_snapshot, amount, billing_term_label)
     VALUES ($1, $2, 'purchase', '{}', '449.00', '1 month') RETURNING id`,
    [tenantId, 9_000_000 + Math.floor(Math.random() * 900_000)],
  );
  return row.rows[0]?.id ?? '';
}

async function carryOvers(
  tenantIds: string[],
): Promise<{ tenant_id: string; amount: string; balance_after: string }[]> {
  const rows = await admin.query<{ tenant_id: string; amount: string; balance_after: string }>(
    `SELECT tenant_id, amount, balance_after FROM tenant.balance_ledger
      WHERE type = 'carry_over' AND tenant_id = ANY($1::uuid[]) ORDER BY id ASC`,
    [tenantIds],
  );
  return rows.rows;
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'returning-owner-e2e-otp-secret-0123456789';
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

describeIfDatabase('an owner whose shop was deleted opens a new one (LIF-21)', () => {
  it('signs in to create-shop, opens a new shop on the same identity, and brings the balance along', async () => {
    const who = await owner();
    await deleteShop(who.tenantId, '250.00');

    const signedIn = await post('/auth/signin', { phone: who.phone, password: PASSWORD });
    expect(signedIn.body).toMatchObject({ next: 'create-shop' });
    const back = sessionFrom(signedIn);

    const slug = freshSlug();
    const shop = await post(
      '/shops',
      { ownerName: 'Owner', shopName: `Shop ${slug}`, address: slug },
      call(back),
    );
    expect(shop.status).toBe(201);
    const newTenantId = (shop.body as { tenantId: string }).tenantId;
    expect(newTenantId).not.toBe(who.tenantId);

    // One entry on each side, each a mirror of the other (BAL-02).
    expect(await carryOvers([who.tenantId, newTenantId])).toEqual([
      { tenant_id: who.tenantId, amount: '-250.00', balance_after: '0.00' },
      { tenant_id: newTenantId, amount: '250.00', balance_after: '250.00' },
    ]);
    const balance = await get('/balance', call(back));
    expect(balance.body).toMatchObject({ amount: '250.00', frozen: false });

    // Still one live shop per account: a second one is refused.
    const again = await post(
      '/shops',
      { ownerName: 'Owner', shopName: `Shop ${freshSlug()}`, address: freshSlug() },
      call(back),
    );
    expect(again.status).toBe(409);
  });

  it('moves nothing when the deleted shop held no balance', async () => {
    const who = await owner();
    await deleteShop(who.tenantId, '0.00');
    const back = sessionFrom(await post('/auth/signin', { phone: who.phone, password: PASSWORD }));
    const slug = freshSlug();
    const shop = await post(
      '/shops',
      { ownerName: 'Owner', shopName: `Shop ${slug}`, address: slug },
      call(back),
    );
    expect(shop.status).toBe(201);
    const newTenantId = (shop.body as { tenantId: string }).tenantId;
    expect(await carryOvers([who.tenantId, newTenantId])).toEqual([]);
  });

  it("lists the earlier shop's invoices to the owner, marked, and never to staff (BIL-13)", async () => {
    const who = await owner();
    const earlierInvoice = await seedInvoice(who.tenantId);
    await deleteShop(who.tenantId, '0.00');
    const back = sessionFrom(await post('/auth/signin', { phone: who.phone, password: PASSWORD }));
    const slug = freshSlug();
    const shop = await post(
      '/shops',
      { ownerName: 'Owner', shopName: `Shop ${slug}`, address: slug },
      call(back),
    );
    const newTenantId = (shop.body as { tenantId: string }).tenantId;
    const ownInvoice = await seedInvoice(newTenantId);

    const listed = await get('/billing/invoices', call(back));
    expect(listed.status).toBe(200);
    const byId = new Map(
      (listed.body as { id: string; earlierShop: boolean }[]).map((invoice) => [
        invoice.id,
        invoice.earlierShop,
      ]),
    );
    expect(byId.get(ownInvoice)).toBe(false);
    expect(byId.get(earlierInvoice)).toBe(true);
    const one = await get(`/billing/invoices/${earlierInvoice}`, call(back));
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ id: earlierInvoice, earlierShop: true });

    // A staff member who may read payments sees only this shop's invoices.
    await admin.query(
      `UPDATE control.tenants SET plan_id = (SELECT id FROM control.plans WHERE name = 'Starter'), plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Starter')
        WHERE id = $1`,
      [newTenantId],
    );
    const role = (
      await post(
        '/roles',
        { name: `Payments ${randomUUID().slice(0, 6)}`, permissions: ['payments:read'] },
        call(back, slug),
      )
    ).body as { id: string };
    const staffPhone = texts.freshPhone();
    const hired = await post(
      '/staff',
      { phone: staffPhone, password: STAFF_PASSWORD, roleIds: [role.id] },
      call(back, slug),
    );
    expect(hired.status).toBe(201);
    const staff = sessionFrom(
      await post(
        '/auth/staff/signin',
        { phone: staffPhone, password: STAFF_PASSWORD },
        { host: PLATFORM },
      ),
    );
    const staffList = await get('/billing/invoices', call(staff, slug));
    expect(staffList.status).toBe(200);
    expect((staffList.body as { id: string }[]).map((invoice) => invoice.id)).toEqual([ownInvoice]);
    expect((await get(`/billing/invoices/${earlierInvoice}`, call(staff, slug))).status).toBe(404);
  });
});
