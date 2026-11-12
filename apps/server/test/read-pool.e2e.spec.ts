import 'dotenv/config';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CategoryRepository,
  ComboRepository,
  PublicCatalogueRepository,
  TransactionRunner,
} from '@lytronix/db';
import { EnvironmentParser } from '../src/config/env';
import { DrizzlePublicCatalogueStore } from '../src/database/adapters/public-catalogue.adapter';
import { DatabaseService } from '../src/database/database.service';
import { prepareTestDatabase, seedShop } from './support/database';

// Slice 9.2 (D9-13, DAT-44, DAT-45): with a read address set, the public catalogue's reads run on the read pool, as the
// read-only role, in read-only transactions that still set the shop. A lock or a write slipped into one is refused.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_read_pool_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let admin: pg.Client;
let database: DatabaseService;
let store: DrizzlePublicCatalogueStore;
let categories: CategoryRepository;
let shopId: string;

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl, readDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();
  shopId = await seedShop(admin, 'Read Pool', 'read-pool-shop');

  const env = new EnvironmentParser().parse({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: appDbUrl,
    DATABASE_READ_URL: readDbUrl,
    OTP_SECRET: 'read-pool-e2e-otp-secret-0123456789abcdef',
  });
  database = new DatabaseService(env);
  const transactions = new TransactionRunner();
  categories = new CategoryRepository(transactions);
  store = new DrizzlePublicCatalogueStore(
    database,
    transactions,
    new PublicCatalogueRepository(transactions),
    categories,
    new ComboRepository(transactions),
  );
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await database.onApplicationShutdown();
  await admin.end();
});

describeIfDatabase('the public catalogue on the read pool (D9-13)', () => {
  it('reads as the read-only role, through its own pool', async () => {
    expect(database.reads).not.toBe(database.handle);
    await expect(store.run((tx) => store.listCategories(tx, shopId))).resolves.toEqual([]);

    const sessions = await admin.query<{ usename: string }>(
      `SELECT DISTINCT usename FROM pg_stat_activity
       WHERE datname = current_database() AND application_name = 'lytronix-server-reads'`,
    );
    expect(sessions.rows).toEqual([{ usename: 'lytronix_read' }]);
  });

  it('refuses a lock slipped into a read, as it would a write', async () => {
    const refusal: unknown = await store
      .run((tx) => categories.lockCategories(tx, shopId))
      .then(
        () => null,
        (error: unknown) => error,
      );
    const cause: unknown = Reflect.get(Object(refusal), 'cause') ?? refusal;
    expect(String(Reflect.get(Object(cause), 'code'))).toBe('25006');
  });

  it('without a read address, reads share the write pool', () => {
    const env = new EnvironmentParser().parse({
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none',
      DATABASE_READ_URL: undefined,
      OTP_SECRET: 'read-pool-e2e-otp-secret-0123456789abcdef',
    });
    const single = new DatabaseService(env);
    expect(single.reads).toBe(single.handle);
    return single.onApplicationShutdown();
  });
});
