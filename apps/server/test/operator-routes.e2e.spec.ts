import 'dotenv/config';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { RequestMethod, type INestApplication } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryModule, DiscoveryService, MetadataScanner } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { OperatorSessionGuard } from '../src/modules/operator/guards/operator-session.guard';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { joinPath } from './isolation/inventory';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { sendExact } from './support/http';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 8's close-out (KNOWN-GAPS), built in Slice 9.7: every operator route, found in the running application rather
// than listed by hand, refuses a seller. Each is called with a signed-in seller's session, CSRF token and shop, and must
// answer 401 or 403: a new operator route that forgot its guard fails here.
const ADMIN = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_operator_routes_test';
const describeIfDatabase = ADMIN ? describe : describe.skip;
vi.setConfig({ hookTimeout: 180_000, testTimeout: 120_000 });

/**
 * Operator routes open by design. None today: the operator's sign-in and two-factor routes are under /auth/operator,
 * before any operator session exists. One added here is a decision, reviewed as such.
 */
const OPEN_OPERATOR_ROUTES: readonly string[] = [];

interface OperatorRoute {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  guarded: boolean;
}

const guardsOf = (target: object): unknown[] =>
  (Reflect.getMetadata(GUARDS_METADATA, target) as unknown[] | undefined) ?? [];

/** Every route under /operator the application registers, and whether the operator session guard covers it. */
function operatorRoutes(app: INestApplication): OperatorRoute[] {
  const discovery = app.get(DiscoveryService);
  const scanner = new MetadataScanner();
  const routes: OperatorRoute[] = [];
  for (const wrapper of discovery.getControllers()) {
    const instance = wrapper.instance as object | null;
    const metatype = wrapper.metatype as object | null;
    if (!instance || !metatype) continue;
    const classPath = (Reflect.getMetadata(PATH_METADATA, metatype) as string | undefined) ?? '';
    const prototype = Object.getPrototypeOf(instance) as object;
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = (prototype as Record<string, unknown>)[name];
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) continue;
      const path = joinPath(
        classPath,
        (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? '',
      );
      if (!path.startsWith('/operator')) continue;
      const guarded = [...guardsOf(metatype), ...guardsOf(handler)].includes(OperatorSessionGuard);
      routes.push({ method: RequestMethod[method] as OperatorRoute['method'], path, guarded });
    }
  }
  return routes.sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
}

let app: INestApplication | undefined;
let port: number;
let seller: ShopClient;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN) return;
  const urls = await prepareTestDatabase(ADMIN, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'operator-routes-e2e-otp-secret-0123456789';
  const moduleRef = await Test.createTestingModule({ imports: [DiscoveryModule, AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  seller = await openShop(port, texts, 'opr');
});

afterAll(async () => {
  await app?.close();
});

describeIfDatabase('every operator route refuses a seller (Slice 9.7)', () => {
  it('guards every operator route with the operator session', () => {
    if (!app) throw new Error('the application did not start');
    const routes = operatorRoutes(app);
    expect(routes.length).toBeGreaterThan(50);
    const open = routes
      .filter((route) => !route.guarded)
      .map((route) => `${route.method} ${route.path}`);
    expect(open).toEqual(OPEN_OPERATOR_ROUTES);
  });

  it("answers 401 or 403 to a seller's session on every one, and runs none", async () => {
    if (!app) throw new Error('the application did not start');
    const answered: string[] = [];
    const walked = operatorRoutes(app).filter(
      (each) => !OPEN_OPERATOR_ROUTES.includes(`${each.method} ${each.path}`),
    );
    expect(walked.length).toBeGreaterThan(50);
    for (const route of walked) {
      const path = `/api/v1${route.path.replace(/:[A-Za-z]+/g, randomUUID())}`;
      const body = route.method === 'GET' || route.method === 'DELETE' ? undefined : {};
      const answer = await sendExact(port, route.method, path, body, seller.headers());
      if (answer.status !== 401 && answer.status !== 403) {
        answered.push(`${route.method} ${route.path}: ${String(answer.status)}`);
      }
    }
    expect(answered).toEqual([]);
  });
});
