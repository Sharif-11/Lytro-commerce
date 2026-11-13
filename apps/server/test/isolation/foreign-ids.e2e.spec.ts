import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app/app.module';
import { MEDIA_STORAGE } from '../../src/modules/media/tokens';
import { SMS_PROVIDER } from '../../src/modules/shared/messaging/tokens';
import { listenOn } from '../support/bootstrap';
import { prepareTestDatabase } from '../support/database';
import { EveryKind, type Caller } from '../support/every-kind';
import { MemoryStorage } from '../support/memory-storage';
import type { ShopClient } from '../support/shop-client';
import { SmsCapture } from '../support/sms-capture';
import { listTenantRoutes } from './inventory';

// SEC-02 (Phase 9 Slice 9.7): every dashboard route that takes an ID, found in the running application rather than
// listed by hand, is called by one shop with another shop's real IDs and must answer exactly as it answers an ID that
// never existed: 404 not_found. The other shop's own call with the same IDs must find them, which proves each ID is a
// real row the route opens and not a guess that 404s anyway. A new route taking an ID fails here until the walk can
// reach it: a body when its body is checked before its ID, a table (support/every-kind.ts) when its ID names a new kind
// of row.
const ADMIN = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_foreign_ids_test';
const describeIfDatabase = ADMIN ? describe : describe.skip;
const STOREFRONT_SECRET = 'foreign-ids-e2e-storefront-secret-0123456789';
vi.setConfig({ hookTimeout: 180_000, testTimeout: 180_000 });

/** At most this many of a shop's rows tried for one ID: enough to show the walk is not one lucky row. */
const ROWS_PER_ID = 3;

/**
 * Route parameters that are a shop's own names for things, never a row's ID, so no other shop's value exists to send:
 * a courier's key, a wallet's, a sign-in provider's, a message event's. A route taking one is left out of the walk.
 */
const NAMED_PARAMS: Readonly<Record<string, string>> = {
  key: "a courier's key (steadfast, pathao, redx): the shop's own connection to it",
  method: "a wallet's key (bkash, nagad, ...): the shop's own settings for it",
  provider: "a sign-in provider's key: attached to the session's own account",
  event: "a message event's key: the shop's own template for it",
};

type Body = Readonly<Record<string, unknown>>;

/**
 * The body each route that checks its body before its ID is sent, so the walk reaches the ID. Any body the route
 * accepts will do: the call never gets further than the ID. A route missing here answers 400 and the walk says so. A
 * body naming the caller's own upload is a function of the caller, since another shop's upload is refused first.
 */
const BODIES: Readonly<Record<string, Body | ((by: Caller) => Body)>> = {
  'PATCH /addons/mine/:id': { renews: false },
  'PATCH /listener/devices/:id': { name: 'Counter phone' },
  'PATCH /orders/:id': { notes: 'Leave at the gate' },
  'PATCH /products/:id/serials/:serialId': { serial: 'SN-WALK-2' },
  'PATCH /roles/:id': { name: 'Picker' },
  'PATCH /staff/:id': { name: 'Packer' },
  'PATCH /tax-classes/:id': { rate: 7.5 },
  'POST /attributes/:id/options': { value: 'Linen' },
  'POST /attributes/:id/options/batch': { values: ['Wool'] },
  'POST /balance/top-up/:id/evidence': (by) => ({ evidenceKey: by.evidenceKey }),
  'POST /balance/top-up/:id/page': { from: 'balance' },
  'POST /billing/payments/:id/evidence': (by) => ({ evidenceKey: by.evidenceKey }),
  'POST /billing/payments/:id/page': { from: 'billing' },
  'POST /categories/:id/move': { parentId: null, afterId: null },
  'POST /customers/:id/password': { password: 'shopper-pass-2468' },
  'POST /orders/:id/calls': { outcome: 'no_answer' },
  'POST /orders/:id/cancel': { reason: 'duplicate' },
  'POST /orders/:id/override': { override: null },
  'POST /orders/:id/parcel/settle': { outcome: 'retry' },
  'POST /orders/:id/payments': { method: 'cash', amount: 1 },
  'POST /orders/:id/payments/:paymentId/refund': { note: 'Given back in cash' },
  'POST /orders/:id/payments/:paymentId/void': { reason: 'Entered twice' },
  'POST /orders/:id/returns': { items: [{ lineId: randomUUID(), sellable: 1, damaged: 0 }] },
  'POST /orders/:id/ship': { courierName: 'Steadfast', trackingCode: 'SF-1' },
  'POST /payments/:id/reject': { reason: 'no_payment_found' },
  'POST /products/:id/variants/:variantId/serials': { serials: ['SN-WALK-1'] },
  'POST /products/:id/variants/:variantId/stock-additions': { quantity: 1 },
  'POST /purchase-orders/:id/close': { reason: 'The supplier ran out' },
  'POST /purchase-orders/:id/receipts': { items: [{ itemId: randomUUID(), accepted: 1 }] },
  'POST /staff/:id/password': { newPassword: 'staff-pass-2468' },
  'PUT /categories/:id/attributes': { attributeIds: [] },
  'PUT /categories/:id/size-chart': { rows: [['S']] },
  'PUT /delivery-zones/:id/areas': { areas: {} },
  'PUT /payment-methods/accounts/:id/gateway': {
    appKey: 'key',
    appSecret: 'secret',
    username: 'user',
    password: 'pass',
    sandbox: true,
  },
  'PUT /products/:id/attributes': { attributes: [] },
  'PUT /products/:id/delivery-zones': { zoneIds: [] },
  'PUT /products/:id/images': { mediaIds: [] },
  'PUT /products/:id/size-chart': { rows: [['S']] },
  'PUT /products/:id/slug': { slug: 'walked' },
  // The one variant every seeded product has, named by no option, so the save keeps it.
  'PUT /products/:id/variants': { variantAttributes: [], variants: [{ optionIds: [] }] },
  'PUT /products/:id/variants/:variantId/cost': { avgCost: 100 },
  'PUT /products/:id/variants/:variantId/stock': { onHand: 10 },
  'PUT /products/:id/video': { mediaId: null },
};

