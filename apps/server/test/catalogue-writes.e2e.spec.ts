import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { errorOf, openShop } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Slice 9.10 (9.10's shakedown, the owner's yes of 2026-11-17): one shop's burst of catalogue changes no longer takes the
// connections every shop shares. A shop's changes wait their turn in memory, so none waits on the shop's catalogue lock
// while holding a connection; and a change whose turn the lock still holds elsewhere (another process's) gives up after
// its wait as "busy", freeing its connection, while other shops go on.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_catalogue_writes_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
let adminDbUrl: string;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  adminDbUrl = urls.adminDbUrl;
  const { appDbUrl } = urls;
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'catalogue-writes-e2e-otp-secret-0123456789';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  // A small pool, as each API process's is (5): the burst below is four times it.
  process.env['DATABASE_POOL_MAX'] = '3';
  admin = new pg.Client({ connectionString: adminDbUrl });
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
  delete process.env['DATABASE_POOL_MAX'];
});

/** How many of this database's connections are waiting on a lock right now. */
async function waitingOnLocks(watcher: pg.Client): Promise<number> {
  const result = await watcher.query<{ waiting: string }>(
    `SELECT count(*) AS waiting FROM pg_stat_activity
     WHERE datname = current_database() AND wait_event_type = 'Lock'`,
  );
  return Number(result.rows[0]?.waiting ?? 0);
}

describeIfDatabase("a shop's catalogue changes (Slice 9.10)", () => {
  it('a burst in one shop all saves, none waits on the lock holding a connection, and another shop goes on', async () => {
    const busy = await openShop(port, texts, 'burst');
    const other = await openShop(port, texts, 'other');
    const watcher = new pg.Client({ connectionString: adminDbUrl });
    await watcher.connect();
    let most = 0;
    const watching = { on: true };
    const watch = (async () => {
      while (watching.on) {
        most = Math.max(most, await waitingOnLocks(watcher));
      }
    })();
    try {
      const burst = Array.from({ length: 12 }, (_, n) =>
        busy.post('/products', { name: `Kurti ${String(n + 1)}`, basePrice: 450 + n }),
      );
      const reads = Array.from({ length: 4 }, () => other.get('/products'));
      const [made, read] = await Promise.all([Promise.all(burst), Promise.all(reads)]);
      expect(made.map((result) => result.status)).toEqual(Array.from({ length: 12 }, () => 201));
      expect(read.map((result) => result.status)).toEqual([200, 200, 200, 200]);
    } finally {
      watching.on = false;
      await watch;
      await watcher.end();
    }
    expect(most).toBe(0);
    const version = await admin.query<{ version: string }>(
      'SELECT version FROM tenant.catalogue_state WHERE tenant_id = $1',
      [busy.tenantId],
    );
    expect(Number(version.rows[0]?.version)).toBeGreaterThanOrEqual(12);
  });

  it('a change whose shop stays locked elsewhere answers busy after its wait, and saves once the lock is gone', async () => {
    const shop = await openShop(port, texts, 'locked');
    const other = await openShop(port, texts, 'free');
    const made = await shop.post('/products', { name: 'Panjabi', basePrice: 1200 });
    expect(made.status).toBe(201);
    const { id } = made.body as { id: string };

    // Another process's change of this shop, still running.
    const elsewhere = new pg.Client({ connectionString: adminDbUrl });
    await elsewhere.connect();
    await elsewhere.query('BEGIN');
    await elsewhere.query('SELECT 1 FROM tenant.catalogue_state WHERE tenant_id = $1 FOR UPDATE', [
      shop.tenantId,
    ]);
    try {
      const started = Date.now();
      const refused = await shop.patch(`/products/${id}`, { name: 'Panjabi, renamed' });
      const waited = Date.now() - started;
      expect(refused.status).toBe(503);
      expect(refused.headers['retry-after']).toBe('5');
      expect(errorOf(refused)).toMatchObject({
        code: 'service_unavailable',
        // The test shop's owner reads Bangla.
        message: 'সার্ভার এই মুহূর্তে খুব ব্যস্ত। একটু পরে আবার চেষ্টা করুন।',
      });
      expect(waited).toBeGreaterThanOrEqual(1_900);
      expect(waited).toBeLessThan(10_000);
      // Another shop's change never waited on this one.
      expect((await other.post('/products', { name: 'Saree', basePrice: 2500 })).status).toBe(201);
    } finally {
      await elsewhere.query('ROLLBACK');
      await elsewhere.end();
    }
    const saved = await shop.patch(`/products/${id}`, { name: 'Panjabi, renamed' });
    expect(saved.status).toBe(200);
    expect((saved.body as { name: string }).name).toBe('Panjabi, renamed');
  });
});
