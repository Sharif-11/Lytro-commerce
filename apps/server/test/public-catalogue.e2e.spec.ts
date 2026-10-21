import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PlatformSettingKey, PublicProductSort } from '@lytronix/validators';
import {
  PublicCatalogueRepository,
  type PublicProductFilter,
  type Transaction,
} from '@lytronix/db';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { PostgresCatalogueSearch } from '../src/database/adapters/public-catalogue.adapter';
import { PlatformLibraryService } from '../src/modules/catalogue/services/platform-library.service';
import { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import type { CatalogueSearch } from '../src/modules/public-api/ports/public-catalogue-store';
import { ApiKeyAuthenticator } from '../src/modules/public-api/services/api-key-authenticator';
import { CatalogueCache } from '../src/modules/public-api/services/catalogue-cache';
import { PublicCatalogue } from '../src/modules/public-api/services/public-catalogue';
import { CATALOGUE_CACHE_SETTINGS, CATALOGUE_SEARCH } from '../src/modules/public-api/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { sendExact, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 9a: the public catalogue on the API host -- the version, product lists by category, search and order
// a page at a time, a product's page by its link, the category tree -- with public fields only, from the memory cache
// keyed by the catalogue versions, with tags and browser lifetimes, behind the public key's gate. PRD-09, PRD-10,
// CCH-01 to CCH-06, CCH-08, CCH-11, CCH-12, ATR-07, LND-04, KNOWN-GAPS §66. Runs only when DATABASE_TEST_ADMIN_URL
// is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_public_catalogue_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const SITE = 'https://myshop.com';
const API_HOST = 'api.localhost';

/** Counts the list queries, so the coalescing test can see how many reached the database. */
class CountingSearch implements CatalogueSearch {
  calls = 0;

  constructor(private readonly inner: PostgresCatalogueSearch) {}

  listProducts(tx: Transaction, tenantId: string, filter: PublicProductFilter) {
    this.calls += 1;
    return this.inner.listProducts(tx, tenantId, filter);
  }
}

interface Card {
  id: string;
  slug: string;
  name: string;
  minPrice: string | null;
  maxPrice: string | null;
  stockState: string;
  image: unknown;
}

interface Page {
  products: Card[];
  nextCursor: string | null;
}

interface Detail {
  id: string;
  slug: string;
  name: string;
  options: { name: string; values: { id: string; value: string }[] }[];
  attributes: { name: string; values: string[] }[];
  variants: {
    id: string;
    optionIds: string[];
    price: string;
    stockState: string;
    available: boolean;
  }[];
}

interface Made {
  id: string;
  slug: string;
  variants: { id: string; optionIds: string[] }[];
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
let search: CountingSearch;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'public-catalogue-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    // The version is read again on every request here, so an edit shows at once instead of within two seconds.
    .overrideProvider(CATALOGUE_CACHE_SETTINGS)
    .useValue({ maxBytes: 100 * 1024 * 1024, maxEntryBytes: 10 * 1024 * 1024, versionMs: 1 })
    .overrideProvider(CATALOGUE_SEARCH)
    .useFactory({
      factory: (repository: PublicCatalogueRepository) => {
        search = new CountingSearch(new PostgresCatalogueSearch(repository));
        return search;
      },
      inject: [PublicCatalogueRepository],
    })
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

async function keyFor(shop: ShopClient): Promise<string> {
  const made = await shop.post('/api-keys', { name: 'Website', websites: [SITE] });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { key: string }).key;
}

function callApi(
  path: string,
  key: string,
  extra: Record<string, string> = {},
): Promise<HttpResult> {
  return sendExact(port, 'GET', path, undefined, {
    host: API_HOST,
    authorization: `Bearer ${key}`,
    origin: SITE,
    ...extra,
  });
}

async function page(key: string, query: string): Promise<Page> {
  const result = await callApi(`/v1/catalogue/products${query}`, key);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body as Page;
}

async function version(key: string): Promise<string> {
  return ((await callApi('/v1/catalogue/version', key)).body as { version: string }).version;
}

async function create(shop: ShopClient, body: Record<string, unknown>): Promise<Made> {
  const result = await shop.post('/products', body);
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return result.body as Made;
}

/** A product with one default variant. */
function simple(
  shop: ShopClient,
  name: string,
  price: number,
  extra: Record<string, unknown> = {},
) {
  return create(shop, { name, basePrice: price, variants: [{ optionIds: [] }], ...extra });
}

async function platformId(shop: ShopClient, name: string): Promise<string> {
  const rows = (await shop.get('/attributes')).body as {
    id: string;
    name: string;
    scope: string;
  }[];
  const found = rows.find((row) => row.name === name && row.scope === 'platform');
  if (!found) throw new Error(`no platform attribute ${name}`);
  return found.id;
}

async function optionIds(shop: ShopClient, attributeId: string, values: string[]) {
  const made = await shop.post(`/attributes/${attributeId}/options/batch`, { values });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { id: string }[]).map((option) => option.id);
}

