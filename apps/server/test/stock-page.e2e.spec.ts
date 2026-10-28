import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson } from './support/http';
import { openShop, staffWith as signInStaffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 11.9: the Stock page's read and the stock checks' own numbers. GET /inventory/stock lists a page of the
// shop's products, out and low first, each with its variants' stock, its name and its variant-defining attributes, the
// variants' options in the product's order; Low and Out pick the active products in that state; costs only for those
// who may manage stock; another shop's products never. Each shop's checks are numbered 1, 2, 3, and a check's lines
// carry what names them. INV-01, INV-07, INV-08, D3-9. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_stock_page_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'stock-page-e2e-otp-secret-0123456789abcdefg';
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

interface Split {
  attributeId: string;
  name: string;
  options: { id: string; value: string }[];
}

interface PageProduct {
  productId: string;
  name: string;
  active: boolean;
  stockTracking: string;
  state: string;
  batchTracked: boolean;
  serialTracked: boolean;
  serialFormat: string;
  splits: Split[];
  variants: {
    variantId: string;
    optionIds: string[];
    onHand: string | null;
    avgCost?: string | null;
  }[];
}

interface StockPage {
  products: PageProduct[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  counts: { all: number; low: number; out: number };
}

interface Product {
  id: string;
  variants: { id: string; optionIds: string[] }[];
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

async function options(shop: ShopClient, attributeId: string, values: string[]): Promise<string[]> {
  const made = await shop.post(`/attributes/${attributeId}/options/batch`, { values });
  return (made.body as { id: string }[]).map((option) => option.id);
}

async function create(shop: ShopClient, body: unknown): Promise<Product> {
  const result = await shop.post('/products', body);
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return result.body as Product;
}

/** A product with one default variant, this much opening stock, low at 2 or under. */
function simple(
  shop: ShopClient,
  name: string,
  openingStock: number,
  extra = {},
): Promise<Product> {
  return create(shop, {
    name,
    basePrice: 100,
    lowStockThreshold: 2,
    variants: [{ optionIds: [], openingStock }],
    ...extra,
  });
}

async function stockPage(shop: ShopClient, query = ''): Promise<StockPage> {
  const result = await shop.get(`/inventory/stock${query}`);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body as StockPage;
}

describeIfDatabase('the Stock page (Slice 11.9, INV-01, INV-08)', () => {
  it('lists the products out and low first, each variant named in its product’s order of attributes', async () => {
    const shop = await openShop(port, texts, 'stock-page');
    const size = await platformId(shop, 'Size');
    const color = await platformId(shop, 'Color');
    const [small, medium] = await options(shop, size, ['S', 'M']);
    const [black] = await options(shop, color, ['Black']);
    // Colour first, then size: the product's own order, whatever its attributes' ids sort as.
    const shirt = await create(shop, {
      name: 'Shirt',
      basePrice: 450,
      lowStockThreshold: 2,
      variantAttributes: [
        { attributeId: color, optionIds: [black] },
        { attributeId: size, optionIds: [small, medium] },
      ],
      variants: [
        { optionIds: [black, small], openingStock: 10 },
        { optionIds: [black, medium], openingStock: 6 },
      ],
    });
    await simple(shop, 'Saree', 2);
    await simple(shop, 'Jacket', 0);
    await simple(shop, 'Scarf', 9);

    const page = await stockPage(shop);
    expect(page.products.map((product) => [product.name, product.state])).toEqual([
      ['Jacket', 'out'],
      ['Saree', 'low'],
      ['Scarf', 'in'],
      ['Shirt', 'in'],
    ]);
    expect(page).toMatchObject({ page: 1, limit: 20, total: 4, pages: 1 });
    expect(page.counts).toEqual({ all: 4, low: 1, out: 1 });

    const listed = page.products.find((product) => product.productId === shirt.id);
    expect(listed?.splits.map((split) => [split.name, split.options.map((o) => o.value)])).toEqual([
      ['Color', ['Black']],
      ['Size', ['S', 'M']],
    ]);
    // Each variant's options follow the splits: its colour, then its size.
    for (const each of listed?.variants ?? []) {
      expect(each.optionIds).toHaveLength(2);
      expect(listed?.splits[0]?.options.some((o) => o.id === each.optionIds[0])).toBe(true);
      expect(listed?.splits[1]?.options.some((o) => o.id === each.optionIds[1])).toBe(true);
    }
    // Listed as the product lists them: S, then M.
    expect(listed?.variants.map((each) => [each.optionIds[1], each.onHand])).toEqual([
      [small, '10.000'],
      [medium, '6.000'],
    ]);
    // A product with no options has no splits and one variant with none.
    expect(page.products[0]?.splits).toEqual([]);
    expect(page.products[0]?.variants[0]?.optionIds).toEqual([]);
  });

  it('puts a product with one size low among those wanting attention, though another keeps it in stock', async () => {
    const shop = await openShop(port, texts, 'stock-attention');
    const size = await platformId(shop, 'Size');
    const [small, large] = await options(shop, size, ['S', 'L']);
    await simple(shop, 'Scarf', 9);
    await create(shop, {
      name: 'Kurti',
      basePrice: 900,
      lowStockThreshold: 2,
      variantAttributes: [{ attributeId: size, optionIds: [small, large] }],
      variants: [
        { optionIds: [small], openingStock: 1 },
        { optionIds: [large], openingStock: 8 },
      ],
    });
    await simple(shop, 'Lamp', 6);
    const page = await stockPage(shop);
    expect(page.products.map((product) => [product.name, product.state])).toEqual([
      ['Kurti', 'in'],
      ['Lamp', 'in'],
      ['Scarf', 'in'],
    ]);
    // Low counts the products themselves, as the Products list does.
    expect(page.counts).toEqual({ all: 3, low: 0, out: 0 });
  });

  it('says how each product keeps its stock, so a row opens the sheets it has', async () => {
    const shop = await openShop(port, texts, 'stock-kept');
    await simple(shop, 'Face cream', 4, { batchTracked: true });
    await simple(shop, 'Phone', 0, { serialTracked: true, serialFormat: 'imei' });
    await simple(shop, 'Mug', 3);
    const page = await stockPage(shop);
    const kept = Object.fromEntries(
      page.products.map((product) => [
        product.name,
        [product.batchTracked, product.serialTracked, product.serialFormat],
      ]),
    );
    expect(kept).toEqual({
      'Face cream': [true, false, 'any'],
      Phone: [false, true, 'imei'],
      Mug: [false, false, 'any'],
    });
  });

  it('finds by name, picks the active ones that are low or out, and pages them', async () => {
    const shop = await openShop(port, texts, 'stock-filters');
    await simple(shop, 'Silk saree', 1);
    await simple(shop, 'Cotton saree', 9);
    await simple(shop, 'Hoodie', 0);
    await simple(shop, 'Old hoodie', 0, { active: false });

    const sarees = await stockPage(shop, '?search=saree');
    expect(sarees.products.map((product) => product.name).sort()).toEqual([
      'Cotton saree',
      'Silk saree',
    ]);
    const low = await stockPage(shop, '?stock=low');
    expect(low.products.map((product) => product.name)).toEqual(['Silk saree']);
    // An inactive product is out of the Out list, as the Products list and Home count it, but on the page.
    const out = await stockPage(shop, '?stock=out');
    expect(out.products.map((product) => product.name)).toEqual(['Hoodie']);
    const all = await stockPage(shop);
    expect(all.counts).toEqual({ all: 4, low: 1, out: 1 });
    expect(all.products.find((product) => product.name === 'Old hoodie')?.active).toBe(false);

    const second = await stockPage(shop, '?page=2&limit=3');
    expect(second).toMatchObject({ page: 2, limit: 3, total: 4, pages: 2 });
    expect(second.products).toHaveLength(1);
    expect((await shop.get('/inventory/stock?stock=in')).status).toBe(400);
  });

  it('shows a made-to-order product as its own screen does', async () => {
    const shop = await openShop(port, texts, 'stock-made');
    await create(shop, {
      name: 'Custom panjabi',
      basePrice: 2500,
      stockTracking: 'not_tracked',
      variants: [{ optionIds: [] }],
    });
    const page = await stockPage(shop);
    expect(page.products[0]).toMatchObject({
      name: 'Custom panjabi',
      stockTracking: 'not_tracked',
    });
  });

  it('shows costs only to someone who may manage stock, and the page only to someone who may see it', async () => {
    const shop = await openShop(port, texts, 'stock-costs');
    await simple(shop, 'Lamp', 4);
    expect((await stockPage(shop)).products[0]?.variants[0]).toHaveProperty('avgCost');

    const reader = await signInStaffWith(port, texts, admin, shop, ['inventory:read']);
    const seen = await getJson(port, '/inventory/stock', reader);
    expect(seen.status).toBe(200);
    expect((seen.body as StockPage).products[0]?.variants[0]).not.toHaveProperty('avgCost');

    // A trial shop has two seats, the owner's and the reader's; another shop's staff member who may see only products.
    const other = await openShop(port, texts, 'stock-costs-other');
    const catalogueOnly = await signInStaffWith(port, texts, admin, other, ['products:read']);
    expect((await getJson(port, '/inventory/stock', catalogueOnly)).status).toBe(403);
  });

  it("never lists another shop's products", async () => {
    const mine = await openShop(port, texts, 'stock-mine');
    const theirs = await openShop(port, texts, 'stock-theirs');
    await simple(theirs, 'Their lamp', 3);
    await simple(mine, 'My lamp', 3);
    const page = await stockPage(mine);
    expect(page.products.map((product) => product.name)).toEqual(['My lamp']);
    expect(page.counts.all).toBe(1);
  });
});

describeIfDatabase("a shop's own stock check numbers (Slice 11.9, INV-07)", () => {
  it('numbers each shop’s checks 1, 2, 3 and names each line in its product’s order', async () => {
    const shop = await openShop(port, texts, 'check-numbers');
    const other = await openShop(port, texts, 'check-numbers-other');
    const size = await platformId(shop, 'Size');
    const color = await platformId(shop, 'Color');
    const [small] = await options(shop, size, ['S']);
    const [blue] = await options(shop, color, ['Blue']);
    const shirt = await create(shop, {
      name: 'Shirt',
      basePrice: 450,
      variantAttributes: [
        { attributeId: color, optionIds: [blue] },
        { attributeId: size, optionIds: [small] },
      ],
      variants: [{ optionIds: [blue, small], openingStock: 5 }],
    });
    const variantId = shirt.variants[0]?.id ?? '';
    const lamp = await simple(other, 'Lamp', 3);

    const numbers: number[] = [];
    for (const counted of [4, 4]) {
      const saved = await shop.post('/stock-checks', { lines: [{ variantId, counted }] });
      expect(saved.status, JSON.stringify(saved.body)).toBe(201);
      numbers.push((saved.body as { number: number }).number);
    }
    expect(numbers).toEqual([1, 2]);
    const theirs = await other.post('/stock-checks', {
      lines: [{ variantId: lamp.variants[0]?.id, counted: 3 }],
    });
    expect((theirs.body as { number: number }).number).toBe(1);

    const listed = (await shop.get('/stock-checks')).body as {
      checks: { id: string; number: number }[];
    };
    expect(listed.checks.map((check) => check.number)).toEqual([2, 1]);

    const first = listed.checks[1]?.id ?? '';
    const read = (await shop.get(`/stock-checks/${first}`)).body as {
      number: number;
      lines: { productId: string; optionIds: string[] }[];
      products: { productId: string; splits: Split[] }[];
    };
    expect(read.number).toBe(1);
    expect(read.products).toEqual([
      {
        productId: shirt.id,
        splits: [
          expect.objectContaining({
            name: 'Color',
            options: [expect.objectContaining({ value: 'Blue' })],
          }),
          expect.objectContaining({
            name: 'Size',
            options: [expect.objectContaining({ value: 'S' })],
          }),
        ],
      },
    ]);
    expect(read.lines[0]?.optionIds).toEqual([blue, small]);
  });
});
