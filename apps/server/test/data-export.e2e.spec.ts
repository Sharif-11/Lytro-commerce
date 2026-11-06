import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { DataExportService } from '../src/modules/data-export/services/data-export.service';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { SmsCapture } from './support/sms-capture';
import {
  cookieFrom,
  deleteJson,
  getBinary,
  getJson,
  postJson,
  putJson,
  type HttpResult,
} from './support/http';
import { passFirstSignIn } from './support/shop-client';

// LIF-16/17: the owner's own export of payments and the activity log. White-box for generation (the same
// direct-service-call pattern test/plan-downgrade.e2e.spec.ts and test/queue.e2e.spec.ts already use) --
// HTTP for everything guard/permission/isolation-related, which is the actual risk surface here.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_data_export_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const STAFF_PASSWORD = 'staff-horse-9';

let app: INestApplication;
let admin: pg.Client;
let dataExport: DataExportService;
const texts = new SmsCapture();

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);
const get = (path: string, headers: Record<string, string> = {}) => getJson(port, path, headers);
let port: number;

const freshSlug = (): string => `x${randomUUID().replace(/-/g, '').slice(0, 10)}`;

function errorOf(result: HttpResult): unknown {
  return (result.body as { error?: unknown }).error;
}

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
  return { phone, slug, ...session };
}

function shopCall(who: Owner): Record<string, string> {
  return {
    cookie: who.cookie,
    'x-csrf-token': who.csrfToken,
    host: 'localhost',
    'x-lytro-shop': who.slug,
  };
}

async function tenantIdOf(slug: string): Promise<string> {
  const row = await admin.query<{ id: string }>('SELECT id FROM control.tenants WHERE slug = $1', [
    slug,
  ]);
  return row.rows[0]?.id ?? '';
}

