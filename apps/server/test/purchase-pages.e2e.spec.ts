import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 11.10: what the Purchases pages need of the server (its read, 2026-10-28). The list picks several
// statuses at once (Open: ordered and partly received); a purchase names its supplier by a name typed, found ignoring
// case or added, as Add stock's arrivals are; a purchase's items say how their product keeps stock, with each product's
// splits to name them. PUR-01, PUR-02, PUR-05, INV-12, INV-14. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_purchase_pages_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'purchase-pages-e2e-otp-secret-0123456789abc';
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

interface Purchase {
  id: string;
  status: string;
  supplier: { id: string; name: string | null } | null;
  items: {
    variantId: string;
    optionIds: string[];
    batchTracked: boolean;
    serialTracked: boolean;
    serialFormat: string;
  }[];
  products: { productId: string; splits: Split[] }[];
}

interface Product {
  id: string;
  variants: { id: string; optionIds: string[] }[];
}

async function product(shop: ShopClient, body: Record<string, unknown>): Promise<Product> {
  const result = await shop.post('/products', { basePrice: 100, ...body });
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return result.body as Product;
}

/** A product with one variant and no options. */
async function simple(shop: ShopClient, name: string, extra = {}): Promise<string> {
  const made = await product(shop, { name, variants: [{ optionIds: [] }], ...extra });
  return made.variants[0]?.id ?? '';
}

async function draft(shop: ShopClient, body: Record<string, unknown>): Promise<Purchase> {
  const result = await shop.post('/purchase-orders', body);
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return result.body as Purchase;
}

describeIfDatabase('the Purchases pages’ reads and writes (Slice 11.10)', () => {
  it('lists several statuses at once, as Open picks what is on order', async () => {
    const shop = await openShop(port, texts, 'purchase-open');
    const lamp = await simple(shop, 'Lamp');
    const kept = await draft(shop, { items: [{ variantId: lamp, quantity: 2 }] });
    const ordered = await draft(shop, { items: [{ variantId: lamp, quantity: 3 }] });
    expect((await shop.post(`/purchase-orders/${ordered.id}/place`, {})).status).toBe(200);
    // One more placed, and one of its four received: partly received.
    const partly = await draft(shop, { items: [{ variantId: lamp, quantity: 4 }] });
    const placed = (await shop.post(`/purchase-orders/${partly.id}/place`, {})).body as {
      items: { id: string }[];
    };
    const received = await shop.post(`/purchase-orders/${partly.id}/receipts`, {
      items: [{ itemId: placed.items[0]?.id, accepted: 1 }],
    });
    expect(received.status, JSON.stringify(received.body)).toBe(201);

    const open = (await shop.get('/purchase-orders?status=ordered,partially_received')).body as {
      purchaseOrders: { id: string; status: string }[];
    };
    expect(open.purchaseOrders.map((each) => [each.id, each.status]).sort()).toEqual(
      [
        [ordered.id, 'ordered'],
        [partly.id, 'partially_received'],
      ].sort(),
    );
    const one = (await shop.get('/purchase-orders?status=draft')).body as {
      purchaseOrders: { id: string }[];
    };
    expect(one.purchaseOrders.map((each) => each.id)).toEqual([kept.id]);
    expect((await shop.get('/purchase-orders?status=ordered,shipped')).status).toBe(400);
  });

  it('names its supplier by a name typed, found ignoring case or added, never both ways at once', async () => {
    const shop = await openShop(port, texts, 'purchase-typed');
    const lamp = await simple(shop, 'Lamp');
    const first = await draft(shop, {
      supplierName: 'Rahim Traders',
      items: [{ variantId: lamp, quantity: 2 }],
    });
    expect(first.supplier?.name).toBe('Rahim Traders');
    const again = await draft(shop, {
      supplierName: 'rahim traders',
      items: [{ variantId: lamp, quantity: 1 }],
    });
    expect(again.supplier?.id).toBe(first.supplier?.id);
    const suppliers = (await shop.get('/suppliers')).body as { suppliers: { name: string }[] };
    expect(suppliers.suppliers.map((each) => each.name)).toEqual(['Rahim Traders']);

    const changed = await shop.patch(`/purchase-orders/${first.id}`, {
      supplierName: 'Karim Garments',
    });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect((changed.body as Purchase).supplier?.name).toBe('Karim Garments');

    const both = await shop.post('/purchase-orders', {
      supplierId: first.supplier?.id,
      supplierName: 'Rahim Traders',
      items: [{ variantId: lamp, quantity: 1 }],
    });
    expect(both.status).toBe(400);
    expect(fieldsOf(both)).toHaveProperty('supplierName');
  });

  it('says how each item’s product keeps stock, with each product’s splits to name it', async () => {
    const shop = await openShop(port, texts, 'purchase-items');
    const rows = (await shop.get('/attributes')).body as {
      id: string;
      name: string;
      scope: string;
    }[];
    const size = rows.find((row) => row.name === 'Size' && row.scope === 'platform')?.id ?? '';
    const made = (await shop.post(`/attributes/${size}/options/batch`, { values: ['S', 'M'] }))
      .body as { id: string }[];
    const [small, medium] = made.map((option) => option.id);
    const shirt = await product(shop, {
      name: 'Shirt',
      variantAttributes: [{ attributeId: size, optionIds: [small, medium] }],
      variants: [{ optionIds: [small] }, { optionIds: [medium] }],
    });
    const cream = await simple(shop, 'Face cream', { batchTracked: true });
    const phone = await simple(shop, 'Phone', { serialTracked: true, serialFormat: 'imei' });
    const purchase = await draft(shop, {
      items: [
        {
          variantId: shirt.variants.find((each) => each.optionIds.includes(medium ?? ''))?.id,
          quantity: 4,
        },
        { variantId: cream, quantity: 12 },
        { variantId: phone, quantity: 5 },
      ],
    });
    expect(
      purchase.items.map((item) => [item.batchTracked, item.serialTracked, item.serialFormat]),
    ).toEqual([
      [false, false, 'any'],
      [true, false, 'any'],
      [false, true, 'imei'],
    ]);
    expect(purchase.items[0]?.optionIds).toEqual([medium]);
    // The shirt is named by its size, the options its items use; a product with no options has no splits.
    const splitsOf = (productId: string) =>
      purchase.products.find((each) => each.productId === productId)?.splits;
    expect(splitsOf(shirt.id)).toEqual([
      expect.objectContaining({ name: 'Size', options: [expect.objectContaining({ value: 'M' })] }),
    ]);
    expect(purchase.products).toHaveLength(3);
    expect(
      purchase.products.filter((each) => each.productId !== shirt.id).map((each) => each.splits),
    ).toEqual([[], []]);
    const read = (await shop.get(`/purchase-orders/${purchase.id}`)).body as Purchase;
    expect(read.products).toEqual(purchase.products);
  });
});
