import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STOREFRONT_CATALOGUE_LISTS_MAX } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { sendExact, type HttpResult } from './support/http';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Load fix 3 (the owner, 2026-11-20): every product list a storefront page draws, in one call from the storefront's own
// server -- each answered exactly as GET /v1/catalogue/products answers it, a hidden category null among the rest,
// only for the holder of the storefront's secret, and taken once from the visitor's minute. Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_storefront_lists_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const SECRET = 'storefront-lists-e2e-secret-0123456789abcdefghijk';
const API_HOST = 'api.localhost';

let app: INestApplication;
let port: number;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'storefront-lists-e2e-otp-secret-0123456789abc';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['STOREFRONT_SECRET'] = SECRET;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  delete process.env['STOREFRONT_SECRET'];
  await app.close();
});

interface StorefrontShop {
  key: string;
  origin: string;
}
interface Page {
  products: { id: string; name: string }[];
  nextCursor: string | null;
}

/** The shop as the storefront's own server knows it: the key and website it calls the public API with. */
async function storefrontOf(shop: ShopClient): Promise<StorefrontShop> {
  const result = await sendExact(
    port,
    'GET',
    `/api/v1/internal/storefront/context?host=${encodeURIComponent(`${shop.slug}.localhost`)}`,
    undefined,
    { host: 'localhost', 'x-lytro-storefront': SECRET },
  );
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  const named = (result.body as { shop: StorefrontShop | null }).shop;
  if (!named) throw new Error('an open shop is named');
  return named;
}

function lists(
  shop: StorefrontShop,
  queries: string[],
  secret: string | null = SECRET,
): Promise<HttpResult> {
  return sendExact(
    port,
    'POST',
    '/v1/catalogue/lists',
    { queries },
    {
      host: API_HOST,
      authorization: `Bearer ${shop.key}`,
      origin: shop.origin,
      'content-type': 'application/json',
      ...(secret === null ? {} : { 'x-lytro-storefront': secret }),
    },
  );
}

function one(shop: StorefrontShop, query: string): Promise<HttpResult> {
  return sendExact(
    port,
    'GET',
    `/v1/catalogue/products${query === '' ? '' : `?${query}`}`,
    undefined,
    { host: API_HOST, authorization: `Bearer ${shop.key}`, origin: shop.origin },
  );
}

async function category(shop: ShopClient, name: string): Promise<{ id: string; slug: string }> {
  const made = await shop.post('/categories', { name });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as { id: string; slug: string };
}

async function product(shop: ShopClient, name: string, price: number, extra: object = {}) {
  const made = await shop.post('/products', {
    name,
    basePrice: price,
    variants: [{ optionIds: [], openingStock: 5 }],
    ...extra,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
}

describeIfDatabase("the storefront's lists in one call (load fix 3)", () => {
  it("answers each list as GET /v1/catalogue/products does, in order; a hidden or another shop's category is null", async () => {
    const shop = await openShop(port, texts, 'sf-lists');
    const other = await openShop(port, texts, 'sf-lists-other');
    const shirts = await category(shop, 'Shirts');
    const silks = await category(other, 'Silks');
    await product(shop, 'Linen shirt', 900, { categoryIds: [shirts.id] });
    await product(shop, 'Cotton shirt', 700, { categoryIds: [shirts.id] });
    await product(shop, 'Wool scarf', 400);
    await product(other, 'Silk scarf', 1200, { categoryIds: [silks.id] });
    const storefront = await storefrontOf(shop);
    const queries = [
      'sort=newest&limit=2',
      `category=${shirts.slug}`,
      'category=gone',
      `category=${silks.slug}`,
      '',
    ];
    const notFound = new Set([2, 3]);

    const batch = await lists(storefront, queries);
    expect(batch.status, JSON.stringify(batch.body)).toBe(200);
    const pages = (batch.body as { lists: { page: Page | null }[] }).lists.map((list) => list.page);
    expect(pages).toHaveLength(queries.length);
    for (const [index, query] of queries.entries()) {
      if (notFound.has(index)) {
        expect(pages[index]).toBeNull();
        expect((await one(storefront, query)).status).toBe(404);
        continue;
      }
      const single = await one(storefront, query);
      expect(single.status, JSON.stringify(single.body)).toBe(200);
      expect(pages[index]).toEqual(single.body);
    }
    expect(pages[1]?.products.map((card) => card.name).sort()).toEqual([
      'Cotton shirt',
      'Linen shirt',
    ]);
    // SEC-02: only the key's own shop's products; the other shop's never appear.
    expect(pages[4]?.products.map((card) => card.name).sort()).toEqual([
      'Cotton shirt',
      'Linen shirt',
      'Wool scarf',
    ]);
  });

  it("answers only the storefront's own server, by its secret, before counting anyone", async () => {
    const shop = await openShop(port, texts, 'sf-lists-secret');
    const storefront = await storefrontOf(shop);
    expect((await lists(storefront, ['sort=newest'], null)).status).toBe(404);
    expect((await lists(storefront, ['sort=newest'], `${SECRET}x`)).status).toBe(404);
    // Neither refusal took a place from the visitor's minute: the first call answered is the minute's first.
    const answered = await lists(storefront, ['sort=newest']);
    expect(answered.status).toBe(200);
    expect(Number(answered.headers['x-ratelimit-remaining'])).toBe(
      Number(answered.headers['x-ratelimit-limit']) - 1,
    );
  });

  it('takes one place from the visitor’s minute for the whole call, however many lists it holds', async () => {
    const shop = await openShop(port, texts, 'sf-lists-minute');
    const storefront = await storefrontOf(shop);
    const many = Array.from(
      { length: STOREFRONT_CATALOGUE_LISTS_MAX },
      (_, index) => `sort=newest&limit=${String(index + 1)}`,
    );
    const first = await lists(storefront, many);
    const second = await lists(storefront, many);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(Number(first.headers['x-ratelimit-remaining'])).toBe(
      Number(second.headers['x-ratelimit-remaining']) + 1,
    );
  });

  it('refuses more lists than one call takes, none at all, and a list GET would refuse', async () => {
    const shop = await openShop(port, texts, 'sf-lists-shape');
    const storefront = await storefrontOf(shop);
    const tooMany = Array.from({ length: STOREFRONT_CATALOGUE_LISTS_MAX + 1 }, () => 'sort=newest');
    expect((await lists(storefront, tooMany)).status).toBe(400);
    expect((await lists(storefront, [])).status).toBe(400);
    expect((await lists(storefront, ['sort=newest', 'limit=0'])).status).toBe(400);
    expect((await one(storefront, 'limit=0')).status).toBe(400);
  });
});
