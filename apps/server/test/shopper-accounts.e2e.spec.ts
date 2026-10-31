import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditAction } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { ClientIp } from '../src/common/client-ip';
import { headerValue, type HttpRequest } from '../src/common/http';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import { postJson, sendExact, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 4 Slice 4.4b, read agreed 2026-10-30: a shopper's account in one shop (CUS-03 to CUS-06, CUS-14, ORD-18) --
// made with a code sent once to the phone and paid from the shop's balance, signed in with phone and password after;
// the profile, saved addresses and every order with the phone; staff setting a forgotten password. Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_shopper_accounts_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const API_HOST = 'api.localhost';
const SITE = 'https://myshop.com';
const PASSWORD = 'shopper-pass-1';

/** Lets a test play several visitors: the address is the `x-test-visitor` header's, else the socket's. */
const visitorIp = {
  resolve(request: HttpRequest): string | null {
    return headerValue(request.headers['x-test-visitor']) ?? request.ip ?? null;
  },
  context(request: HttpRequest): { userAgent: string | null; ip: string | null } {
    return {
      userAgent: headerValue(request.headers['user-agent']) ?? null,
      ip: visitorIp.resolve(request),
    };
  },
};

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'shopper-accounts-e2e-otp-secret-0123456789';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(ClientIp)
    .useValue(visitorIp)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

beforeEach(() => {
  texts.down = false;
});

interface Shop {
  owner: ShopClient;
  key: string;
}

interface SignedIn {
  token: string;
  expiresAt: string;
  shopper: { id: string; name: string; phone: string };
}

interface Address {
  id: string;
  label: string;
  location: { id: number } | null;
  deliveryAddress: string;
  isDefault: boolean;
}

/** A shop with its own website's key, and (unless 0) a balance to pay for codes. */
async function shopWithKey(balance = '20.00'): Promise<Shop> {
  const owner = await openShop(port, texts, 'shp');
  await seedBalance(admin, owner.tenantId, balance);
  const made = await owner.post('/api-keys', { name: 'Website', websites: [SITE] });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return { owner, key: (made.body as { key: string }).key };
}

let visitors = 0;
/** A visitor of their own, so the per-visitor windows never mix tests. */
function freshVisitor(): string {
  visitors += 1;
  return `198.51.${String(Math.floor(visitors / 250))}.${String((visitors % 250) + 1)}`;
}

function call(
  shop: Shop,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload: unknown,
  extra: Record<string, string> = {},
): Promise<HttpResult> {
  return sendExact(port, method, `/v1/shopper${path}`, payload, {
    host: API_HOST,
    authorization: `Bearer ${shop.key}`,
    origin: SITE,
    'x-test-visitor': extra['x-test-visitor'] ?? freshVisitor(),
    ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
    ...extra,
  });
}

function as(token: string): Record<string, string> {
  return { 'x-shopper-token': token };
}

/** The sign-up code the shop texted to this phone, read by its own words (a shop's name may hold digits too). */
function codeIn(phone: string): string {
  const last = [...texts.sent].reverse().find((text) => text.toPhone === phone);
  return /(?:code is|কোড) (\d{6})/.exec(last?.body ?? '')?.[1] ?? '';
}

async function sendCode(
  shop: Shop,
  phone: string,
  extra: Record<string, string> = {},
): Promise<void> {
  const sent = await call(shop, 'POST', '/code', { phone }, extra);
  expect(sent.status, JSON.stringify(sent.body)).toBe(200);
}

async function signUp(shop: Shop, phone = texts.freshPhone(), name = 'Rumana'): Promise<SignedIn> {
  await sendCode(shop, phone);
  const made = await call(shop, 'POST', '/signup', {
    phone,
    code: codeIn(phone),
    name,
    password: PASSWORD,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as SignedIn;
}

function signIn(shop: Shop, phone: string, password = PASSWORD): Promise<HttpResult> {
  return call(shop, 'POST', '/signin', { phone, password });
}

async function ledger(tenantId: string, type: string): Promise<string[]> {
  const result = await admin.query<{ amount: string }>(
    'SELECT amount::text AS amount FROM tenant.balance_ledger WHERE tenant_id = $1 AND type = $2 ORDER BY id',
    [tenantId, type],
  );
  return result.rows.map((row) => row.amount);
}

/** SMS-09: what a text costs at the seeded rate -- its length over 75 characters, at 0.55 TK a unit. */
function costOf(body: string): string {
  return (Math.ceil(Array.from(body).length / 75) * 0.55).toFixed(2);
}

let mirpur: number | null = null;
async function mirpurId(shop: Shop): Promise<number> {
  if (mirpur === null) {
    const locations = (await shop.owner.get('/locations')).body as {
      zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
    };
    mirpur =
      locations.zillas
        .find((row) => row.nameEn === 'Dhaka')
        ?.thanas.find((row) => row.nameEn === 'Mirpur')?.id ?? null;
  }
  if (mirpur === null) throw new Error('no thana Dhaka/Mirpur');
  return mirpur;
}

describeIfDatabase(
  "making a shopper account with a code paid from the shop's balance (CUS-03, CUS-04)",
  () => {
    it('sends the code under the shop name, charges it to the balance, and makes the account with it', async () => {
      const shop = await shopWithKey();
      const phone = texts.freshPhone();
      const usage = async (): Promise<number> =>
        (
          await admin.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM control.essential_sms_usage WHERE tenant_id = $1',
            [shop.owner.tenantId],
          )
        ).rows[0]?.n ?? 0;
      const freeBefore = await usage();
      const sent = await call(shop, 'POST', '/code', { phone }, { 'accept-language': 'en' });
      expect(sent.status, JSON.stringify(sent.body)).toBe(200);
      expect(sent.body).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 60 });
      const text = [...texts.sent].reverse().find((row) => row.toPhone === phone);
      expect(text?.body).toContain(`Shop ${shop.owner.slug}: your sign-up code is`);
      expect(await ledger(shop.owner.tenantId, 'sms')).toEqual([`-${costOf(text?.body ?? '')}`]);
      expect(await usage()).toBe(freeBefore);
      const made = await call(shop, 'POST', '/signup', {
        phone,
        code: codeIn(phone),
        name: 'Rumana',
        password: PASSWORD,
      });
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      const signedIn = made.body as SignedIn;
      expect(signedIn.shopper).toMatchObject({ name: 'Rumana', phone });
      const me = await call(shop, 'GET', '/me', undefined, as(signedIn.token));
      expect(me.body).toMatchObject({ name: 'Rumana', phone });
      const again = await call(shop, 'POST', '/signup', {
        phone,
        code: codeIn(phone),
        name: 'Rumana',
        password: PASSWORD,
      });
      expect(again.status).toBe(400);
      expect(fieldsOf(again)).toEqual({ code: 'expired' });
    });

    it("sends nothing and charges nothing when the balance can't cover the code", async () => {
      const shop = await shopWithKey('0');
      const phone = texts.freshPhone();
      const refused = await call(shop, 'POST', '/code', { phone });
      expect(refused.status).toBe(429);
      expect(errorOf(refused).code).toBe('quota_exceeded');
      expect(texts.countFor(phone)).toBe(0);
      expect(await ledger(shop.owner.tenantId, 'sms')).toEqual([]);
    });

    it('refuses a phone that already has an account, without a text or a charge', async () => {
      const shop = await shopWithKey();
      const account = await signUp(shop);
      const before = await ledger(shop.owner.tenantId, 'sms');
      const refused = await call(shop, 'POST', '/code', { phone: account.shopper.phone });
      expect(refused.status).toBe(409);
      expect(await ledger(shop.owner.tenantId, 'sms')).toEqual(before);
    });

    it('gives the charge back and forgets the code when the text cannot be sent (SMS-08)', async () => {
      const shop = await shopWithKey();
      const phone = texts.freshPhone();
      texts.down = true;
      const failed = await call(shop, 'POST', '/code', { phone });
      expect(failed.status).toBe(503);
      const charged = await ledger(shop.owner.tenantId, 'sms');
      expect(charged).toHaveLength(1);
      expect(await ledger(shop.owner.tenantId, 'reversal')).toEqual([charged[0]?.replace('-', '')]);
      texts.down = false;
      await sendCode(shop, phone);
    });

    it('holds a phone to a minute between codes, a visitor to five a minute, and the shop to 30 an hour', async () => {
      const shop = await shopWithKey();
      const phone = texts.freshPhone();
      await sendCode(shop, phone);
      const soon = await call(shop, 'POST', '/code', { phone });
      expect(soon.status).toBe(429);
      expect(soon.headers['retry-after']).toBeDefined();
      const visitor = freshVisitor();
      for (let n = 0; n < 5; n += 1) {
        await sendCode(shop, texts.freshPhone(), { 'x-test-visitor': visitor });
      }
      const sixth = await call(
        shop,
        'POST',
        '/code',
        { phone: texts.freshPhone() },
        { 'x-test-visitor': visitor },
      );
      expect(sixth.status).toBe(429);
      await admin.query(
        `INSERT INTO tenant.shopper_codes (tenant_id, phone, code_hash, expires_at)
       SELECT $1, '0171' || lpad(n::text, 7, '0'), 'x', now() + interval '5 minutes' FROM generate_series(1, 30) AS n`,
        [shop.owner.tenantId],
      );
      const busy = await call(shop, 'POST', '/code', { phone: texts.freshPhone() });
      expect(busy.status).toBe(429);
    });

    it('refuses a wrong code, then locks it after five, and refuses one past its five minutes', async () => {
      const shop = await shopWithKey();
      const phone = texts.freshPhone();
      await sendCode(shop, phone);
      const right = codeIn(phone);
      const wrong = right === '000000' ? '111111' : '000000';
      const attempt = (code: string): Promise<HttpResult> =>
        call(shop, 'POST', '/signup', { phone, code, name: 'Rumana', password: PASSWORD });
      const first = await attempt(wrong);
      expect(first.status).toBe(400);
      expect(fieldsOf(first)).toEqual({ code: 'incorrect' });
      for (let n = 0; n < 4; n += 1) await attempt(wrong);
      expect((await attempt(right)).status).toBe(429);
      const late = texts.freshPhone();
      await sendCode(shop, late);
      await admin.query(
        "UPDATE tenant.shopper_codes SET expires_at = now() - interval '1 second' WHERE phone = $1",
        [late],
      );
      const expired = await call(shop, 'POST', '/signup', {
        phone: late,
        code: codeIn(late),
        name: 'Rumana',
        password: PASSWORD,
      });
      expect(fieldsOf(expired)).toEqual({ code: 'expired' });
    });
  },
);

