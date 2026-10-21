import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { sendExact } from './support/http';
import { openShop } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// RED-04, RTE-03 (KNOWN-GAPS §80): the API request counts this server has not yet stored -- they are flushed once a
// minute -- are stored when it stops, before its database pool closes. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_request_quota_shutdown_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const SITE = 'https://myshop.com';

let app: INestApplication;
let port: number;
let admin: pg.Client;
let stopped = false;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'request-quota-shutdown-e2e-otp-secret-0123456789';
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
  if (!stopped) await app.close();
  await admin.end();
});

async function storedRequests(tenantId: string): Promise<number> {
  const rows = await admin.query<{ requests: string }>(
    'SELECT coalesce(sum(requests), 0) AS requests FROM control.api_usage WHERE tenant_id = $1',
    [tenantId],
  );
  return Number(rows.rows[0]?.requests ?? 0);
}

describeIfDatabase('the request counts when the server stops (RED-04, KNOWN-GAPS §80)', () => {
  it('stores the counts not yet flushed before the database pool closes', async () => {
    const shop = await openShop(port, texts, 'stop');
    const made = await shop.post('/api-keys', { name: 'Website', websites: [SITE] });
    const { key } = made.body as { key: string };
    for (let call = 0; call < 3; call += 1) {
      const answer = await sendExact(port, 'GET', '/v1/shop', undefined, {
        host: 'api.localhost',
        authorization: `Bearer ${key}`,
        origin: SITE,
      });
      expect(answer.status).toBe(200);
    }
    // Flushed once a minute: none stored yet.
    expect(await storedRequests(shop.tenantId)).toBe(0);

    await app.close();
    stopped = true;
    expect(await storedRequests(shop.tenantId)).toBe(3);
  });
});