/**
 * Routes whose answer to an ID that never existed is not 404, each with why. The other shop's IDs must still get that
 * same answer, so nothing tells them apart.
 */
const NOT_404: Readonly<Record<string, string>> = {
  'POST /payment-methods/accounts/:id/gateway/test':
    'an account the shop cannot open credentials for, missing or never given any, is one answer: 409, credentials needed',
};

interface Answer {
  status: number;
  code: string;
}

interface WalkedRoute {
  method: string;
  path: string;
  key: string;
  /** For each ID parameter in the path, the other shop's rows it is tried with. */
  params: { name: string; ids: string[] }[];
}

let app: INestApplication | undefined;
let port: number;
let admin: pg.Client;
let mine: Caller;
let theirs: Caller;
const texts = new SmsCapture();
const storage = new MemoryStorage();
let kinds: EveryKind;

beforeAll(async () => {
  if (!ADMIN) return;
  const urls = await prepareTestDatabase(ADMIN, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'foreign-ids-e2e-otp-secret-0123456789abcd';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['STOREFRONT_SECRET'] = STOREFRONT_SECRET;
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [DiscoveryModule, AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    // Uploads (a product photo, a payment's screenshot) land in memory, where the walk can put a file.
    .overrideProvider(MEDIA_STORAGE)
    .useValue(storage)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  kinds = new EveryKind(port, admin, texts, storage, STOREFRONT_SECRET);
  mine = await kinds.caller('fidmine');
  theirs = await kinds.caller('fidtheirs');
  await kinds.seed(theirs);
});

afterAll(async () => {
  if (!ADMIN) return;
  await app?.close();
  await admin.end();
  delete process.env['STOREFRONT_SECRET'];
});

/** Calls the dashboard API as one shop's owner, raw: some answers (a CSV, a file) are not JSON. */
function call(shop: ShopClient, method: string, path: string, body: unknown): Promise<Answer> {
  const data = body === undefined ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: `/api/v1${path}`,
        method,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(data),
          ...shop.headers(),
        },
      },
      (response) => {
        let text = '';
        response.on('data', (chunk: Buffer) => {
          text += chunk.toString();
        });
        response.on('end', () => {
          let code = '';
          try {
            const found = (JSON.parse(text) as { errors?: { code?: unknown } }).errors?.code;
            code = typeof found === 'string' ? found : '';
          } catch {
            code = '';
          }
          resolve({ status: response.statusCode ?? 0, code });
        });
      },
    );
    request.on('error', reject);
    request.end(data);
  });
}

const show = (answer: Answer): string => `${String(answer.status)} ${answer.code}`.trim();

/** Every combination of one row per parameter, in order. */
function combinations(params: WalkedRoute['params']): string[][] {
  return params.reduce<string[][]>(
    (sets, param) => sets.flatMap((set) => param.ids.map((id) => [...set, id])),
    [[]],
  );
}

