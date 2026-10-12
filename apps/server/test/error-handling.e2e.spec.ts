import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { EDGE_HEADER } from '../src/common/guards/tenant.guard';
import { prepareTestDatabase } from './support/database';
import { getJson } from './support/http';

// An unhandled, non-ApiError exception must still answer the documented error shape, with nothing internal
// leaked (SEC-16, P1-N03) — even in a production-like configuration, and even to a request that claims to be
// a developer.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_error_handling_test';
const EDGE_SECRET = 'error-handling-e2e-secret-0123456789ab';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'error-handling-e2e-otp-secret-0123456789';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['TRUSTED_EDGE_SECRET'] = EDGE_SECRET;
  process.env['NODE_ENV'] = 'production';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.listen(0, '127.0.0.1');
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
});

describeIfDatabase('an unhandled exception (SEC-16, P1-N03)', () => {
  it('answers the documented shape, with no stack trace or path, in a production-like configuration', async () => {
    const response = await getJson(port, '/test-only/throw', { [EDGE_HEADER]: EDGE_SECRET });
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'internal_error',
        message: 'Something went wrong. Please try again.',
        details: {},
      },
    });
    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain('TypeError');
    expect(raw).not.toContain('.ts');
    expect(raw).not.toContain('at ');
  });

  it('leaks nothing extra to a request claiming to be a developer', async () => {
    const response = await getJson(port, '/test-only/throw', {
      [EDGE_HEADER]: EDGE_SECRET,
      'x-debug': 'true',
      'x-developer': 'true',
    });
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'internal_error',
        message: 'Something went wrong. Please try again.',
        details: {},
      },
    });
  });
});
