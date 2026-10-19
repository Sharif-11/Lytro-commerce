import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DASHBOARD_PATHS } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { SmsCapture } from './support/sms-capture';
import { cookieFrom, getJson, patchJson, postJson } from './support/http';

// Phase 3 Slice 0: the one dashboard address (TEN-31), its cookie and Origin rules (TEN-29), and the dashboard's own
// page names kept out of shop slugs (TEN-26). Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_dashboard_address_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const DASHBOARD_ORIGIN = 'https://app.localhost';

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

const post = (route: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, route, payload, headers);

interface Owner {
  slug: string;
  cookie: string;
  csrfToken: string;
}

async function owner(): Promise<Owner> {
  const phone = texts.freshPhone();
  const slug = `d${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  await post('/auth/phone/code', { phone });
  const entered = await post('/auth/phone/verify', { phone, code: texts.codeFor(phone) });
  const session = {
    cookie: cookieFrom(entered),
    csrfToken: (entered.body as { csrfToken: string }).csrfToken,
  };
  const shop = await post(
    '/shops',
    { ownerName: 'Owner', shopName: `Shop ${slug}`, address: slug },
    { cookie: session.cookie, 'x-csrf-token': session.csrfToken, host: 'localhost' },
  );
  expect(shop.status).toBe(201);
  return { slug, ...session };
}

function onShop(who: Owner, extra: Record<string, string> = {}): Record<string, string> {
  return {
    cookie: who.cookie,
    'x-csrf-token': who.csrfToken,
    host: 'localhost',
    'x-lytro-shop': who.slug,
    ...extra,
  };
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'dashboard-address-e2e-otp-secret-0123456789';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['DASHBOARD_ORIGIN'] = DASHBOARD_ORIGIN;

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
  delete process.env['DASHBOARD_ORIGIN'];
  await app.close();
  await admin.end();
});

describeIfDatabase('TEN-29: a change made from another origin is refused', () => {
  it("refuses a shop subdomain's Origin, and accepts the dashboard's own or none at all", async () => {
    const who = await owner();
    const change = (headers: Record<string, string>) =>
      patchJson(
        port,
        '/shop-settings',
        { businessAddress: 'Mirpur 10, Dhaka' },
        onShop(who, headers),
      );

    const fromShopHost = await change({ origin: `https://${who.slug}.localhost` });
    expect(fromShopHost.status).toBe(403);
    expect(fromShopHost.body).toMatchObject({ error: { code: 'forbidden' } });

    expect((await change({ origin: DASHBOARD_ORIGIN })).status).toBe(200);
    // Not a browser: no cookie it sent on its own, and the CSRF token still applies.
    expect((await change({})).status).toBe(200);
  });

  it('never refuses a read, whatever its Origin', async () => {
    const who = await owner();
    const read = await getJson(
      port,
      '/me',
      onShop(who, { origin: `https://${who.slug}.localhost` }),
    );
    expect(read.status).toBe(200);
  });
});

describeIfDatabase("TEN-26, TEN-31: the dashboard's own pages are never a shop", () => {
  it('reserves every dashboard page name', async () => {
    const reserved = await admin.query<{ slug: string }>(
      'SELECT slug FROM control.reserved_slugs WHERE slug = ANY($1)',
      [[...DASHBOARD_PATHS]],
    );
    expect(reserved.rows.map((row) => row.slug).sort()).toEqual([...DASHBOARD_PATHS].sort());
  });

  it("lists every top-level page of apps/dashboard, so a new one can't be taken as a shop slug", () => {
    const routes = path.resolve(__dirname, '../../dashboard/src/routes');
    const pages = readdirSync(routes)
      .map((name) => name.replace(/\.tsx?$/, ''))
      // `$shop` is the shop itself; `__root` and `index` are not paths of their own.
      .filter((name) => !name.startsWith('$') && !name.startsWith('_') && name !== 'index');
    const listed: readonly string[] = DASHBOARD_PATHS;
    expect(pages.filter((page) => !listed.includes(page))).toEqual([]);
  });

  it('refuses a page name as a new shop address', async () => {
    const phone = texts.freshPhone();
    await post('/auth/phone/code', { phone });
    const entered = await post('/auth/phone/verify', { phone, code: texts.codeFor(phone) });
    const shop = await post(
      '/shops',
      { ownerName: 'Owner', shopName: 'Checkout', address: 'checkout' },
      {
        cookie: cookieFrom(entered),
        'x-csrf-token': (entered.body as { csrfToken: string }).csrfToken,
        host: 'localhost',
      },
    );
    expect(shop.status).toBe(409);
    expect(shop.body).toMatchObject({ error: { details: { suggestion: 'checkout-2' } } });
  });
});