function fill(path: string, ids: readonly string[]): string {
  let index = 0;
  return path.replace(/:[A-Za-z]+/g, () => ids[index++] ?? '');
}

function bodyOf(route: { method: string; key: string }, by: Caller): unknown {
  const body = BODIES[route.key];
  if (typeof body === 'function') return body(by);
  if (body) return body;
  return route.method === 'GET' || route.method === 'DELETE' ? undefined : {};
}

/** The routes to walk, and every route left out with why: a named parameter, or an ID the walk can't fill. */
async function plan(): Promise<{ walked: WalkedRoute[]; problems: string[] }> {
  if (!app) throw new Error('the application did not start');
  const walked: WalkedRoute[] = [];
  const problems: string[] = [];
  const routes = listTenantRoutes(app).filter(
    // The storefront's routes name their shop by the host they're called on, never by a session, and are left to the
    // isolation registry's own cases (registry.ts).
    (route) => route.includes('/:') && !route.includes(' /public/'),
  );
  for (const key of routes) {
    const [method = '', path = ''] = key.split(' ');
    const names = [...path.matchAll(/:([A-Za-z]+)/g)].map((match) => match[1] ?? '');
    if (names.some((name) => name in NAMED_PARAMS)) continue;
    const params: WalkedRoute['params'] = [];
    for (const name of names) {
      const upTo = path.slice(0, path.indexOf(`:${name}`) + name.length + 1);
      const ids = await kinds.idsFor(upTo, theirs.shop.tenantId, ROWS_PER_ID);
      if (typeof ids === 'string') problems.push(`${key}: ${ids}`);
      else params.push({ name, ids });
    }
    if (params.length === names.length) walked.push({ method, path, key, params });
  }
  return { walked, problems };
}

// Run after the other shop's own calls have read everything: deletes go last, deepest first.
function ownOrder(a: WalkedRoute, b: WalkedRoute): number {
  const rank = (route: WalkedRoute): number =>
    route.method === 'GET' ? 0 : route.method === 'DELETE' ? 2 : 1;
  const depth = (route: WalkedRoute): number => route.path.split('/').length;
  return (
    rank(a) - rank(b) || (rank(a) === 2 ? depth(b) - depth(a) : 0) || a.key.localeCompare(b.key)
  );
}

describeIfDatabase("every route taking an ID refuses another shop's IDs (SEC-02)", () => {
  it("answers another shop's real IDs exactly as IDs that never existed, and that shop's own call finds them", async () => {
    const { walked, problems } = await plan();

    // One shop with the other's IDs. Nothing here may change the other shop's rows: every answer is a refusal.
    for (const route of walked) {
      const body = bodyOf(route, mine);
      const never = await call(
        mine.shop,
        route.method,
        fill(
          route.path,
          route.params.map(() => randomUUID()),
        ),
        body,
      );
      if (never.status === 400 && never.code === 'validation_error') {
        problems.push(`${route.key}: checks its body first; give BODIES one it accepts`);
        continue;
      }
      if (never.status !== 404 && !(route.key in NOT_404)) {
        problems.push(`${route.key}: answers ${show(never)} to an ID that never existed`);
        continue;
      }
      for (const ids of combinations(route.params)) {
        const foreign = await call(mine.shop, route.method, fill(route.path, ids), body);
        if (show(foreign) !== show(never)) {
          problems.push(
            `${route.key}: answers ${show(foreign)} to the other shop's ${ids.join(', ')}, ${show(never)} to none`,
          );
        }
      }
    }

    // The other shop with its own IDs: at least one combination is found, so the walk sent real rows, and none fails
    // with a fault (a refusal, 4xx, still found the row first).
    for (const route of [...walked].sort(ownOrder)) {
      const answers: Answer[] = [];
      for (const ids of combinations(route.params)) {
        answers.push(
          await call(theirs.shop, route.method, fill(route.path, ids), bodyOf(route, theirs)),
        );
      }
      if (answers.every((answer) => answer.status === 404)) {
        problems.push(`${route.key}: the other shop's own call finds none of the IDs sent`);
      }
      const fault = answers.find((answer) => answer.status >= 500);
      if (fault) problems.push(`${route.key}: the other shop's own call fails with ${show(fault)}`);
    }

    expect(problems).toEqual([]);
    expect(walked.length).toBeGreaterThan(100);
  });
});
