import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { postJson } from './support/http';
import { errorOf, fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// INV-06 (fixes 2026-11-14, the owner): the product screen's quick stock boxes -- POST products/:id/stock-additions adds
// stock that arrived on several of a product's variants at once, each recorded as the single route records one (a
// purchase received in full), all in one transaction: one row refused refuses them all and names the row. Runs only
// when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_stock_additions_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'stock-additions-e2e-otp-secret-0123456789ab';
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

interface Stock {
  variants: { variantId: string; onHand: string }[];
}

interface Product {
  id: string;
  variants: { id: string }[];
}

interface Movement {
  delta: string;
  reason: string;
}

async function sizes(shop: ShopClient, values: string[]): Promise<{ size: string; ids: string[] }> {
  const rows = (await shop.get('/attributes')).body as {
    id: string;
    name: string;
    scope: string;
  }[];
  const size = rows.find((row) => row.name === 'Size' && row.scope === 'platform')?.id ?? '';
  const made = await shop.post(`/attributes/${size}/options/batch`, { values });
  return { size, ids: (made.body as { id: string }[]).map((option) => option.id) };
}

/** A shirt in three sizes, 2 of each in stock. */
async function shirt(shop: ShopClient, name = 'Shirt'): Promise<Product> {
  const { size, ids } = await sizes(shop, ['S', 'M', 'L']);
  const made = await shop.post('/products', {
    name,
    basePrice: 450,
    variantAttributes: [{ attributeId: size, optionIds: ids }],
    variants: ids.map((id) => ({ optionIds: [id], openingStock: 2 })),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as Product;
}

async function onHand(shop: ShopClient, productId: string): Promise<string[]> {
  const stock = (await shop.get(`/products/${productId}/stock`)).body as Stock;
  return stock.variants.map((row) => row.onHand);
}

function ids(product: Product): string[] {
  return product.variants.map((variant) => variant.id);
}

describeIfDatabase('quick stock boxes: stock added to several variants at once (INV-06)', () => {
  it('adds every row in one go, each recorded as stock received', async () => {
    const shop = await openShop(port, texts, 'quick-stock');
    const product = await shirt(shop);
    const [small = '', medium = '', large = ''] = ids(product);
    const added = await shop.post(`/products/${product.id}/stock-additions`, {
      additions: [
        { variantId: small, quantity: 5 },
        { variantId: large, quantity: 1 },
      ],
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const rows = (added.body as Stock).variants;
    expect(rows.find((row) => row.variantId === small)?.onHand).toBe('7.000');
    expect(rows.find((row) => row.variantId === medium)?.onHand).toBe('2.000');
    expect(rows.find((row) => row.variantId === large)?.onHand).toBe('3.000');
    const history = (await shop.get(`/products/${product.id}/variants/${small}/stock-history`))
      .body as { movements: Movement[] };
    expect(history.movements[0]).toMatchObject({ delta: '5.000', reason: 'purchase_receipt' });
  });

  it('refuses them all when one row is refused, naming the row', async () => {
    const shop = await openShop(port, texts, 'quick-stock-half');
    const product = await shirt(shop);
    const [small, medium] = ids(product);
    const half = await shop.post(`/products/${product.id}/stock-additions`, {
      additions: [
        { variantId: small, quantity: 4 },
        { variantId: medium, quantity: 1.5 },
      ],
    });
    expect(half.status, JSON.stringify(half.body)).toBe(400);
    expect(fieldsOf(half)).toEqual({ 'additions.1.quantity': 'not_allowed' });
    expect(errorOf(half).details).toMatchObject({ index: 1, variantId: medium });
    // The first row was not kept either.
    expect(await onHand(shop, product.id)).toEqual(['2.000', '2.000', '2.000']);

    const other = await shirt(shop, 'Other shirt');
    const foreignVariant = await shop.post(`/products/${product.id}/stock-additions`, {
      additions: [
        { variantId: small, quantity: 1 },
        { variantId: ids(other)[0], quantity: 1 },
      ],
    });
    expect(foreignVariant.status, JSON.stringify(foreignVariant.body)).toBe(404);
    expect(errorOf(foreignVariant).details).toMatchObject({ index: 1 });
    expect(await onHand(shop, product.id)).toEqual(['2.000', '2.000', '2.000']);
  });

  it('takes each variant once, and refuses a product made to order', async () => {
    const shop = await openShop(port, texts, 'quick-stock-rules');
    const product = await shirt(shop);
    const [small] = ids(product);
    const twice = await shop.post(`/products/${product.id}/stock-additions`, {
      additions: [
        { variantId: small, quantity: 1 },
        { variantId: small, quantity: 2 },
      ],
    });
    expect(fieldsOf(twice)).toEqual({ 'additions.1.variantId': 'not_allowed' });
    const none = await shop.post(`/products/${product.id}/stock-additions`, { additions: [] });
    expect(none.status).toBe(400);

    const made = await shop.post('/products', {
      name: 'Cake',
      basePrice: 900,
      stockTracking: 'not_tracked',
      variants: [{ optionIds: [] }],
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const cake = made.body as Product;
    const baked = await shop.post(`/products/${cake.id}/stock-additions`, {
      additions: [{ variantId: ids(cake)[0], quantity: 1 }],
    });
    expect(baked.status, JSON.stringify(baked.body)).toBe(409);
    expect(errorOf(baked).details).toMatchObject({ index: 0 });
  });

  it("never touches another shop's product, and needs inventory:manage", async () => {
    const shop = await openShop(port, texts, 'quick-stock-a');
    const product = await shirt(shop);
    const intruder = await openShop(port, texts, 'quick-stock-b');
    const foreign = await intruder.post(`/products/${product.id}/stock-additions`, {
      additions: [{ variantId: ids(product)[0], quantity: 9 }],
    });
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(404);
    expect(await onHand(shop, product.id)).toEqual(['2.000', '2.000', '2.000']);

    const reader = await staffWith(port, texts, admin, shop, ['inventory:read']);
    const refused = await postJson(
      port,
      `/products/${product.id}/stock-additions`,
      { additions: [{ variantId: ids(product)[0], quantity: 1 }] },
      reader,
    );
    expect(refused.status).toBe(403);
  });
});