async function category(shop: ShopClient, body: Record<string, unknown>) {
  const made = await shop.post('/categories', body);
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as { id: string; slug: string };
}

/** Every product a list shows, following its cursors. */
async function everyPage(key: string, query: string): Promise<Card[]> {
  const cards: Card[] = [];
  let cursor: string | null = null;
  do {
    const next: Page = await page(key, `${query}${cursor === null ? '' : `&cursor=${cursor}`}`);
    cards.push(...next.products);
    cursor = next.nextCursor;
  } while (cursor !== null);
  return cards;
}

describeIfDatabase('the public product list (PRD-09, CCH-11, CCH-12)', () => {
  it("lists only the key's shop's active products, with public fields only", async () => {
    const shop = await openShop(port, texts, 'pub-list');
    const other = await openShop(port, texts, 'pub-other');
    const key = await keyFor(shop);
    const shown = await simple(shop, 'Shown', 300);
    const hidden = await simple(shop, 'Hidden', 300);
    const archived = await simple(shop, 'Archived', 300);
    await simple(other, 'Elsewhere', 300);
    expect((await shop.patch(`/products/${hidden.id}`, { active: false })).status).toBe(200);
    expect((await shop.delete(`/products/${archived.id}`)).status).toBe(200);

    const listed = await callApi('/v1/catalogue/products', key, { 'x-lytro-shop': other.slug });
    expect(listed.status).toBe(200);
    const products = (listed.body as Page).products;
    expect(products.map((card) => card.id)).toEqual([shown.id]);
    expect(Object.keys(products[0] ?? {}).sort()).toEqual(
      ['id', 'image', 'maxPrice', 'minPrice', 'name', 'slug', 'stockState'].sort(),
    );
    expect(products[0]).toMatchObject({ minPrice: '300.00', maxPrice: '300.00', image: null });
  });

  it('pages through every product exactly once, in each order', async () => {
    const shop = await openShop(port, texts, 'pub-pages');
    const key = await keyFor(shop);
    const prices = [500, 150, 900, 150, 700, 300, 1200];
    const made: Made[] = [];
    for (const [index, price] of prices.entries()) {
      made.push(await simple(shop, `Item ${String(index)}`, price));
    }
    const ids = made.map((product) => product.id).sort();

    const newest = await everyPage(key, '?sort=newest&limit=3');
    expect(newest.map((card) => card.id)).toEqual(made.map((product) => product.id).reverse());
    const featured = await everyPage(key, '?limit=2');
    expect(featured.map((card) => card.id)).toEqual(newest.map((card) => card.id));
    const low = await everyPage(key, '?sort=price_low&limit=3');
    expect(low.map((card) => card.id).sort()).toEqual(ids);
    expect(low.map((card) => Number(card.minPrice))).toEqual([...prices].sort((a, b) => a - b));
    const high = await everyPage(key, '?sort=price_high&limit=4');
    expect(high.map((card) => Number(card.minPrice))).toEqual([...prices].sort((a, b) => b - a));
    expect(new Set(high.map((card) => card.id)).size).toBe(prices.length);
  });

  it('filters by a category, its subcategories included; a hidden or unknown one is not found', async () => {
    const shop = await openShop(port, texts, 'pub-cats');
    const key = await keyFor(shop);
    const clothing = await category(shop, { name: 'Clothing' });
    const shirts = await category(shop, { name: 'Shirts', parentId: clothing.id });
    const shoes = await category(shop, { name: 'Shoes' });
    const secret = await category(shop, { name: 'Secret', visible: false });
    const shirt = await simple(shop, 'Shirt', 400, { categoryIds: [shirts.id] });
    await simple(shop, 'Boot', 900, { categoryIds: [shoes.id] });
    await simple(shop, 'Hidden thing', 100, { categoryIds: [secret.id] });

    expect((await page(key, `?category=${clothing.slug}`)).products.map((card) => card.id)).toEqual(
      [shirt.id],
    );
    expect((await page(key, '')).products).toHaveLength(3);
    const hidden = await callApi(`/v1/catalogue/products?category=${secret.slug}`, key);
    expect(hidden.status).toBe(404);
    expect(errorOf(hidden).code).toBe('not_found');
    expect((await callApi('/v1/catalogue/products?category=nothing-here', key)).status).toBe(404);
  });

  it('searches names and descriptions in Bangla and English, by partial words and through a typo', async () => {
    const shop = await openShop(port, texts, 'pub-search');
    const key = await keyFor(shop);
    const bangla = await simple(shop, 'সুতি পাঞ্জাবি', 1500);
    const english = await simple(shop, 'Cotton Panjabi', 1600);
    const wallet = await simple(shop, 'Leather Wallet', 800, {
      description: 'Soft leather with a cotton lining.',
    });

    const ids = async (q: string) =>
      (await page(key, `?search=${encodeURIComponent(q)}`)).products.map((card) => card.id);
    expect(await ids('পাঞ্জা')).toEqual([bangla.id]);
    expect(await ids('panjbi')).toEqual([english.id]);
    expect(await ids('PAN')).toEqual([english.id]);
    expect(await ids('cotton')).toEqual([english.id, wallet.id]);
    expect(await ids('zzzz qqqq')).toEqual([]);
  });

  it('refuses a cursor made for another order, or by hand', async () => {
    const shop = await openShop(port, texts, 'pub-cursor');
    const key = await keyFor(shop);
    await simple(shop, 'One', 100);
    await simple(shop, 'Two', 200);
    const first = await page(key, '?sort=price_low&limit=1');
    expect(first.nextCursor).not.toBeNull();

    const other = await callApi(
      `/v1/catalogue/products?sort=newest&cursor=${first.nextCursor ?? ''}`,
      key,
    );
    expect(other.status).toBe(400);
    expect(fieldsOf(other)).toEqual({ cursor: 'invalid_format' });
    const forged = Buffer.from(JSON.stringify(['newest', "'; DROP", 'x'])).toString('base64url');
    expect((await callApi(`/v1/catalogue/products?sort=newest&cursor=${forged}`, key)).status).toBe(
      400,
    );
  });
});