describeIfDatabase('signing in with phone and password (CUS-03, CUS-05)', () => {
  it('signs in with no code, and answers a wrong password and an unknown phone alike', async () => {
    const shop = await shopWithKey();
    const account = await signUp(shop);
    const textsBefore = texts.countFor(account.shopper.phone);
    const signedIn = await signIn(shop, account.shopper.phone);
    expect(signedIn.status, JSON.stringify(signedIn.body)).toBe(200);
    expect((signedIn.body as SignedIn).token).not.toBe(account.token);
    expect(texts.countFor(account.shopper.phone)).toBe(textsBefore);
    const wrong = await signIn(shop, account.shopper.phone, 'not-the-password');
    const unknown = await signIn(shop, texts.freshPhone());
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(errorOf(wrong).message).toBe(errorOf(unknown).message);
  });

  it('locks the account after five wrong passwords within fifteen minutes', async () => {
    const shop = await shopWithKey();
    const account = await signUp(shop);
    for (let n = 0; n < 5; n += 1) {
      expect((await signIn(shop, account.shopper.phone, 'not-the-password')).status).toBe(401);
    }
    expect((await signIn(shop, account.shopper.phone)).status).toBe(429);
  });

  it('keeps a token to its own shop, and ends it on sign-out', async () => {
    const shop = await shopWithKey();
    const other = await shopWithKey();
    const account = await signUp(shop);
    expect((await call(other, 'GET', '/me', undefined, as(account.token))).status).toBe(401);
    expect((await signIn(other, account.shopper.phone)).status).toBe(401);
    expect((await call(shop, 'GET', '/me', undefined)).status).toBe(401);
    expect((await call(shop, 'POST', '/signout', {}, as(account.token))).status).toBe(200);
    expect((await call(shop, 'GET', '/me', undefined, as(account.token))).status).toBe(401);
  });

  it('renames the shopper, and a new password ends their other sign-ins', async () => {
    const shop = await shopWithKey();
    const account = await signUp(shop);
    const second = (await signIn(shop, account.shopper.phone)).body as SignedIn;
    const renamed = await call(shop, 'PATCH', '/me', { name: 'Rumana Akter' }, as(account.token));
    expect(renamed.body).toMatchObject({ name: 'Rumana Akter', phone: account.shopper.phone });
    const wrong = await call(
      shop,
      'POST',
      '/password',
      { currentPassword: 'nope-nope', newPassword: 'another-pass-2' },
      as(account.token),
    );
    expect(fieldsOf(wrong)).toEqual({ currentPassword: 'incorrect' });
    const changed = await call(
      shop,
      'POST',
      '/password',
      { currentPassword: PASSWORD, newPassword: 'another-pass-2' },
      as(account.token),
    );
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect((await call(shop, 'GET', '/me', undefined, as(second.token))).status).toBe(401);
    expect((await call(shop, 'GET', '/me', undefined, as(account.token))).status).toBe(200);
    expect((await signIn(shop, account.shopper.phone)).status).toBe(401);
    expect((await signIn(shop, account.shopper.phone, 'another-pass-2')).status).toBe(200);
  });
});