async function viewerSession(who: Owner): Promise<Record<string, string>> {
  await admin.query(
    `UPDATE control.tenants SET plan_id = (SELECT id FROM control.plans WHERE name = 'Starter'), plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Starter')
     WHERE slug = $1`,
    [who.slug],
  );
  const role = (
    await post(
      '/roles',
      { name: `Role ${randomUUID().slice(0, 6)}`, permissions: [] },
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
    {
      host: 'localhost',
      'x-lytro-shop': who.slug,
    },
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

/** The files of a zip by name, read from its central directory: the local headers of a streamed zip hold no sizes. */
function filesIn(zip: Buffer): Map<string, string> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let at = zip.readUInt32LE(end + 16);
  const files = new Map<string, string>();
  for (let left = zip.readUInt16LE(end + 10); left > 0; left -= 1) {
    const nameLength = zip.readUInt16LE(at + 28);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    const local = zip.readUInt32LE(at + 42);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const body = zip.subarray(start, start + zip.readUInt32LE(at + 20));
    files.set(name, (zip.readUInt16LE(at + 10) === 8 ? inflateRawSync(body) : body).toString());
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return files;
}

/** A CSV's rows by their columns; the values a test writes here hold no commas or quotes. */
function csvRows(csv: string | undefined): Record<string, string>[] {
  const [header, ...lines] = (csv ?? '').split('\n');
  const columns = (header ?? '').split(',');
  return lines.map((line) => {
    const values = line.split(',');
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? '']));
  });
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'data-export-e2e-otp-secret-0123456789abcd';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  dataExport = moduleRef.get(DataExportService);
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('requesting and listing an export (LIF-16)', () => {
  it('starts pending, and the worker turns it into a ready zip with the right audit trail', async () => {
    const who = await owner();
    const requested = await post('/exports', {}, shopCall(who));
    expect(requested.status).toBe(201);
    expect(requested.body).toMatchObject({ status: 'pending' });
    const exportId = (requested.body as { id: string }).id;

    const tenantId = await tenantIdOf(who.slug);
    await dataExport.generate(tenantId, exportId);

    const listed = await get('/exports', shopCall(who));
    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject([
      { id: exportId, status: 'ready', contentType: 'application/zip' },
    ]);

    const downloaded = await getBinary(port, `/exports/${exportId}/download`, shopCall(who));
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers['content-type']).toBe('application/zip');
    expect(downloaded.body.subarray(0, 2).toString('latin1')).toBe('PK'); // zip local-file-header signature

    const log = await admin.query<{ action: string }>(
      `SELECT action FROM tenant.activity_log WHERE tenant_id = $1 ORDER BY created_at ASC`,
      [tenantId],
    );
    const actions = log.rows.map((row) => row.action);
    expect(actions).toContain('data_export_requested');
    expect(actions).toContain('data_export_downloaded');
  });

  it('404s a download past its 24-hour expiry', async () => {
    const who = await owner();
    const requested = await post('/exports', {}, shopCall(who));
    const exportId = (requested.body as { id: string }).id;
    const tenantId = await tenantIdOf(who.slug);
    await dataExport.generate(tenantId, exportId);

    await admin.query(
      `UPDATE tenant.data_exports SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [exportId],
    );

    const expired = await get(`/exports/${exportId}/download`, shopCall(who));
    expect(expired.status).toBe(404);
    expect(errorOf(expired)).toMatchObject({ code: 'not_found' });
  });

  it("holds every order and customer of the shop, as CSV and JSON, and none of another shop's", async () => {
    const who = await owner();
    const other = await owner();
    const lampOf = async (shop: Owner, price: number): Promise<string> => {
      const made = await post(
        '/products',
        { name: 'Lamp', basePrice: price, variants: [{ optionIds: [], openingStock: 10 }] },
        shopCall(shop),
      );
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      return (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '';
    };
    const place = async (shop: Owner, body: Record<string, unknown>): Promise<string> => {
      const made = await post('/orders', body, {
        ...shopCall(shop),
        'idempotency-key': randomUUID(),
      });
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      return (made.body as { orderNumber: string }).orderNumber;
    };
    const locations = (await get('/locations', shopCall(who))).body as {
      zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
    };
    const locationId = locations.zillas
      .find((row) => row.nameEn === 'Dhaka')
      ?.thanas.find((row) => row.nameEn === 'Mirpur')?.id;
    const rahima = texts.freshPhone();
    const karim = texts.freshPhone();
    const stranger = texts.freshPhone();
    const lamp = await lampOf(who, 300);
    // LIF-16: a product deleted for good is no longer the shop's to export.
    const gone = await post(
      '/products',
      { name: 'Old shawl', basePrice: 900, variants: [{ optionIds: [] }] },
      shopCall(who),
    );
    expect(gone.status, JSON.stringify(gone.body)).toBe(201);
    const removed = await deleteJson(
      port,
      `/products/${(gone.body as { id: string }).id}?hard=true`,
      shopCall(who),
    );
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    const delivered = {
      customerName: 'Rahima Akter',
      phone: rahima,
      locationId,
      deliveryAddress: 'House 12 Road 3',
      items: [{ variantId: lamp, quantity: 2 }],
    };
    const first = await place(who, delivered);
    const second = await place(who, delivered);
    const third = await place(who, {
      customerName: 'Karim Mia',
      phone: karim,
      fulfilmentType: 'takeaway',
      items: [{ variantId: lamp, quantity: 1 }],
    });
    await place(other, {
      customerName: 'Someone Else',
      phone: stranger,
      fulfilmentType: 'takeaway',
      items: [{ variantId: await lampOf(other, 900), quantity: 1 }],
    });

    const requested = await post('/exports', {}, shopCall(who));
    const exportId = (requested.body as { id: string }).id;
    await dataExport.generate(await tenantIdOf(who.slug), exportId);
    const downloaded = await getBinary(port, `/exports/${exportId}/download`, shopCall(who));
    expect(downloaded.status).toBe(200);
    const files = filesIn(downloaded.body);

    const byNumber = <T extends { orderNumber?: string }>(rows: T[]) =>
      [...rows].sort((a, b) => String(a.orderNumber).localeCompare(String(b.orderNumber)));
    const rahimaOrder = {
      customerName: 'Rahima Akter',
      customerPhone: rahima,
      deliveryAddress: 'House 12 Road 3',
      fulfilmentType: 'delivery',
      source: 'dashboard',
      subtotal: '600.00',
      deliveryCharge: '70.00',
      grandTotal: '670.00',
    };
    const karimOrder = {
      customerName: 'Karim Mia',
      customerPhone: karim,
      fulfilmentType: 'takeaway',
      subtotal: '300.00',
      deliveryCharge: '0.00',
      grandTotal: '300.00',
    };
    const orderRows = byNumber(csvRows(files.get('orders.csv')));
    expect(orderRows.map((row) => row['orderNumber'])).toEqual([first, second, third]);
    expect(orderRows).toEqual([
      expect.objectContaining(rahimaOrder),
      expect.objectContaining(rahimaOrder),
      expect.objectContaining(karimOrder),
    ]);
    const ordersJson = byNumber(
      JSON.parse(files.get('orders.json') ?? '[]') as {
        orderNumber: string;
        items: { productName: string; quantity: string; itemTotal: string }[];
      }[],
    );
    expect(ordersJson).toEqual([
      expect.objectContaining({ orderNumber: first, ...rahimaOrder }),
      expect.objectContaining({ orderNumber: second, ...rahimaOrder }),
      expect.objectContaining({ orderNumber: third, ...karimOrder }),
    ]);
    expect(ordersJson[0]?.items).toEqual([
      expect.objectContaining({ productName: 'Lamp', quantity: '2.000', itemTotal: '600.00' }),
    ]);
    expect(byNumber(csvRows(files.get('order-items.csv')))).toEqual([
      expect.objectContaining({ orderNumber: first, productName: 'Lamp', quantity: '2.000' }),
      expect.objectContaining({ orderNumber: second, productName: 'Lamp', quantity: '2.000' }),
      expect.objectContaining({ orderNumber: third, productName: 'Lamp', quantity: '1.000' }),
    ]);

    const byName = <T extends { name?: string }>(rows: T[]) =>
      [...rows].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    expect(byName(csvRows(files.get('customers.csv')))).toEqual([
      expect.objectContaining({ name: 'Karim Mia', phone: karim, orderCount: '1' }),
      expect.objectContaining({ name: 'Rahima Akter', phone: rahima, orderCount: '2' }),
    ]);
    expect(byName(JSON.parse(files.get('customers.json') ?? '[]') as { name: string }[])).toEqual([
      expect.objectContaining({ name: 'Karim Mia', phone: karim, orderCount: 1 }),
      expect.objectContaining({ name: 'Rahima Akter', phone: rahima, orderCount: 2 }),
    ]);

    // LIF-16: each product and its variants, with what it costs and holds.
    const products = JSON.parse(files.get('products.json') ?? '[]') as {
      name: string;
      basePrice: string;
      variants: { sku: string | null; onHand: string | null }[];
    }[];
    expect(products.map((row) => [row.name, row.basePrice])).toEqual([['Lamp', '300.00']]);
    expect(products[0]?.variants).toHaveLength(1);
    expect(csvRows(files.get('products.csv'))).toEqual([
      expect.objectContaining({ name: 'Lamp', kind: 'standard', basePrice: '300.00' }),
    ]);
    expect(csvRows(files.get('product-variants.csv'))).toEqual([
      expect.objectContaining({ price: '300.00', onHand: products[0]?.variants[0]?.onHand }),
    ]);

    // SEC-02: nothing of the other shop's, in any file. Order numbers are each shop's own, so they may match.
    for (const [name, content] of files) {
      expect(content, name).not.toContain(stranger);
      expect(content, name).not.toContain('Someone Else');
    }
  });
});

describeIfDatabase("a shop's money in its export (LIF-16, Phase 5)", () => {
  // Found at the Phase 5 close-out: the export held no shopper payments and no wallet accounts, though Slice 5.1 counted them.
  it('holds every payment shoppers made and the accounts paid into, never a gateway key', async () => {
    const who = await owner();
    const shop = shopCall(who);
    const saved = await putJson(
      port,
      '/payment-methods/bkash',
      {
        enabled: true,
        accounts: [
          {
            accountName: 'Rahim Store',
            number: '01711000001',
            accountType: 'personal',
            active: true,
          },
        ],
      },
      shop,
    );
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const accountId = (
      saved.body as { methods: { method: string; accounts: { id: string }[] }[] }
    ).methods.find((row) => row.method === 'bkash')?.accounts[0]?.id;
    const secret = `export-must-not-hold-${randomUUID()}`;
    const keys = await putJson(
      port,
      `/payment-methods/accounts/${accountId ?? ''}/gateway`,
      {
        appKey: 'app-key-1',
        appSecret: secret,
        username: 'merchant',
        password: secret,
        sandbox: true,
      },
      shop,
    );
    expect(keys.status, JSON.stringify(keys.body)).toBe(200);
    const made = await post(
      '/products',
      { name: 'Lamp', basePrice: 300, variants: [{ optionIds: [], openingStock: 5 }] },
      shop,
    );
    const variantId = (made.body as { variants: { id: string }[] }).variants[0]?.id;
    const placed = await post(
      '/orders',
      {
        customerName: 'Rahima Akter',
        phone: texts.freshPhone(),
        fulfilmentType: 'takeaway',
        items: [{ variantId, quantity: 1 }],
      },
      { ...shop, 'idempotency-key': randomUUID() },
    );
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    const order = placed.body as { id: string; orderNumber: string };
    const paid = await post(
      `/orders/${order.id}/payments`,
      { method: 'bkash', amount: 300, transactionId: 'EXPORT1234', senderNumber: '01811000002' },
      shop,
    );
    expect(paid.status, JSON.stringify(paid.body)).toBe(201);

    const requested = await post('/exports', {}, shop);
    const exportId = (requested.body as { id: string }).id;
    await dataExport.generate(await tenantIdOf(who.slug), exportId);
    const downloaded = await getBinary(port, `/exports/${exportId}/download`, shop);
    expect(downloaded.status).toBe(200);
    const files = filesIn(downloaded.body);
    expect(csvRows(files.get('order-payments.csv'))).toEqual([
      expect.objectContaining({
        orderNumber: order.orderNumber,
        status: 'verified',
        method: 'bkash',
        amount: '300.00',
        transactionId: 'EXPORT1234',
        senderNumber: '01811000002',
      }),
    ]);
    expect(JSON.parse(files.get('order-payments.json') ?? '[]')).toHaveLength(1);
    expect(csvRows(files.get('wallet-accounts.csv'))).toEqual([
      expect.objectContaining({
        method: 'bkash',
        accountName: 'Rahim Store',
        number: '01711000001',
        active: 'true',
        hasCredentials: 'true',
      }),
    ]);
    expect(JSON.parse(files.get('wallet-accounts.json') ?? '[]')).toEqual([
      expect.objectContaining({ number: '01711000001', hasCredentials: true }),
    ]);
    // WAL-09: the keys stay sealed, in every file.
    for (const [name, content] of files) {
      expect(content, name).not.toContain(secret);
      expect(content, name).not.toContain('app-key-1');
    }
  });
});

describeIfDatabase('owner-only, never staff (LIF-16)', () => {
  it('refuses a staff member on every route, regardless of permissions held', async () => {
    const who = await owner();
    const staff = await viewerSession(who);

    const requested = await post('/exports', {}, staff);
    expect(requested.status).toBe(403);
    expect(errorOf(requested)).toMatchObject({ code: 'forbidden' });

    const listed = await get('/exports', staff);
    expect(listed.status).toBe(403);
  });
});

describeIfDatabase('cross-tenant isolation (TEN-03)', () => {
  it('refuses another shop’s export id with not_found, never its content', async () => {
    const mine = await owner();
    const theirs = await owner();
    const requested = await post('/exports', {}, shopCall(mine));
    const exportId = (requested.body as { id: string }).id;
    const tenantId = await tenantIdOf(mine.slug);
    await dataExport.generate(tenantId, exportId);

    const crossList = await get('/exports', shopCall(theirs));
    expect(crossList.body).toEqual([]);

    const crossDownload = await get(`/exports/${exportId}/download`, shopCall(theirs));
    expect(crossDownload.status).toBe(404);
  });
});