describeIfDatabase('a product page (PRD-09, ATR-07, LND-04)', () => {
  it('shows public fields, its variants on sale, and a sold-out one marked unavailable', async () => {
    const shop = await openShop(port, texts, 'pub-detail');
    const key = await keyFor(shop);
    const size = await platformId(shop, 'Size');
    const [small, medium, large] = await optionIds(shop, size, ['S', 'M', 'L']);
    const fabric = await platformId(shop, 'Fabric');
    const [cotton] = await optionIds(shop, fabric, ['Cotton']);
    const shirt = await create(shop, {
      name: 'Shirt',
      basePrice: 450,
      lowStockThreshold: 2,
      variantAttributes: [{ attributeId: size, optionIds: [small, medium, large] }],
      attributes: [{ attributeId: fabric, role: 'informational', optionIds: [cotton] }],
      variants: [
        { optionIds: [small], openingStock: 10, sku: 'SECRET-S' },
        { optionIds: [medium], openingStock: 0, price: 500 },
        { optionIds: [large], openingStock: 4, active: false },
      ],
    });

    const answer = await callApi(`/v1/catalogue/products/${shirt.slug}`, key);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    const detail = answer.body as Detail;
    const variantOf = (option: string | undefined) =>
      detail.variants.find((variant) => variant.optionIds[0] === option);
    expect(detail.variants).toHaveLength(2);
    expect(variantOf(small)).toMatchObject({ price: '450.00', stockState: 'in', available: true });
    expect(variantOf(medium)).toMatchObject({
      price: '500.00',
      stockState: 'out',
      available: false,
    });
    expect(detail.options[0]?.values.map((value) => value.value)).toEqual(['S', 'M']);
    expect(detail.attributes).toEqual([
      expect.objectContaining({ name: 'Fabric', values: ['Cotton'] }),
    ]);
    const text = JSON.stringify(answer.body);
    for (const secret of ['SECRET-S', 'avgCost', 'lowStockThreshold', 'onHand', 'sku']) {
      expect(text).not.toContain(secret);
    }
  });

  it("offers a made-to-order product's variants, and its copy's, with no stock counted (INV-02)", async () => {
    const shop = await openShop(port, texts, 'pub-made');
    const key = await keyFor(shop);
    const size = await platformId(shop, 'Size');
    const [small, large] = await optionIds(shop, size, ['S', 'L']);
    const cake = await create(shop, {
      name: 'Birthday cake',
      basePrice: 1500,
      stockTracking: 'not_tracked',
      variantAttributes: [{ attributeId: size, optionIds: [small, large] }],
    });
    const detail = (await callApi(`/v1/catalogue/products/${cake.slug}`, key)).body as Detail;
    expect(detail.variants.map((variant) => [variant.stockState, variant.available])).toEqual([
      ['in', true],
      ['in', true],
    ]);

    const copied = await shop.post(`/products/${cake.id}/duplicate`, {});
    expect(copied.status, JSON.stringify(copied.body)).toBe(201);
    const copy = copied.body as Made;
    expect((await shop.patch(`/products/${copy.id}`, { active: true })).status).toBe(200);
    const copyDetail = (await callApi(`/v1/catalogue/products/${copy.slug}`, key)).body as Detail;
    expect(copyDetail.variants.every((variant) => variant.available)).toBe(true);
  });

  it("answers an old link with the current one; an inactive or another shop's product is not found", async () => {
    const shop = await openShop(port, texts, 'pub-links');
    const other = await openShop(port, texts, 'pub-links-b');
    const key = await keyFor(shop);
    const lamp = await simple(shop, 'Desk Lamp', 1200);
    const moved = await shop.put(`/products/${lamp.id}/slug`, { slug: 'reading-lamp' });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);

    const old = await callApi(`/v1/catalogue/products/${lamp.slug}`, key);
    expect(old.status).toBe(200);
    expect((old.body as Detail).slug).toBe('reading-lamp');
    expect((await callApi('/v1/catalogue/products/reading-lamp', key)).status).toBe(200);

    expect((await shop.patch(`/products/${lamp.id}`, { active: false })).status).toBe(200);
    expect((await callApi('/v1/catalogue/products/reading-lamp', key)).status).toBe(404);
    const theirs = await simple(other, 'Their lamp', 100);
    const notOurs = await callApi(`/v1/catalogue/products/${theirs.slug}`, key);
    expect(notOurs.status).toBe(404);
    expect(errorOf(notOurs).code).toBe('not_found');
  });
});

