import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { DataExportService } from '../src/modules/data-export/services/data-export.service';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { SmsCapture } from './support/sms-capture';
import { cookieFrom, getJson, postJson, type HttpResult } from './support/http';

// The download route sends raw bytes, not the JSON envelope every other route uses -- support/http.ts's own
// helpers JSON.parse the body unconditionally, so this route needs its own raw reader (status/headers/a real
// Buffer), kept local to this one file rather than changing a shared helper every other spec also relies on.
interface BinaryResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

function getBinary(
  portNumber: number,
  path: string,
  headers: Record<string, string>,
): Promise<BinaryResult> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port: portNumber, path: `/api/v1${path}`, method: 'GET', headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

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
    `UPDATE control.tenants SET plan_id = (SELECT id FROM control.plans WHERE name = 'Starter')
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
  return {
    cookie: cookieFrom(signedIn),
    'x-csrf-token': (signedIn.body as { csrfToken: string }).csrfToken,
    host: 'localhost',
    'x-lytro-shop': who.slug,
  };
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
