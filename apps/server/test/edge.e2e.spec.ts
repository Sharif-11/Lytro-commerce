import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { EDGE_HEADER } from '../src/common/guards/tenant.guard';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { prepareTestDatabase } from './support/database';
import { getJson, postJson } from './support/http';

// Every route except health refuses requests that did not come through the edge (R3), including sign-in routes.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_edge_test';
const EDGE_SECRET = 'edge-e2e-secret-0123456789abcdef0123';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'edge-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['TRUSTED_EDGE_SECRET'] = EDGE_SECRET;
  process.env['NODE_ENV'] = 'production';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue({ send: () => Promise.resolve() })
    .compile();
  app = moduleRef.createNestApplication();
  await app.listen(0, '127.0.0.1');
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
});

describeIfDatabase('the trusted edge on every route (R3, R6)', () => {
  it('refuses a sign-in request that did not come through the edge', async () => {
    const response = await postJson(port, '/auth/phone/code', { phone: '01711111111' });
    expect(response.status).toBe(403);
  });

  it('accepts the same request when it carries the edge secret', async () => {
    const response = await postJson(
      port,
      '/auth/phone/code',
      { phone: '01711111111' },
      { [EDGE_HEADER]: EDGE_SECRET },
    );
    expect(response.status).toBe(200);
  });

  it('keeps health open for load balancers without the edge secret', async () => {
    const response = await getJson(port, '/health');
    expect(response.status).toBe(200);
  });
});
