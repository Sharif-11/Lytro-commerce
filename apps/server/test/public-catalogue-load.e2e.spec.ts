import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PublicProductSort, type PublicProductListQuery } from '@lytronix/validators';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { ApiKeyAuthenticator } from '../src/modules/public-api/services/api-key-authenticator';
import { cursorOf } from '../src/modules/public-api/services/catalogue-query';
import { PublicCatalogue } from '../src/modules/public-api/services/public-catalogue';
import type { ApiShop } from '../src/modules/public-api/types/public-api';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 9a, done when: a 50,000-product shop's pages, any of them, and its searches meet the response targets
// -- PRF-03's 500 ms for a read, CCH-12's 300 ms for a search, at the 95th percentile -- from PostgreSQL alone, each
// request a miss of the memory cache. Seeding takes a while, so it runs only with CATALOGUE_SLOW_TESTS=1 and
// DATABASE_TEST_ADMIN_URL set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const SLOW = process.env['CATALOGUE_SLOW_TESTS'] === '1';
const DB_NAME = 'lytronix_public_catalogue_load_test';
const describeIfSlow = ADMIN_URL && SLOW ? describe : describe.skip;
const PRODUCTS = 50_000;
const PAGE_TARGET_MS = 500;
const SEARCH_TARGET_MS = 300;

let app: INestApplication;
let port: number;
let admin: pg.Client;
let shop: ShopClient;
let apiShop: ApiShop;
let categorySlug: string;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL || !SLOW) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'catalogue-load-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  shop = await openShop(port, texts, 'load');
  const made = await shop.post('/categories', { name: 'Clothing' });
  const clothing = made.body as { id: string; slug: string };
  categorySlug = clothing.slug;
  // English and Bangla names, a description on every third, prices and states spread, one second apart.
  await admin.query(
    `INSERT INTO tenant.products
       (tenant_id, name, slug, description, base_price, min_price, max_price, stock_state, created_at)
     SELECT $1,
       (ARRAY['Cotton Panjabi', 'সুতি পাঞ্জাবি', 'Leather Wallet', 'Silk Saree', 'জামদানি শাড়ি',
              'Denim Jacket', 'Rice Cooker', 'Phone Cover'])[1 + i % 8] || ' ' || i,
       'item-' || i,
       CASE WHEN i % 3 = 0 THEN 'Soft cotton with a fine finish, number ' || i END,
       100 + (i * 37) % 5000, 100 + (i * 37) % 5000, 100 + (i * 37) % 5000,
       (ARRAY['in', 'low', 'out'])[1 + i % 3]::tenant.stock_state,
       now() - make_interval(secs => i)
     FROM generate_series(1, $2::int) AS i`,
    [shop.tenantId, PRODUCTS],
  );
  await admin.query(
    `INSERT INTO tenant.product_categories (tenant_id, product_id, category_id)
     SELECT tenant_id, id, $2 FROM tenant.products WHERE tenant_id = $1 AND slug ~ '[05]$'`,
    [shop.tenantId, clothing.id],
  );
  await admin.query('ANALYZE tenant.products');
  await admin.query('ANALYZE tenant.product_categories');
  const found = await app.get(ApiKeyAuthenticator).shopOf(shop.tenantId);
  if (!found) throw new Error('no shop');
  apiShop = found;
}, 300_000);

afterAll(async () => {
  if (!ADMIN_URL || !SLOW) return;
  await app.close();
  await admin.end();
});

/** How long each request takes, each a miss: no two ask the same thing. */
async function timings(queries: PublicProductListQuery[]): Promise<number[]> {
  const catalogue = app.get(PublicCatalogue);
  const taken: number[] = [];
  for (const query of queries) {
    const started = performance.now();
    await catalogue.list(apiShop, query, 'bn');
    taken.push(performance.now() - started);
  }
  return taken;
}

function percentile95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
}

/** The cursor that starts a page right after the product at `offset` in this order, read from the database. */
async function cursorAt(sort: PublicProductSort, offset: number): Promise<string> {
  const orders: Partial<Record<PublicProductSort, { position: string; order: string }>> = {
    [PublicProductSort.Featured]: {
      position: 'ARRAY[(-sort_order)::text, created_at::text, id::text]',
      order: '-sort_order DESC, created_at DESC, id DESC',
    },
    [PublicProductSort.Newest]: {
      position: 'ARRAY[created_at::text, id::text]',
      order: 'created_at DESC, id DESC',
    },
    [PublicProductSort.PriceLow]: {
      position: 'ARRAY[min_price::text, id::text]',
      order: 'min_price ASC, id ASC',
    },
    [PublicProductSort.PriceHigh]: {
      position: 'ARRAY[min_price::text, id::text]',
      order: 'min_price DESC, id DESC',
    },
  };
  const chosen = orders[sort];
  if (!chosen) throw new Error(`no position for ${sort}`);
  const row = await admin.query<{ position: string[] }>(
    `SELECT ${chosen.position} AS position FROM tenant.products
     WHERE tenant_id = $1 AND active AND deleted_at IS NULL
     ORDER BY ${chosen.order} OFFSET $2 LIMIT 1`,
    [shop.tenantId, offset],
  );
  const position = row.rows[0]?.position;
  if (!position) throw new Error(`no product at ${String(offset)}`);
  return cursorOf(sort, position);
}

describeIfSlow('a 50,000-product shop (CCH-11, CCH-12, PRF-03)', () => {
  it('answers any page of any order within the response target', async () => {
    const queries: PublicProductListQuery[] = [];
    for (const sort of [
      PublicProductSort.Featured,
      PublicProductSort.Newest,
      PublicProductSort.PriceLow,
      PublicProductSort.PriceHigh,
    ]) {
      queries.push({ sort, limit: 24 });
      for (const offset of [1_000, 25_000, 40_000, 49_900]) {
        queries.push({ sort, limit: 24, cursor: await cursorAt(sort, offset) });
      }
      queries.push({ sort, limit: 60, category: categorySlug });
    }
    const taken = await timings(queries);
    console.log(
      `catalogue pages: 95th percentile ${percentile95(taken).toFixed(1)} ms, slowest ` +
        `${Math.max(...taken).toFixed(1)} ms over ${String(taken.length)} pages`,
    );
    expect(percentile95(taken)).toBeLessThan(PAGE_TARGET_MS);
  });

  it('answers searches in both languages, partial words and typos within the search target', async () => {
    const words = [
      'cotton',
      'panjabi',
      'পাঞ্জাবি',
      'পাঞ্জা',
      'শাড়ি',
      'জামদানি',
      'wallet',
      'leathr',
      'saree',
      'sare',
      'denim jacket',
      'jacke',
      'rice',
      'cooker',
      'phone cover',
      'cover',
      'soft cotton',
      'finish',
      'silk',
      'সুতি',
      'item',
      'panj',
      'walle',
      'coton',
      'phone',
      'জামদা',
      'cotton panjabi 15',
      'number 30',
      'rice cooker 7',
      'denim',
    ];
    const taken = await timings(words.map((search) => ({ search, limit: 24 })));
    console.log(
      `catalogue search: 95th percentile ${percentile95(taken).toFixed(1)} ms, slowest ` +
        `${Math.max(...taken).toFixed(1)} ms over ${String(taken.length)} searches`,
    );
    expect(percentile95(taken)).toBeLessThan(SEARCH_TARGET_MS);
  });
});
