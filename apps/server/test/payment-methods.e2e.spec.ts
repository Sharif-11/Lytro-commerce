import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditAction } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson, postJson, putJson, sendExact } from './support/http';
import { errorOf, fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 5 Slice 5.1, read agreed 2026-10-31: the accounts a shop takes money into -- bKash, Nagad, Rocket and Upay
// numbers and bank accounts (WAL-01, WAL-14, D5-6) -- one active per method (WAL-03), nothing active on its own
// (WAL-04), a method switched off (WAL-05); shoppers see only the active accounts of methods that are on (WAL-06), and
// nothing until the owner's phone is verified (TVR-01); only the owner changes them (WAL-07, STF-07 amended). Runs only
// when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_payment_methods_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'payment-methods-e2e-otp-secret-0123456789abc';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
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

interface Account {
  id: string;
  accountName: string;
  number: string | null;
  accountType: string | null;
  note: string | null;
  bankName: string | null;
  accountNumber: string | null;
  active: boolean;
}

interface Methods {
  methods: {
    method: string;
    kind: string;
    enabled: boolean;
    levels: string[];
    accounts: Account[];
  }[];
  ownerPhoneVerified: boolean;
}

interface ShopperMethod {
  method: string;
  accountName: string;
  number: string | null;
  accountType: string | null;
  bank: { bankName: string; accountNumber: string } | null;
}

function wallet(number: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { accountName: 'Rahim Store', number, accountType: 'personal', ...extra };
}

async function saved(shop: ShopClient, method: string, body: unknown): Promise<Methods> {
  const result = await shop.put(`/payment-methods/${method}`, body);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body as Methods;
}

function accountsOf(view: Methods, method: string): Account[] {
  return view.methods.find((row) => row.method === method)?.accounts ?? [];
}

async function shopperMethods(shop: ShopClient): Promise<ShopperMethod[]> {
  const key = await shop.post('/api-keys', { name: 'Website', websites: ['https://myshop.com'] });
  const publicKey = (key.body as { key: string }).key;
  const read = await sendExact(port, 'GET', '/v1/payment-methods', undefined, {
    host: 'api.localhost',
    authorization: `Bearer ${publicKey}`,
    origin: 'https://myshop.com',
  });
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return (read.body as { methods: ShopperMethod[] }).methods;
}

describeIfDatabase("a shop's payment accounts (WAL-01 to WAL-05, WAL-14 to WAL-18)", () => {
  it('starts with every method on and none with an account, and knows the owner signed up by phone', async () => {
    const shop = await openShop(port, texts, 'pay');
    const view = (await shop.get('/payment-methods')).body as Methods;
    expect(view.methods.map((row) => [row.method, row.kind, row.enabled, row.levels])).toEqual([
      ['bkash', 'wallet', true, ['manual']],
      ['nagad', 'wallet', true, ['manual']],
      ['rocket', 'wallet', true, ['manual']],
      ['upay', 'wallet', true, ['manual']],
      ['bank', 'bank', true, ['manual']],
    ]);
    expect(view.methods.every((row) => row.accounts.length === 0)).toBe(true);
    expect(view.ownerPhoneVerified).toBe(true);
  });

  it('saves numbers in local form, one active, the first sent active winning, and logs the active one', async () => {
    const shop = await openShop(port, texts, 'pay');
    const view = await saved(shop, 'bkash', {
      enabled: true,
      accounts: [
        wallet('+8801711000001', { active: true }),
        wallet('018 1100-0002', {
          accountName: 'Agent point',
          accountType: 'agent',
          active: true,
          note: 'Cash out',
        }),
      ],
    });
    expect(
      accountsOf(view, 'bkash').map((row) => [row.number, row.accountType, row.note, row.active]),
    ).toEqual([
      ['01711000001', 'personal', null, true],
      ['01811000002', 'agent', 'Cash out', false],
    ]);
    const logged = await admin.query<{ summary: Record<string, unknown> }>(
      'SELECT summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2',
      [shop.tenantId, AuditAction.PaymentMethodSaved],
    );
    expect(logged.rows.map((row) => row.summary)).toEqual([
      { method: 'bkash', enabled: true, accounts: 2, active: '01711000001' },
    ]);
  });

  it('refuses a number that is not a wallet number, the same number twice and an 11th account', async () => {
    const shop = await openShop(port, texts, 'pay');
    const bad = await shop.put('/payment-methods/nagad', {
      enabled: true,
      accounts: [wallet('01211000001')],
    });
    expect(bad.status).toBe(400);
    expect(fieldsOf(bad)).toEqual({ 'accounts.0.number': 'invalid_format' });
    const twice = await shop.put('/payment-methods/nagad', {
      enabled: true,
      accounts: [wallet('01711000001'), wallet('+8801711000001')],
    });
    expect(fieldsOf(twice)).toEqual({ 'accounts.1.number': 'not_allowed' });
    const eleven = Array.from({ length: 11 }, (_, index) =>
      wallet(`0171100${String(index).padStart(4, '0')}`),
    );
    const many = await shop.put('/payment-methods/nagad', { enabled: true, accounts: eleven });
    expect(many.status).toBe(400);
    expect(Object.keys(fieldsOf(many))).toEqual(['accounts']);
    // Rocket's numbers may carry a twelfth digit; bKash's may not.
    const rocket = await saved(shop, 'rocket', {
      enabled: true,
      accounts: [wallet('017110000012')],
    });
    expect(accountsOf(rocket, 'rocket')[0]?.number).toBe('017110000012');
    expect(
      fieldsOf(
        await shop.put('/payment-methods/bkash', {
          enabled: true,
          accounts: [wallet('017110000012')],
        }),
      ),
    ).toEqual({ 'accounts.0.number': 'invalid_format' });
    expect((await shop.put('/payment-methods/cash', { enabled: true, accounts: [] })).status).toBe(
      404,
    );
  });

  it('keeps an account by its id, lets two swap numbers, and deletes the ones left out', async () => {
    const shop = await openShop(port, texts, 'pay');
    const first = accountsOf(
      await saved(shop, 'bkash', {
        enabled: true,
        accounts: [wallet('01711000001', { active: true }), wallet('01711000002')],
      }),
      'bkash',
    );
    const [a, b] = first;
    const swapped = accountsOf(
      await saved(shop, 'bkash', {
        enabled: true,
        accounts: [
          wallet('01711000002', { id: a?.id }),
          wallet('01711000001', { id: b?.id, active: true }),
        ],
      }),
      'bkash',
    );
    expect(swapped.map((row) => [row.id, row.number, row.active])).toEqual([
      [a?.id, '01711000002', false],
      [b?.id, '01711000001', true],
    ]);
    const left = accountsOf(
      await saved(shop, 'bkash', {
        enabled: true,
        accounts: [wallet('01711000001', { id: b?.id })],
      }),
      'bkash',
    );
    // WAL-04: the active one sent back inactive leaves the method with none active.
    expect(left.map((row) => [row.id, row.active])).toEqual([[b?.id, false]]);
    const strange = await shop.put('/payment-methods/bkash', {
      enabled: true,
      accounts: [wallet('01711000009', { id: randomUUID() })],
    });
    expect(fieldsOf(strange)).toEqual({ 'accounts.0.id': 'not_found' });
  });

  it("saves a bank's details, needing the bank and the account number (WAL-14)", async () => {
    const shop = await openShop(port, texts, 'pay');
    const view = await saved(shop, 'bank', {
      enabled: true,
      accounts: [
        {
          accountName: 'Rahim Store',
          bankName: 'City Bank',
          accountNumber: '1234567890',
          branch: 'Gulshan',
          routingNumber: '225261725',
          active: true,
        },
      ],
    });
    expect(accountsOf(view, 'bank')[0]).toMatchObject({
      bankName: 'City Bank',
      accountNumber: '1234567890',
      number: null,
      accountType: null,
      active: true,
    });
    const short = await shop.put('/payment-methods/bank', {
      enabled: true,
      accounts: [{ accountName: 'Rahim Store', branch: 'Gulshan' }],
    });
    expect(fieldsOf(short)).toEqual({
      'accounts.0.bankName': 'required',
      'accounts.0.accountNumber': 'required',
    });
  });
});

describeIfDatabase('what shoppers see (WAL-05, WAL-06, TVR-01)', () => {
  it('shows only active accounts of methods that are on, and hides a method switched off', async () => {
    const shop = await openShop(port, texts, 'pay');
    await saved(shop, 'bkash', {
      enabled: true,
      accounts: [
        wallet('01711000001'),
        wallet('01711000002', { accountType: 'merchant', active: true }),
      ],
    });
    await saved(shop, 'nagad', { enabled: true, accounts: [wallet('01811000001')] });
    await saved(shop, 'bank', {
      enabled: true,
      accounts: [
        { accountName: 'Rahim Store', bankName: 'City Bank', accountNumber: '99', active: true },
      ],
    });
    const shown = await shopperMethods(shop);
    expect(
      shown.map((row) => [row.method, row.number, row.accountType, row.bank?.bankName ?? null]),
    ).toEqual([
      ['bkash', '01711000002', 'merchant', null],
      ['bank', null, null, 'City Bank'],
    ]);
    await saved(shop, 'bkash', {
      enabled: false,
      accounts: [wallet('01711000002', { accountType: 'merchant', active: true })],
    });
    expect((await shopperMethods(shop)).map((row) => row.method)).toEqual(['bank']);
    const view = (await shop.get('/payment-methods')).body as Methods;
    expect(view.methods.find((row) => row.method === 'bkash')?.enabled).toBe(false);
  });

  it("shows shoppers nothing while the owner's phone is not verified", async () => {
    const shop = await openShop(port, texts, 'pay');
    await saved(shop, 'bkash', {
      enabled: true,
      accounts: [wallet('01711000001', { active: true })],
    });
    await admin.query(
      `UPDATE control.subscriber_identities SET verified_at = NULL
       WHERE kind = 'phone' AND subscriber_id = (SELECT subscriber_id FROM control.tenants WHERE id = $1)`,
      [shop.tenantId],
    );
    expect(await shopperMethods(shop)).toEqual([]);
    expect(((await shop.get('/payment-methods')).body as Methods).ownerPhoneVerified).toBe(false);
  });
});

describeIfDatabase('only the owner changes them (WAL-07, STF-07)', () => {
  it('lets staff with wallets:read look, refuses them a change, and never puts wallets:manage in a role', async () => {
    const shop = await openShop(port, texts, 'pay');
    const reader = await staffWith(port, texts, admin, shop, ['wallets:read']);
    expect((await getJson(port, '/payment-methods', reader)).status).toBe(200);
    const change = await putJson(
      port,
      '/payment-methods/bkash',
      { enabled: true, accounts: [wallet('01711000001', { active: true })] },
      reader,
    );
    expect(change.status).toBe(403);
    // OwnerOnlyAction, not a missing permission: no permission would let a staff member in.
    expect(errorOf(change).code).toBe('forbidden');
    expect(errorOf(change).details).toEqual({});
    const role = await shop.post('/roles', { name: 'Cashier', permissions: ['wallets:manage'] });
    expect(role.status).toBe(400);
    expect(fieldsOf(role)).toEqual({ permissions: 'not_allowed' });
    // A role that somehow stores it still gives a staff member nothing.
    await admin.query(
      "UPDATE tenant.roles SET permissions = array_append(permissions, 'wallets:manage') WHERE tenant_id = $1",
      [shop.tenantId],
    );
    const me = (await getJson(port, '/me', reader)).body as { permissions: string[] };
    expect(me.permissions).toContain('wallets:read');
    expect(me.permissions).not.toContain('wallets:manage');
    expect(
      (
        await putJson(
          port,
          '/payment-methods/bkash',
          { enabled: true, accounts: [wallet('01711000001', { active: true })] },
          reader,
        )
      ).status,
    ).toBe(403);
    expect(accountsOf((await shop.get('/payment-methods')).body as Methods, 'bkash')).toEqual([]);
    // Without wallets:read, nothing (a second shop, as Starter seats the owner and one staff member).
    const elsewhere = await openShop(port, texts, 'pay');
    const other = await staffWith(port, texts, admin, elsewhere, ['orders:read']);
    expect((await getJson(port, '/payment-methods', other)).status).toBe(403);
  });
});

describeIfDatabase('isolation (SEC-02)', () => {
  it("keeps each shop's accounts its own", async () => {
    const mine = await openShop(port, texts, 'pay');
    const theirs = await openShop(port, texts, 'pay');
    const theirAccount = accountsOf(
      await saved(theirs, 'bkash', {
        enabled: true,
        accounts: [wallet('01711000001', { active: true })],
      }),
      'bkash',
    )[0];
    // The same number is free in another shop.
    await saved(mine, 'bkash', {
      enabled: true,
      accounts: [wallet('01711000001', { active: true })],
    });
    const taken = await mine.put('/payment-methods/bkash', {
      enabled: true,
      accounts: [wallet('01711000002', { id: theirAccount?.id })],
    });
    expect(fieldsOf(taken)).toEqual({ 'accounts.0.id': 'not_found' });
    const still = accountsOf((await theirs.get('/payment-methods')).body as Methods, 'bkash');
    expect(still.map((row) => [row.id, row.number, row.active])).toEqual([
      [theirAccount?.id, '01711000001', true],
    ]);
    expect(accountsOf((await mine.get('/payment-methods')).body as Methods, 'bkash')).toHaveLength(
      1,
    );
    expect((await shopperMethods(mine)).map((row) => row.number)).toEqual(['01711000001']);
    await saved(theirs, 'bkash', { enabled: false, accounts: [] });
    expect((await shopperMethods(mine)).map((row) => row.method)).toEqual(['bkash']);
    expect((await postJson(port, '/payment-methods', {}, mine.headers())).status).toBe(404);
  });
});
