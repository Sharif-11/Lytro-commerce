import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Quick add (TENANT-DASHBOARD-DESIGN §7.4b, the owner 2026-11-25): a new product's stock is one shared number by default
// (INV-24); POST products/:id/stock-split later splits it into each design's and size's own, by the seller's counts, and
// stops sharing -- the shared stock leaves its holder and each count arrives on its variant, in one transaction. Runs
// only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_stock_split_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'stock-split-e2e-otp-secret-0123456789abcd';
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

interface Product {
  id: string;
  sharedStock: boolean;
  variants: { id: string }[];
}

interface Stock {
  shared: { onHand: string } | null;
  variants: { variantId: string; onHand: string | null }[];
}

/** A shirt in three sizes sharing one stock of `shared`, as quick add saves it. */
async function sharedShirt(shop: ShopClient, shared: number): Promise<Product> {
  const rows = (await shop.get('/attributes')).body as {
    id: string;
    name: string;
    scope: string;
  }[];
  const size = rows.find((row) => row.name === 'Size' && row.scope === 'platform')?.id ?? '';
  const made = await shop.post(`/attributes/${size}/options/batch`, { values: ['S', 'M', 'L'] });
  const ids = (made.body as { id: string }[]).map((option) => option.id);
  const product = await shop.post('/products', {
    name: 'Shirt',
    basePrice: 450,
    variantAttributes: [{ attributeId: size, optionIds: ids }],
    variants: ids.map((id) => ({ optionIds: [id], packAmount: 1 })),
    sharedStock: true,
    sharedOpeningStock: shared,
  });
  expect(product.status, JSON.stringify(product.body)).toBe(201);
  return product.body as Product;
}

const stockOf = async (shop: ShopClient, id: string): Promise<Stock> =>
  (await shop.get(`/products/${id}/stock`)).body as Stock;

describeIfDatabase('quick add: a shared stock split into each size (§7.4b)', () => {
  it('moves the shared stock into each variant by the counts given, and stops sharing', async () => {
    const shop = await openShop(port, texts, 'split');
    const product = await sharedShirt(shop, 10);
    const [small = '', medium = '', large = ''] = product.variants.map((variant) => variant.id);
    const split = await shop.post(`/products/${product.id}/stock-split`, {
      counts: [
        { variantId: small, quantity: 4 },
        { variantId: medium, quantity: 6 },
        { variantId: large, quantity: 0 },
      ],
    });
    expect(split.status, JSON.stringify(split.body)).toBe(200);
    expect((split.body as Product).sharedStock).toBe(false);
    const stock = await stockOf(shop, product.id);
    expect(stock.shared).toBeNull();
    const by = (id: string) => stock.variants.find((row) => row.variantId === id)?.onHand;
    expect([by(small), by(medium), by(large)]).toEqual(['4.000', '6.000', '0.000']);
    // The holder's stock left with one movement; each count arrived with one, both as a split.
    const { rows } = await admin.query<{ delta: string; note: string }>(
      `SELECT m.delta::text AS delta, m.note FROM tenant.stock_movements m
         JOIN tenant.product_variants v ON v.id = m.variant_id AND v.tenant_id = m.tenant_id
        WHERE v.product_id = $1 AND m.note = 'Shared stock split' ORDER BY m.delta`,
      [product.id],
    );
    expect(rows.map((row) => Number(row.delta))).toEqual([-10, 4, 6]);
  });

  it('records a total that differs as it is', async () => {
    const shop = await openShop(port, texts, 'split-more');
    const product = await sharedShirt(shop, 5);
    const counts = product.variants.map((variant) => ({ variantId: variant.id, quantity: 3 }));
    const split = await shop.post(`/products/${product.id}/stock-split`, { counts });
    expect(split.status, JSON.stringify(split.body)).toBe(200);
    const stock = await stockOf(shop, product.id);
    expect(stock.variants.map((row) => row.onHand)).toEqual(['3.000', '3.000', '3.000']);
  });

  it('asks for every variant, whole pieces, and only a product that shares', async () => {
    const shop = await openShop(port, texts, 'split-refused');
    const product = await sharedShirt(shop, 6);
    const [small = '', medium = ''] = product.variants.map((variant) => variant.id);
    const missing = await shop.post(`/products/${product.id}/stock-split`, {
      counts: [
        { variantId: small, quantity: 2 },
        { variantId: medium, quantity: 2 },
      ],
    });
    expect(missing.status).toBe(400);
    expect(fieldsOf(missing)['counts']).toBeDefined();
    const half = await shop.post(`/products/${product.id}/stock-split`, {
      counts: product.variants.map((variant) => ({ variantId: variant.id, quantity: 1.5 })),
    });
    expect(half.status).toBe(400);
    expect(fieldsOf(half)['counts.0.quantity']).toBeDefined();
    // Nothing moved.
    expect((await stockOf(shop, product.id)).shared?.onHand).toBe('6.000');
    const done = await shop.post(`/products/${product.id}/stock-split`, {
      counts: product.variants.map((variant) => ({ variantId: variant.id, quantity: 2 })),
    });
    expect(done.status).toBe(200);
    const again = await shop.post(`/products/${product.id}/stock-split`, {
      counts: product.variants.map((variant) => ({ variantId: variant.id, quantity: 2 })),
    });
    expect(again.status).toBe(409);
    expect(errorOf(again).code).toBe('conflict');
  });

  it("keeps another shop's product as it is (SEC-02)", async () => {
    const shop = await openShop(port, texts, 'split-own');
    const other = await openShop(port, texts, 'split-other');
    const product = await sharedShirt(shop, 4);
    const taken = await other.post(`/products/${product.id}/stock-split`, {
      counts: product.variants.map((variant) => ({ variantId: variant.id, quantity: 1 })),
    });
    expect(taken.status).toBe(404);
    expect((await stockOf(shop, product.id)).shared?.onHand).toBe('4.000');
  });
});
