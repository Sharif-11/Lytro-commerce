import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { OpenAPIObject } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiDocs } from '../src/app/api-docs';
import { AppModule } from '../src/app/app.module';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';

// The API docs are built as the server starts (main.ts, ApiDocs), from every DTO by Zod 4's own JSON Schema converter:
// one schema it can't write stops the server, and nothing else here builds them (Zod 4 upgrade, 2026-11-17, when a
// plain z.date() did). This builds them as main.ts does. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_api_docs_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'api-docs-e2e-otp-secret-0123456789abcdefghijk';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  ({ app } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
});

describeIfDatabase('the API docs (main.ts)', () => {
  it('builds from every route, a point in time written as an ISO 8601 string', () => {
    const document: OpenAPIObject = new ApiDocs().build(app);
    expect(Object.keys(document.paths).length).toBeGreaterThan(300);
    // A response's date (dateField) and a request's (coercedDateField) both read as a date-time string.
    const text = JSON.stringify(document);
    expect(text).toContain('"format":"date-time"');
    expect(text).not.toMatch(/"type":"Date"/);
  });
});