describeIfDatabase('saved addresses (CUS-06)', () => {
  it('makes the first the default, moves the default when asked, and passes it on when it goes', async () => {
    const shop = await shopWithKey();
    const account = await signUp(shop);
    const locationId = await mirpurId(shop);
    const add = async (label: string, isDefault?: boolean): Promise<Address[]> => {
      const saved = await call(
        shop,
        'POST',
        '/addresses',
        {
          label,
          locationId,
          deliveryAddress: `${label}, Road 3`,
          ...(isDefault ? { isDefault } : {}),
        },
        as(account.token),
      );
      expect(saved.status, JSON.stringify(saved.body)).toBe(201);
      return (saved.body as { addresses: Address[] }).addresses;
    };
    expect((await add('Home')).map((row) => [row.label, row.isDefault])).toEqual([['Home', true]]);
    await add('Office');
    const moved = await add('Shop', true);
    expect(moved.map((row) => [row.label, row.isDefault])).toEqual([
      ['Shop', true],
      ['Home', false],
      ['Office', false],
    ]);
    expect(moved[0]?.location?.id).toBe(locationId);
    const home = moved.find((row) => row.label === 'Home');
    const made = await call(
      shop,
      'PATCH',
      `/addresses/${home?.id ?? ''}`,
      { isDefault: true },
      as(account.token),
    );
    expect((made.body as { addresses: Address[] }).addresses[0]).toMatchObject({
      label: 'Home',
      isDefault: true,
    });
    const gone = await call(
      shop,
      'DELETE',
      `/addresses/${home?.id ?? ''}`,
      undefined,
      as(account.token),
    );
    expect(
      (gone.body as { addresses: Address[] }).addresses.map((row) => [row.label, row.isDefault]),
    ).toEqual([
      ['Office', true],
      ['Shop', false],
    ]);
  });

  it('keeps ten at most, refuses a thana not on the list, and never reaches another shopper', async () => {
    const shop = await shopWithKey();
    const account = await signUp(shop);
    const other = await signUp(shop);
    const locationId = await mirpurId(shop);
    for (let n = 1; n <= 10; n += 1) {
      const saved = await call(
        shop,
        'POST',
        '/addresses',
        { label: `Place ${String(n)}`, locationId, deliveryAddress: 'Road 3' },
        as(account.token),
      );
      expect(saved.status).toBe(201);
    }
    const eleventh = await call(
      shop,
      'POST',
      '/addresses',
      { label: 'One more', locationId, deliveryAddress: 'Road 3' },
      as(account.token),
    );
    expect(eleventh.status).toBe(409);
    const unknown = await call(
      shop,
      'POST',
      '/addresses',
      { label: 'Nowhere', locationId: 999_999, deliveryAddress: 'Road 3' },
      as(other.token),
    );
    expect(fieldsOf(unknown)).toEqual({ locationId: 'not_found' });
    const listed = (await call(shop, 'GET', '/addresses', undefined, as(account.token))).body as {
      addresses: Address[];
    };
    const theirs = listed.addresses[0]?.id ?? '';
    expect(
      (await call(shop, 'PATCH', `/addresses/${theirs}`, { label: 'Mine' }, as(other.token)))
        .status,
    ).toBe(404);
    expect(
      (await call(shop, 'DELETE', `/addresses/${theirs}`, undefined, as(other.token))).status,
    ).toBe(404);
    expect(
      (
        (await call(shop, 'GET', '/addresses', undefined, as(account.token))).body as {
          addresses: Address[];
        }
      ).addresses,
    ).toHaveLength(10);
  });
});

