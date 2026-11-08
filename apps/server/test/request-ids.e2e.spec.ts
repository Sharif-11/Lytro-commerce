import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { REQUEST_ID_PATTERN } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { ApiError } from '../src/common/api-error';
import { RequestErrors } from '../src/common/request-id/request-errors';
import { DrizzleRequestErrorStore } from '../src/database/adapters/request-errors.adapter';
import { FraudChecks } from '../src/modules/fraud-checks/services/fraud-checks';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson, postJson, sendExact, type HttpResult } from './support/http';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// API-27, D8-3, D8-21 to D8-23 (Phase 8 Slice 8.1, read agreed 2026-11-07): every answer carries a short request ID,
// its log lines carry it too, and a shop's server faults are kept for 7 days with their route and kind only.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_request_ids_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 40_000 });

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'request-ids-e2e-otp-secret-0123456789012345';
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

afterEach(() => {
  vi.restoreAllMocks();
});

interface KeptFault {
  id: string;
  tenant_id: string;
  request_id: string;
  method: string;
  route: string | null;
  status: number;
  kind: string;
}

function idOf(result: HttpResult): string {
  const id = result.headers['x-request-id'];
  expect(typeof id, 'the answer has no X-Request-Id').toBe('string');
  return id as string;
}

/** The fault kept for this request, waited for: it is written after the answer, on its own. */
async function keptFor(requestId: string): Promise<KeptFault | undefined> {
  for (let i = 0; i < 40; i += 1) {
    const { rows } = await admin.query<KeptFault>(
      'SELECT * FROM control.request_errors WHERE request_id = $1',
      [requestId],
    );
    if (rows[0]) return rows[0];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return undefined;
}

async function nothingKeptFor(requestId: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  const { rows } = await admin.query('SELECT 1 FROM control.request_errors WHERE request_id = $1', [
    requestId,
  ]);
  expect(rows).toHaveLength(0);
}

async function keptCount(tenantId: string): Promise<number> {
  const { rows } = await admin.query<{ n: string }>(
    'SELECT count(*) AS n FROM control.request_errors WHERE tenant_id = $1',
    [tenantId],
  );
  return Number(rows[0]?.n ?? 0);
}

/** What the server wrote to its log while `work` ran, the work's own result beside it. */
async function logged<T>(work: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = [];
  const capture = (chunk: unknown): boolean => {
    lines.push(String(chunk));
    return true;
  };
  const errors = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  const out = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
  try {
    const result = await work();
    // The fault is kept after the answer; give its write, or its warning, the moment it needs.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { result, lines };
  } finally {
    errors.mockRestore();
    out.mockRestore();
  }
}

const NOT_KEPT = "a server fault couldn't be kept for its shop";

function shop(): Promise<ShopClient> {
  return openShop(port, texts, 'rid');
}

describeIfDatabase('every answer carries a request ID (API-27, D8-21)', () => {
  it('puts a short ID in its form on a success, a 404, a 413, a refusal and a fault, a new one each time', async () => {
    const answers = [
      await sendExact(port, 'GET', '/health', undefined, {}),
      await getJson(port, '/no-such-route', { host: 'localhost' }),
      await postJson(
        port,
        '/auth/phone/code',
        { phone: 'x'.repeat(1_100_000) },
        { host: 'localhost' },
      ),
      await getJson(port, '/fraud-checks/rule', { host: 'localhost' }),
      await sendExact(port, 'GET', '/test-only/throw', undefined, {}),
    ];
    expect(answers.map((answer) => answer.status)).toEqual([200, 404, 413, 401, 500]);
    const ids = answers.map(idOf);
    for (const id of ids) expect(id).toMatch(REQUEST_ID_PATTERN);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never takes a client's own ID", async () => {
    const answer = await sendExact(port, 'GET', '/health', undefined, {
      'x-request-id': 'AAAA-AAAA',
    });
    expect(idOf(answer)).not.toBe('AAAA-AAAA');
    expect(idOf(answer)).toMatch(REQUEST_ID_PATTERN);
  });

  it("writes the ID into the fault's log line", async () => {
    const { result: answer, lines: written } = await logged(() =>
      sendExact(port, 'GET', '/test-only/throw', undefined, {}),
    );
    const id = idOf(answer);
    expect(
      written.some(
        (line) => line.includes(`[${id}]`) && line.includes('deliberate unhandled error'),
      ),
    ).toBe(true);
  });
});

describeIfDatabase("a shop's server faults are kept (D8-3, D8-22, D8-23)", () => {
  it('keeps an unexpected fault with its route pattern, method, status, kind and ID, never its message', async () => {
    const client = await shop();
    vi.spyOn(FraudChecks.prototype, 'rule').mockRejectedValue(
      new TypeError('cannot read the customer 01712345678 at Road 7, Mirpur'),
    );
    const answer = await client.get('/fraud-checks/rule');
    expect(answer.status).toBe(500);
    const id = idOf(answer);
    const kept = await keptFor(id);
    expect(kept).toMatchObject({
      tenant_id: client.tenantId,
      request_id: id,
      method: 'GET',
      route: '/api/v1/fraud-checks/rule',
      status: 500,
      kind: 'TypeError',
    });
    expect(JSON.stringify(kept)).not.toMatch(/01712345678|Mirpur/);
  });

  it('keeps the route it matched, never the address it was called at', async () => {
    const client = await shop();
    vi.spyOn(FraudChecks.prototype, 'latest').mockRejectedValue(new TypeError('boom'));
    const answer = await client.get('/fraud-checks?phone=01712345678');
    expect(answer.status).toBe(500);
    const kept = await keptFor(idOf(answer));
    expect(kept?.route).toBe('/api/v1/fraud-checks');
    expect(JSON.stringify(kept)).not.toContain('01712345678');
  });

  it("keeps a database fault with the database's own code", async () => {
    const client = await shop();
    const fromDatabase = Object.assign(
      new Error('duplicate key value violates (phone)=(01712345678)'),
      {
        code: '23505',
      },
    );
    vi.spyOn(FraudChecks.prototype, 'rule').mockRejectedValue(
      new Error('Failed query', { cause: fromDatabase }),
    );
    const answer = await client.get('/fraud-checks/rule');
    expect(answer.status).toBe(500);
    const kept = await keptFor(idOf(answer));
    expect(kept?.kind).toBe('Error 23505');
    expect(JSON.stringify(kept)).not.toContain('01712345678');
  });

  it('keeps a 503 by its message key', async () => {
    const client = await shop();
    vi.spyOn(FraudChecks.prototype, 'rule').mockRejectedValue(
      new ApiError('service_unavailable', 'AddressReadUnavailable', {}),
    );
    const answer = await client.get('/fraud-checks/rule');
    expect(answer.status).toBe(503);
    const kept = await keptFor(idOf(answer));
    expect(kept).toMatchObject({
      status: 503,
      kind: 'AddressReadUnavailable',
      tenant_id: client.tenantId,
    });
  });

  it('keeps no refusal', async () => {
    const client = await shop();
    const refused = await client.put('/fraud-checks/rule', { codOrders: 'yes', minAmount: null });
    expect(refused.status).toBe(400);
    const denied = await client.get('/fraud-checks?phone=0171');
    expect(denied.status).toBeGreaterThanOrEqual(400);
    expect(denied.status).toBeLessThan(500);
    const missing = await client.get(`/orders/${randomUUID()}`);
    expect(missing.status).toBe(404);
    await nothingKeptFor(idOf(refused));
    await nothingKeptFor(idOf(denied));
    await nothingKeptFor(idOf(missing));
    expect(await keptCount(client.tenantId)).toBe(0);
  });

  it('keeps no fault without a shop, though it is logged', async () => {
    const { result: answer, lines } = await logged(() =>
      sendExact(port, 'GET', '/test-only/throw', undefined, {}),
    );
    expect(answer.status).toBe(500);
    await nothingKeptFor(idOf(answer));
    // Not even tried: a fault with no shop has nowhere to be kept.
    expect(lines.some((line) => line.includes(NOT_KEPT))).toBe(false);
  });

  it("answers the same when a fault can't be kept", async () => {
    const client = await shop();
    vi.spyOn(DrizzleRequestErrorStore.prototype, 'record').mockRejectedValue(
      new Error('the database is gone'),
    );
    vi.spyOn(FraudChecks.prototype, 'rule').mockRejectedValue(new TypeError('boom'));
    const { result: answer, lines } = await logged(() => client.get('/fraud-checks/rule'));
    expect(answer.status).toBe(500);
    // The failure to keep it is handled and said in the log, under the request's ID.
    expect(
      lines.some((line) => line.includes(NOT_KEPT) && line.includes(`[${idOf(answer)}]`)),
    ).toBe(true);
    expect(answer.envelope).toMatchObject({
      success: false,
      statusCode: 500,
      errors: { code: 'internal_error' },
    });
    expect(idOf(answer)).toMatch(REQUEST_ID_PATTERN);
  });

  it('clears faults past their 7 days and keeps the rest', async () => {
    const client = await shop();
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const { rows } = await admin.query<{ id: string; request_id: string }>(
      `INSERT INTO control.request_errors (tenant_id, request_id, method, route, status, kind, created_at)
       VALUES ($1, 'XDDD-2222', 'GET', '/api/v1/orders', 500, 'TypeError', $2),
              ($1, 'KEEP-3333', 'GET', '/api/v1/orders', 500, 'TypeError', $3)
       RETURNING id, request_id`,
      [client.tenantId, new Date(now - 8 * day), new Date(now - 6 * day)],
    );
    expect(rows).toHaveLength(2);
    const removed = await app.get(RequestErrors).purge(new Date(now));
    expect(removed).toBeGreaterThanOrEqual(1);
    const { rows: left } = await admin.query<{ request_id: string }>(
      'SELECT request_id FROM control.request_errors WHERE tenant_id = $1 ORDER BY request_id',
      [client.tenantId],
    );
    expect(left.map((row) => row.request_id)).toEqual(['KEEP-3333']);
    expect(await app.get(RequestErrors).purge(new Date(now))).toBe(0);
  });
});