describeIfDatabase('the category tree (PRD-03)', () => {
  it('shows the visible categories as a tree; a hidden one hides everything under it', async () => {
    const shop = await openShop(port, texts, 'pub-tree');
    const key = await keyFor(shop);
    const clothing = await category(shop, { name: 'Clothing', sortOrder: 1 });
    const shirts = await category(shop, { name: 'Shirts', parentId: clothing.id });
    const formal = await category(shop, { name: 'Formal', parentId: shirts.id, visible: false });
    await category(shop, { name: 'Ties', parentId: formal.id });
    await category(shop, { name: 'Bags', sortOrder: 0 });

    const answer = await callApi('/v1/catalogue/categories', key);
    expect(answer.status).toBe(200);
    const names = (nodes: { name: string; children: unknown[] }[]): unknown =>
      nodes.map((node) => [
        node.name,
        names(node.children as { name: string; children: unknown[] }[]),
      ]);
    expect(
      names((answer.body as { categories: { name: string; children: unknown[] }[] }).categories),
    ).toEqual([
      ['Bags', []],
      ['Clothing', [['Shirts', []]]],
    ]);
  });
});

describeIfDatabase('freshness and caching (CCH-02 to CCH-06, CCH-08, RTE-04)', () => {
  it('shows an edit at once under a new version and tag; a matching tag gets 304 and is still counted', async () => {
    const shop = await openShop(port, texts, 'pub-fresh');
    const key = await keyFor(shop);
    const mug = await simple(shop, 'Mug', 250);
    const before = await version(key);

    const first = await callApi('/v1/catalogue/products', key);
    expect(first.headers['cache-control']).toBe('private, max-age=30, stale-while-revalidate=120');
    expect(first.headers['vary']).toBe('Origin, Authorization, Accept-Language');
    const tag = String(first.headers['etag']);
    const again = await callApi('/v1/catalogue/products', key, { 'if-none-match': tag });
    expect(again.status).toBe(304);
    expect(again.envelope).toBeUndefined();
    expect(Number(again.headers['x-ratelimit-remaining'])).toBe(
      Number(first.headers['x-ratelimit-remaining']) - 1,
    );

    expect((await shop.patch(`/products/${mug.id}`, { basePrice: 275 })).status).toBe(200);
    expect(await version(key)).not.toBe(before);
    const edited = await callApi('/v1/catalogue/products', key, { 'if-none-match': tag });
    expect(edited.status).toBe(200);
    expect((edited.body as Page).products[0]).toMatchObject({ minPrice: '275.00' });
    expect(edited.headers['etag']).not.toBe(tag);

    const detail = await callApi(`/v1/catalogue/products/${mug.slug}`, key);
    expect(detail.headers['cache-control']).toBe('private, max-age=60');
    const search = await callApi('/v1/catalogue/products?search=mug', key);
    expect(search.headers['cache-control']).toBe('private, max-age=30');
    const tree = await callApi('/v1/catalogue/categories', key);
    expect(tree.headers['cache-control']).toBe('private, max-age=300');
    const versioned = await callApi('/v1/catalogue/version', key);
    expect(versioned.headers['cache-control']).toBe('private, max-age=5');
  });

  it("follows the operator's lifetimes (CCH-03)", async () => {
    const shop = await openShop(port, texts, 'pub-ages');
    const key = await keyFor(shop);
    const lamp = await simple(shop, 'Lamp', 900);
    const settings = app.get(PlatformSettingsService);
    await settings.set(PlatformSettingKey.CatalogueDetailMaxAgeSeconds, 45, randomUUID());
    try {
      const detail = await callApi(`/v1/catalogue/products/${lamp.slug}`, key);
      expect(detail.headers['cache-control']).toBe('private, max-age=45');
    } finally {
      await settings.set(PlatformSettingKey.CatalogueDetailMaxAgeSeconds, 60, randomUUID());
    }
  });

  it('moves the version when a variant sells out, though another keeps the product in stock (CCH-08)', async () => {
    const shop = await openShop(port, texts, 'pub-state');
    const key = await keyFor(shop);
    const size = await platformId(shop, 'Size');
    const [small, medium] = await optionIds(shop, size, ['S', 'M']);
    const shirt = await create(shop, {
      name: 'Tee',
      basePrice: 300,
      lowStockThreshold: 2,
      variantAttributes: [{ attributeId: size, optionIds: [small, medium] }],
      variants: [
        { optionIds: [small], openingStock: 10 },
        { optionIds: [medium], openingStock: 5 },
      ],
    });
    const smallId = shirt.variants.find((variant) => variant.optionIds[0] === small)?.id ?? '';
    const mediumId = shirt.variants.find((variant) => variant.optionIds[0] === medium)?.id ?? '';
    const stock = (variantId: string, onHand: number) =>
      shop.put(`/products/${shirt.id}/variants/${variantId}/stock`, {
        onHand,
        reason: 'damaged_or_lost',
      });

    const start = await version(key);
    expect((await stock(smallId, 9)).status).toBe(200);
    expect(await version(key)).toBe(start);
    expect((await stock(mediumId, 0)).status).toBe(200);
    expect(await version(key)).not.toBe(start);
    expect((await page(key, '')).products[0]).toMatchObject({ stockState: 'in' });
    const detail = (await callApi(`/v1/catalogue/products/${shirt.slug}`, key)).body as Detail;
    expect(detail.variants.find((variant) => variant.id === mediumId)).toMatchObject({
      stockState: 'out',
      available: false,
    });
  });

  it('shares one entry whatever the order of parameters, unknown ones and cookies (CCH-03, CCH-13)', async () => {
    const shop = await openShop(port, texts, 'pub-keys');
    const key = await keyFor(shop);
    await simple(shop, 'Kettle', 1800);
    const first = await callApi('/v1/catalogue/products?sort=newest&limit=5', key);
    const kept = app.get(CatalogueCache).size().entries;
    const second = await callApi(
      '/v1/catalogue/products?utm_source=fb&limit=5&fbclid=abc&sort=newest&v=9.9',
      key,
      {
        cookie: 'session=whatever; _fbp=fb.1.2',
      },
    );
    expect(second.status).toBe(200);
    expect(second.headers['etag']).toBe(first.headers['etag']);
    expect(app.get(CatalogueCache).size().entries).toBe(kept);
  });

  it('runs one query for 200 requests that miss together (CCH-06)', async () => {
    const shop = await openShop(port, texts, 'pub-herd');
    await keyFor(shop);
    await simple(shop, 'Teapot', 2200);
    const apiShop = await app.get(ApiKeyAuthenticator).shopOf(shop.tenantId);
    if (!apiShop) throw new Error('no shop');
    const catalogue = app.get(PublicCatalogue);
    const before = search.calls;
    const query = { sort: PublicProductSort.PriceHigh, limit: 7 };
    const answers = await Promise.all(
      Array.from({ length: 200 }, () => catalogue.list(apiShop, query, 'bn')),
    );
    expect(search.calls - before).toBe(1);
    expect(new Set(answers.map((answer) => answer.etag)).size).toBe(1);
  });

  it("changes every shop's version when the operator edits the platform library (KNOWN-GAPS §66)", async () => {
    const one = await openShop(port, texts, 'pub-lib-a');
    const two = await openShop(port, texts, 'pub-lib-b');
    const [keyOne, keyTwo] = [await keyFor(one), await keyFor(two)];
    const [before1, before2] = [await version(keyOne), await version(keyTwo)];
    const material = await platformId(one, 'Material');
    await app
      .get(PlatformLibraryService)
      .updateAttribute(material, { retired: false }, { operatorId: randomUUID(), ip: null });
    expect(await version(keyOne)).not.toBe(before1);
    expect(await version(keyTwo)).not.toBe(before2);
    expect((await version(keyOne)).split('.')[1]).toBe((await version(keyTwo)).split('.')[1]);
  });
});
