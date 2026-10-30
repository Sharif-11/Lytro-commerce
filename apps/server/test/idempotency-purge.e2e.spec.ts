import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueName } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { IdempotencyService } from '../src/common/idempotency/idempotency.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { postJson } from './support/http';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// API-11, KNOWN-GAPS §106: an idempotency key and the reply stored for it -- for a staff order, the customer's name,
// phone and address -- live only their 24 hours; a daily job removes every key past them. Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_idempotency_purge_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'idempotency-purge-e2e-otp-secret-0123456789';
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

/** One fixed takeaway order a shop sends under any key, so a repeated key carries the same body. */
async function orderer(
  shop: ShopClient,
): Promise<(key: string) => Promise<{ status: number; replayed: boolean }>> {
  const made = await shop.post('/products', {
    name: 'Lamp',
    basePrice: 300,
    variants: [{ optionIds: [], openingStock: 20 }],
  });
  const variantId = (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '';
  const body = {
    customerName: 'Rahima Akter',
    phone: texts.freshPhone(),
    fulfilmentType: 'takeaway',
    items: [{ variantId, quantity: 1 }],
  };
  return async (key) => {
    const result = await postJson(port, '/orders', body, shop.headers({ 'idempotency-key': key }));
    return { status: result.status, replayed: result.headers['idempotent-replay'] === 'true' };
  };
}

async function keysOf(tenantId: string): Promise<string[]> {
  const result = await admin.query<{ key: string }>(
    'SELECT key FROM control.idempotency_keys WHERE tenant_id = $1 ORDER BY key',
    [tenantId],
  );
  return result.rows.map((row) => row.key);
}

describeIfDatabase('the daily purge of idempotency keys (API-11, KNOWN-GAPS §106)', () => {
  it('removes every key past its 24 hours with its stored reply, and keeps the ones still within them', async () => {
    const shop = await openShop(port, texts, 'idm');
    const order = await orderer(shop);
    const old = `old-${randomUUID()}`;
    const fresh = `fresh-${randomUUID()}`;
    expect((await order(old)).status).toBe(201);
    expect((await order(fresh)).status).toBe(201);
    await admin.query(
      "UPDATE control.idempotency_keys SET expires_at = now() - interval '1 second' WHERE key = $1",
      [old],
    );
    expect(await keysOf(shop.tenantId)).toEqual([fresh, old].sort());
    const gone = await app.get(IdempotencyService).purgeExpired(new Date());
    expect(gone).toBeGreaterThanOrEqual(1);
    expect(await keysOf(shop.tenantId)).toEqual([fresh]);
    expect(await app.get(IdempotencyService).purgeExpired(new Date())).toBe(0);
  });

  it('keeps replaying a key within its 24 hours; past them, the same key starts afresh', async () => {
    const shop = await openShop(port, texts, 'idm');
    const order = await orderer(shop);
    const key = randomUUID();
    expect(await order(key)).toEqual({ status: 201, replayed: false });
    await app.get(IdempotencyService).purgeExpired(new Date());
    expect(await order(key)).toEqual({ status: 201, replayed: true });
    await admin.query(
      "UPDATE control.idempotency_keys SET expires_at = now() - interval '1 second' WHERE key = $1",
      [key],
    );
    await app.get(IdempotencyService).purgeExpired(new Date());
    expect(await keysOf(shop.tenantId)).toEqual([]);
    expect(await order(key)).toEqual({ status: 201, replayed: false });
  });

  it('runs once a day, in the small hours in Asia/Dhaka', async () => {
    const scheduled = await admin.query<{ cron: string; timezone: string }>(
      'SELECT cron, timezone FROM pgboss.schedule WHERE name = $1',
      [QueueName.IdempotencyPurgeTick],
    );
    expect(scheduled.rows).toEqual([{ cron: '30 3 * * *', timezone: 'Asia/Dhaka' }]);
  });
});