describeIfDatabase("a shopper's orders (ORD-18)", () => {
  it('lists every order of the shop with their phone, from any source, with numbers, status and total only', async () => {
    const shop = await shopWithKey();
    const phone = texts.freshPhone();
    const made = await shop.owner.post('/products', {
      name: 'Lamp',
      basePrice: 300,
      variants: [{ optionIds: [], openingStock: 20 }],
    });
    const variantId = (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '';
    const locationId = await mirpurId(shop);
    const staffOrder = await postJson(
      port,
      '/orders',
      {
        customerName: 'Rumana',
        phone,
        locationId,
        deliveryAddress: 'House 12',
        items: [{ variantId, quantity: 1 }],
      },
      shop.owner.headers({ 'idempotency-key': randomUUID() }),
    );
    expect(staffOrder.status, JSON.stringify(staffOrder.body)).toBe(201);
    const online = await sendExact(
      port,
      'POST',
      '/v1/orders',
      {
        customerName: 'Rumana',
        phone,
        locationId,
        deliveryAddress: 'House 12',
        items: [{ variantId, quantity: 2 }],
      },
      {
        host: API_HOST,
        authorization: `Bearer ${shop.key}`,
        origin: SITE,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
        'x-test-visitor': freshVisitor(),
      },
    );
    expect(online.status, JSON.stringify(online.body)).toBe(201);
    await postJson(
      port,
      '/orders',
      {
        customerName: 'Someone else',
        phone: texts.freshPhone(),
        locationId,
        deliveryAddress: 'House 9',
        items: [{ variantId, quantity: 1 }],
      },
      shop.owner.headers({ 'idempotency-key': randomUUID() }),
    );
    const account = await signUp(shop, phone);
    const page = await call(shop, 'GET', '/orders', undefined, as(account.token));
    expect(page.status, JSON.stringify(page.body)).toBe(200);
    const listed = page.body as { orders: Record<string, unknown>[]; total: number };
    expect(listed.total).toBe(2);
    expect(listed.orders.map((row) => row['orderNumber'])).toEqual([
      (online.body as { orderNumber: string }).orderNumber,
      (staffOrder.body as { orderNumber: string }).orderNumber,
    ]);
    expect(Object.keys(listed.orders[0] ?? {}).sort()).toEqual([
      'createdAt',
      'grandTotal',
      'orderNumber',
      'status',
      'trackingId',
    ]);
    const tracked = await sendExact(
      port,
      'GET',
      `/v1/track/${String(listed.orders[1]?.['trackingId'])}`,
      undefined,
      {
        host: API_HOST,
        authorization: `Bearer ${shop.key}`,
        origin: SITE,
        'x-test-visitor': freshVisitor(),
      },
    );
    expect(tracked.status).toBe(200);
  });
});

describeIfDatabase(
  'staff setting a forgotten password, and the privacy delete (CUS-14, CUS-09)',
  () => {
    it('sets a new password from the customer page, ending every sign-in; audited without the password', async () => {
      const shop = await shopWithKey();
      const phone = texts.freshPhone();
      const made = await shop.owner.post('/products', {
        name: 'Lamp',
        basePrice: 300,
        variants: [{ optionIds: [], openingStock: 20 }],
      });
      const variantId = (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '';
      const ordered = await postJson(
        port,
        '/orders',
        {
          customerName: 'Rumana',
          phone,
          locationId: await mirpurId(shop),
          deliveryAddress: 'House 12',
          items: [{ variantId, quantity: 1 }],
        },
        shop.owner.headers({ 'idempotency-key': randomUUID() }),
      );
      const customerId = (ordered.body as { customerId: string; id: string }).customerId;
      const orderId = (ordered.body as { id: string }).id;
      expect(
        ((await shop.owner.get(`/customers/${customerId}`)).body as { account: unknown }).account,
      ).toBeNull();
      // Slice 4.8b: the customer list says whether the phone has an account.
      const listed = async () =>
        (
          (await shop.owner.get(`/customers?q=${phone}`)).body as {
            customers: { id: string; hasAccount: boolean }[];
          }
        ).customers.find((row) => row.id === customerId)?.hasAccount;
      expect(await listed()).toBe(false);
      expect(
        (await shop.owner.post(`/customers/${customerId}/password`, { password: 'staff-set-9' }))
          .status,
      ).toBe(404);
      const account = await signUp(shop, phone);
      expect(
        (
          (await shop.owner.get(`/customers/${customerId}`)).body as {
            account: { createdAt: string } | null;
          }
        ).account,
      ).not.toBeNull();
      expect(await listed()).toBe(true);
      const reader = await staffWith(port, texts, admin, shop.owner, ['customers:read']);
      expect(
        (
          await postJson(
            port,
            `/customers/${customerId}/password`,
            { password: 'staff-set-9' },
            reader,
          )
        ).status,
      ).toBe(403);
      const set = await shop.owner.post(`/customers/${customerId}/password`, {
        password: 'staff-set-9',
      });
      expect(set.status, JSON.stringify(set.body)).toBe(200);
      expect((await call(shop, 'GET', '/me', undefined, as(account.token))).status).toBe(401);
      expect((await signIn(shop, phone)).status).toBe(401);
      expect((await signIn(shop, phone, 'staff-set-9')).status).toBe(200);
      const audited = await admin.query<{ summary: unknown }>(
        'SELECT summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2',
        [shop.owner.tenantId, AuditAction.ShopperPasswordSet],
      );
      expect(audited.rows.map((row) => row.summary)).toEqual([{}]);
      const other = await shopWithKey();
      expect(
        (await other.owner.post(`/customers/${customerId}/password`, { password: 'staff-set-9' }))
          .status,
      ).toBe(404);

      // CUS-09: the account goes with the customer's details.
      expect(
        (await shop.owner.post(`/orders/${orderId}/cancel`, { reason: 'customer_cancelled' }))
          .status,
      ).toBe(200);
      const signedIn = (await signIn(shop, phone, 'staff-set-9')).body as SignedIn;
      expect((await shop.owner.delete(`/customers/${customerId}`)).status).toBe(200);
      expect((await call(shop, 'GET', '/me', undefined, as(signedIn.token))).status).toBe(401);
      expect((await signIn(shop, phone, 'staff-set-9')).status).toBe(401);
      await signUp(shop, phone);
    });
  },
);
