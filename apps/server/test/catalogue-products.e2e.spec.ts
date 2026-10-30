import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 1 over HTTP: products, their attributes and variants (PRD-01 to PRD-05, PRD-12 to PRD-16,
// ATR-01 to ATR-15, ATL-02 to ATL-04), the plan limit (PRD-04, ATR-12, DWN-07, TRL-03, PLN-19), the
// pay-as-you-go fee (PYG-16), link slugs (LND-04) and the catalogue version (CCH-02). Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_catalogue_products_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'catalogue-products-e2e-otp-secret-0123456789';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
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
});

interface Variant {
  id: string;
  optionIds: string[];
  price: string | null;
  effectivePrice: string;
  sku: string | null;
  deliveryCharge: string | null;
  effectiveDeliveryMode: string;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  oldSlugs: string[];
  description: string | null;
  basePrice: string;
  minPrice: string | null;
  maxPrice: string | null;
  deliveryMode: string;
  effectiveDeliveryMode: string;
  archived: boolean;
  categoryIds: string[];
  primaryCategoryId: string | null;
  variantAttributes: { attributeId: string; options: { id: string; value: string }[] }[];
  attributes: {
    attributeId: string;
    role: string;
    optionIds: string[];
    textValue: string | null;
  }[];
  variants: Variant[];
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

async function optionIds(
  shop: ShopClient,
  attributeId: string,
  values: string[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const value of values) {
    const made = await shop.post(`/attributes/${attributeId}/options`, { value });
    // A value the shop already has answers with the one to use.
    ids.push(
      made.status === 201
        ? (made.body as { id: string }).id
        : (errorOf(made).details as { optionId: string }).optionId,
    );
  }
  return ids;
}

async function create(shop: ShopClient, body: unknown): Promise<Product> {
  const result = await shop.post('/products', body);
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return result.body as Product;
}

/** A T-shirt split by Size (S, M, L) and Color (Red, Black): six variants. */
async function tShirt(shop: ShopClient, extra: Record<string, unknown> = {}) {
  const size = await platformId(shop, 'Size');
  const color = await platformId(shop, 'Color');
  const sizes = await optionIds(shop, size, ['S', 'M', 'L']);
  const colors = await optionIds(shop, color, ['Red', 'Black']);
  const product = await create(shop, {
    name: 'T-shirt',
    basePrice: 450,
    variantAttributes: [
      { attributeId: size, optionIds: sizes },
      { attributeId: color, optionIds: colors },
    ],
    ...extra,
  });
  return { product, size, color, sizes, colors };
}

async function version(tenantId: string): Promise<number> {
  const result = await admin.query<{ version: string }>(
    'SELECT version FROM tenant.catalogue_state WHERE tenant_id = $1',
    [tenantId],
  );
  return Number(result.rows[0]?.version ?? 0);
}

describeIfDatabase('creating a product (PRD-01, PRD-02, ATR-03, ATR-04)', () => {
  it('saves with only a name and a price, and gets one default variant, with no delivery charge of its own (DLV-03)', async () => {
    const shop = await openShop(port, texts, 'plain');
    const cell = await create(shop, { name: '18650 Cell', basePrice: 120 });
    expect(cell).toMatchObject({
      slug: '18650-cell',
      basePrice: '120.00',
      categoryIds: [],
      variantAttributes: [],
      // DLV-03: no delivery charge of its own unless given; the zone's applies.
      deliveryCharge: null,
    });
    expect(cell.variants).toHaveLength(1);
    expect(cell.variants[0]).toMatchObject({
      optionIds: [],
      effectivePrice: '120.00',
      deliveryCharge: null,
    });
  });

  it('refuses a missing name and a negative price with field errors', async () => {
    const shop = await openShop(port, texts, 'invalid');
    const refused = await shop.post('/products', { basePrice: -5 });
    expect(refused.status).toBe(400);
    expect(fieldsOf(refused)).toEqual({ name: 'required', basePrice: 'too_small' });
  });

  it('keeps a description exactly as typed: line breaks, emoji, Bangla, and markup as plain text', async () => {
    const shop = await openShop(port, texts, 'desc');
    const description = 'নতুন কালেকশন 🎉\nসাইজ: M, L\n<script>alert(1)</script>  ';
    expect(
      (await create(shop, { name: 'Panjabi', basePrice: 1800, description })).description,
    ).toBe(description);
  });

  it('gives a repeated name a numbered slug, Bangla names Bangla slugs, and other shops their own (PRD-02)', async () => {
    const one = await openShop(port, texts, 'slug-one');
    const two = await openShop(port, texts, 'slug-two');
    expect((await create(one, { name: '18650 Cell', basePrice: 120 })).slug).toBe('18650-cell');
    expect((await create(one, { name: '18650 Cell', basePrice: 120 })).slug).toBe('18650-cell-2');
    expect((await create(two, { name: '18650 Cell', basePrice: 120 })).slug).toBe('18650-cell');
    expect((await create(one, { name: 'জামদানি শাড়ি!', basePrice: 5000 })).slug).toBe(
      'জামদানি-শাড়ি',
    );
  });

  it('files a product under several categories, one of them primary, listed in each (PRD-15)', async () => {
    const shop = await openShop(port, texts, 'multi');
    const sale = (await shop.post('/categories', { name: 'Sale' })).body as { id: string };
    const phones = (await shop.post('/categories', { name: 'Electronics' })).body as { id: string };
    const charger = await create(shop, {
      name: 'Charger',
      basePrice: 600,
      categoryIds: [sale.id, phones.id],
      primaryCategoryId: phones.id,
    });
    expect(charger.primaryCategoryId).toBe(phones.id);
    for (const id of [sale.id, phones.id]) {
      const listed = (await shop.get(`/products?categoryId=${id}`)).body as {
        products: { id: string }[];
      };
      expect(listed.products.map((product) => product.id)).toEqual([charger.id]);
    }
    const strangers = await shop.post('/products', {
      name: 'Stray',
      basePrice: 1,
      categoryIds: ['00000000-0000-4000-8000-000000000000'],
    });
    expect(fieldsOf(strangers)).toEqual({ 'categoryIds.0': 'not_found' });
  });

  it('pre-selects Adjustable when a weight is given, and reads Default once no weight applies (PRD-16, ATR-13)', async () => {
    const shop = await openShop(port, texts, 'weight');
    const rice = await create(shop, { name: 'Rice 5kg', basePrice: 450, weightKg: 5 });
    expect(rice).toMatchObject({ deliveryMode: 'adjustable', effectiveDeliveryMode: 'adjustable' });
    const cleared = (await shop.patch(`/products/${rice.id}`, { weightKg: null })).body as Product;
    expect(cleared).toMatchObject({ deliveryMode: 'adjustable', effectiveDeliveryMode: 'default' });
  });
});

describeIfDatabase('variants (ATR-04 to ATR-06, ATR-11, ATR-13, ATR-14, ATL-02 to ATL-04)', () => {
  it('saves a T-shirt with Size × Color as six variants in one request, counted once (Slice 1 done-when)', async () => {
    const shop = await openShop(port, texts, 'tshirt');
    const { product } = await tShirt(shop);
    expect(product.variants).toHaveLength(6);
    expect(new Set(product.variants.map((variant) => variant.optionIds.join('|'))).size).toBe(6);
    const list = (await shop.get('/products')).body as {
      total: number;
      products: { variantCount: number }[];
    };
    expect(list.total).toBe(1);
    expect(list.products[0]?.variantCount).toBe(6);
  });

  it("keeps each variant's own price, weight and delivery charge, and the product's price range follows (ATR-05, ATR-13, DLV-03)", async () => {
    const shop = await openShop(port, texts, 'prices');
    const storage = await platformId(shop, 'Storage');
    const [small, big] = await optionIds(shop, storage, ['128 GB', '256 GB']);
    const phone = await create(shop, {
      name: 'Phone',
      basePrice: 25000,
      variantAttributes: [{ attributeId: storage, optionIds: [small, big] }],
      variants: [
        { optionIds: [small] },
        { optionIds: [big], price: 28000, sku: 'PH-256', weightKg: 0.4, deliveryCharge: 60 },
      ],
    });
    expect(phone).toMatchObject({ minPrice: '25000.00', maxPrice: '28000.00' });
    const bigOne = phone.variants.find((variant) => variant.optionIds[0] === big);
    const smallOne = phone.variants.find((variant) => variant.optionIds[0] === small);
    expect(bigOne).toMatchObject({ price: '28000.00', effectivePrice: '28000.00', sku: 'PH-256' });
    // DLV-03: a variant's own delivery charge is kept; the other has none of its own.
    expect(bigOne?.deliveryCharge).toBe('60.00');
    expect(smallOne?.deliveryCharge).toBeNull();
    expect(bigOne?.effectiveDeliveryMode).toBe('default');
  });

  it('refuses the same combination twice with conflict (ATR-06)', async () => {
    const shop = await openShop(port, texts, 'dupcombo');
    const size = await platformId(shop, 'Size');
    const [large] = await optionIds(shop, size, ['L']);
    const refused = await shop.post('/products', {
      name: 'Twice',
      basePrice: 100,
      variantAttributes: [{ attributeId: size, optionIds: [large] }],
      variants: [{ optionIds: [large] }, { optionIds: [large] }],
    });
    expect(refused.status).toBe(409);
    expect(fieldsOf(refused)).toEqual({ 'variants.1.optionIds': 'already_used' });
  });

  it('refuses a fourth variant-defining attribute and a 101st combination, saying what to do (ATR-14)', async () => {
    const shop = await openShop(port, texts, 'limits');
    const ids = await Promise.all(
      ['Size', 'Color', 'Fabric', 'Material'].map((name) => platformId(shop, name)),
    );
    const values = ['A', 'B', 'C', 'D', 'E'];
    const options: string[][] = [];
    for (const id of ids) options.push(await optionIds(shop, id, values));

    const four = await shop.post('/products', {
      name: 'Four ways',
      basePrice: 1,
      variantAttributes: ids.map((attributeId, index) => ({
        attributeId,
        optionIds: options[index],
      })),
    });
    expect(four.status).toBe(400);
    expect(fieldsOf(four)).toEqual({ variantAttributes: 'too_many' });

    // 5 × 5 × 5 = 125 combinations.
    const many = await shop.post('/products', {
      name: 'Too many',
      basePrice: 1,
      variantAttributes: ids
        .slice(0, 3)
        .map((attributeId, index) => ({ attributeId, optionIds: options[index] })),
    });
    expect(many.status).toBe(400);
    expect(fieldsOf(many)).toEqual({ variants: 'too_many' });
    expect(errorOf(many).message).toContain('100');
  });

  it('refuses an attribute that takes several values as variant-defining, and uses it to describe instead (ATR-01)', async () => {
    const shop = await openShop(port, texts, 'multi-val');
    const models = await platformId(shop, 'Compatible models');
    const phones = await optionIds(shop, models, ['iPhone 13', 'iPhone 14', 'iPhone 14 Pro']);
    const refused = await shop.post('/products', {
      name: 'Case',
      basePrice: 300,
      variantAttributes: [{ attributeId: models, optionIds: phones }],
    });
    expect(fieldsOf(refused)).toEqual({ 'variantAttributes.0.attributeId': 'not_allowed' });

    const caseProduct = await create(shop, {
      name: 'Case',
      basePrice: 300,
      attributes: [{ attributeId: models, role: 'informational', optionIds: phones }],
    });
    expect(caseProduct.variants).toHaveLength(1);
    expect(caseProduct.attributes[0]).toMatchObject({ role: 'informational', optionIds: phones });
  });

  it("refuses an option that is not the attribute's own", async () => {
    const shop = await openShop(port, texts, 'wrongopt');
    const size = await platformId(shop, 'Size');
    const color = await platformId(shop, 'Color');
    const [red] = await optionIds(shop, color, ['Red']);
    const refused = await shop.post('/products', {
      name: 'Mixed up',
      basePrice: 1,
      variantAttributes: [{ attributeId: size, optionIds: [red] }],
    });
    expect(fieldsOf(refused)).toEqual({ 'variantAttributes.0.optionIds.0': 'not_found' });
  });

  it('retires a combination no longer offered and brings the same variant back when it returns (ATR-11)', async () => {
    const shop = await openShop(port, texts, 'matrix');
    const { product, size, color, sizes, colors } = await tShirt(shop);
    const black = colors[1] ?? '';
    const blackIds = product.variants
      .filter((variant) => variant.optionIds.includes(black))
      .map((v) => v.id);

    const redOnly = await shop.put(`/products/${product.id}/variants`, {
      variantAttributes: [
        { attributeId: size, optionIds: sizes },
        { attributeId: color, optionIds: [colors[0]] },
      ],
    });
    expect((redOnly.body as Product).variants).toHaveLength(3);

    const back = (
      await shop.put(`/products/${product.id}/variants`, {
        variantAttributes: [
          { attributeId: size, optionIds: sizes },
          { attributeId: color, optionIds: colors },
        ],
      })
    ).body as Product;
    expect(back.variants).toHaveLength(6);
    const backBlack = back.variants
      .filter((variant) => variant.optionIds.includes(black))
      .map((v) => v.id);
    expect(backBlack.sort()).toEqual(blackIds.sort());
  });

  it('moves a describing attribute over to splitting, and back to one default variant', async () => {
    const shop = await openShop(port, texts, 'roles');
    const fabric = await platformId(shop, 'Fabric');
    const [cotton, silk] = await optionIds(shop, fabric, ['Cotton', 'Silk']);
    const scarf = await create(shop, {
      name: 'Scarf',
      basePrice: 700,
      attributes: [{ attributeId: fabric, role: 'informational', optionIds: [cotton] }],
    });
    const defaultId = scarf.variants[0]?.id;

    const split = (
      await shop.put(`/products/${scarf.id}/variants`, {
        variantAttributes: [{ attributeId: fabric, optionIds: [cotton, silk] }],
      })
    ).body as Product;
    expect(split.variants).toHaveLength(2);
    expect(split.attributes).toEqual([]);

    const unsplit = (await shop.put(`/products/${scarf.id}/variants`, { variantAttributes: [] }))
      .body as Product;
    expect(unsplit.variants.map((variant) => variant.id)).toEqual([defaultId]);
  });

  it('refuses a SKU another variant of the shop already has', async () => {
    const shop = await openShop(port, texts, 'sku');
    await create(shop, { name: 'One', basePrice: 1, variants: [{ optionIds: [], sku: 'SKU-1' }] });
    const refused = await shop.post('/products', {
      name: 'Two',
      basePrice: 1,
      variants: [{ optionIds: [], sku: 'SKU-1' }],
    });
    expect(refused.status).toBe(409);
    expect(fieldsOf(refused)).toEqual({ 'variants.0.sku': 'taken' });
    // The whole creation rolled back with it.
    expect(((await shop.get('/products?search=Two')).body as { total: number }).total).toBe(0);
  });
});

describeIfDatabase('describing attributes (ATR-08, ATL-02)', () => {
  it('stores informational values by type and a captured-at-order attribute with none', async () => {
    const shop = await openShop(port, texts, 'describe');
    const material = (await shop.post('/attributes', { name: 'Care', dataType: 'text' })).body as {
      id: string;
    };
    const note = (await shop.post('/attributes', { name: 'Name to print', dataType: 'text' }))
      .body as { id: string };
    const mug = await create(shop, {
      name: 'Mug',
      basePrice: 350,
      attributes: [
        { attributeId: material.id, role: 'informational', textValue: 'Hand wash only' },
        { attributeId: note.id, role: 'captured_at_order' },
      ],
    });
    expect(mug.attributes).toEqual([
      expect.objectContaining({
        attributeId: material.id,
        role: 'informational',
        textValue: 'Hand wash only',
      }),
      expect.objectContaining({ attributeId: note.id, role: 'captured_at_order', textValue: null }),
    ]);
    expect(mug.variants).toHaveLength(1);
  });

  it('refuses a value that does not fit the attribute, and an attribute that already splits the product', async () => {
    const shop = await openShop(port, texts, 'misfit');
    const warranty = await platformId(shop, 'Warranty');
    const size = await platformId(shop, 'Size');
    const [small] = await optionIds(shop, size, ['S']);
    expect(
      fieldsOf(
        await shop.post('/products', {
          name: 'Watch',
          basePrice: 1,
          attributes: [{ attributeId: warranty, role: 'informational', boolValue: true }],
        }),
      ),
    ).toEqual({ 'attributes.0': 'not_allowed' });

    const shirt = await create(shop, {
      name: 'Shirt',
      basePrice: 1,
      variantAttributes: [{ attributeId: size, optionIds: [small] }],
    });
    const refused = await shop.put(`/products/${shirt.id}/attributes`, {
      attributes: [{ attributeId: size, role: 'informational', optionIds: [small] }],
    });
    expect(fieldsOf(refused)).toEqual({ 'attributes.0.attributeId': 'not_allowed' });
  });
});

describeIfDatabase('the plan limit (PRD-04, ATR-12, DWN-07, TRL-03, PLN-19)', () => {
  it('stops a trial shop at 20 products, frees a place when one is archived', async () => {
    const shop = await openShop(port, texts, 'trial');
    for (let n = 1; n <= 20; n += 1)
      await create(shop, { name: `Item ${String(n)}`, basePrice: n });
    const refused = await shop.post('/products', { name: 'Item 21', basePrice: 21 });
    expect(refused.status).toBe(402);
    expect(errorOf(refused).code).toBe('plan_limit_reached');
    expect(errorOf(refused).details).toMatchObject({ products: 20 });
    expect((await shop.get('/products')).body).toMatchObject({
      productLimit: 20,
      counts: { total: 20 },
    });

    const first = (
      (await shop.get('/products?search=Item%201&limit=1')).body as { products: { id: string }[] }
    ).products[0];
    expect((await shop.delete(`/products/${first?.id ?? ''}`)).status).toBe(200);
    expect((await shop.post('/products', { name: 'Item 21', basePrice: 21 })).status).toBe(201);
  });

  it('restores an archived product only while there is room, and logs it (PRD-13, PRD-04)', async () => {
    const shop = await openShop(port, texts, 'restore');
    await admin.query(
      `INSERT INTO control.plan_limit_overrides (tenant_id, limit_key, value, reason, set_by)
       VALUES ($1, 'products', '2', 'test', gen_random_uuid())`,
      [shop.tenantId],
    );
    const kept = await create(shop, { name: 'Kept', basePrice: 1 });
    const filed = await create(shop, { name: 'Filed', basePrice: 1 });
    expect((await shop.delete(`/products/${filed.id}`)).status).toBe(200);
    const later = await create(shop, { name: 'Later', basePrice: 1 });

    const refused = await shop.post(`/products/${filed.id}/restore`, {});
    expect(refused.status).toBe(402);
    expect(errorOf(refused).code).toBe('plan_limit_reached');
    expect((await shop.get(`/products/${filed.id}`)).body).toMatchObject({ archived: true });

    expect((await shop.delete(`/products/${later.id}`)).status).toBe(200);
    const restored = await shop.post(`/products/${filed.id}/restore`, {});
    expect(restored.status, JSON.stringify(restored.body)).toBe(201);
    expect(restored.body).toMatchObject({ id: filed.id, archived: false, slug: filed.slug });
    const listed = (await shop.get('/products')).body as {
      products: { id: string }[];
      productLimit: number | null;
    };
    expect(listed.products.map((row) => row.id).sort()).toEqual([kept.id, filed.id].sort());
    // PRD-04: the list names the shop's own limit, its override counted, so a full shop says so before typing.
    expect(listed.productLimit).toBe(2);
    const logged = await admin.query(
      "SELECT summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'product_restored'",
      [shop.tenantId],
    );
    expect(logged.rows).toEqual([{ summary: { name: 'Filed' } }]);

    // A product not archived is left as it is, and nothing more is logged.
    expect((await shop.post(`/products/${kept.id}/restore`, {})).status).toBe(201);
    expect(
      (
        await admin.query(
          "SELECT 1 FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'product_restored'",
          [shop.tenantId],
        )
      ).rowCount,
    ).toBe(1);
  });

  it('keeps products over a lowered limit listed while refusing new ones, and unlimited never refuses', async () => {
    const shop = await openShop(port, texts, 'lowered');
    for (const name of ['A', 'B', 'C']) await create(shop, { name, basePrice: 1 });
    await admin.query(
      `INSERT INTO control.plan_limit_overrides (tenant_id, limit_key, value, reason, set_by)
       VALUES ($1, 'products', '2', 'test', gen_random_uuid())`,
      [shop.tenantId],
    );
    expect((await shop.post('/products', { name: 'D', basePrice: 1 })).status).toBe(402);
    expect(((await shop.get('/products')).body as { total: number }).total).toBe(3);

    await admin.query(
      "UPDATE control.plan_limit_overrides SET value = 'null' WHERE tenant_id = $1 AND limit_key = 'products'",
      [shop.tenantId],
    );
    expect((await shop.get('/products')).body).toMatchObject({ productLimit: null });
    expect((await shop.post('/products', { name: 'D', basePrice: 1 })).status).toBe(201);
  });
});

describeIfDatabase('the pay-as-you-go product fee (PYG-16)', () => {
  async function payAsYouGo(balance: string): Promise<ShopClient> {
    const shop = await openShop(port, texts, 'payg');
    await admin.query(
      `UPDATE control.tenants SET state = 'pay_as_you_go',
         plan_id = (SELECT id FROM control.plans WHERE name = 'Pay-as-you-go'), plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Pay-as-you-go')
       WHERE id = $1`,
      [shop.tenantId],
    );
    await seedBalance(admin, shop.tenantId, balance);
    return shop;
  }

  async function productFees(tenantId: string): Promise<{ amount: string; reference: unknown }[]> {
    const result = await admin.query<{ amount: string; reference: unknown }>(
      "SELECT amount, reference FROM tenant.balance_ledger WHERE tenant_id = $1 AND type = 'product_fee' ORDER BY id",
      [tenantId],
    );
    return result.rows;
  }

  it('charges once at creation however many variants, and nothing for later changes', async () => {
    const shop = await payAsYouGo('100.00');
    const { product, size, sizes, color, colors } = await tShirt(shop);
    expect(await productFees(shop.tenantId)).toEqual([
      { amount: '-10.00', reference: { productId: product.id } },
    ]);

    await shop.put(`/products/${product.id}/variants`, {
      variantAttributes: [
        { attributeId: size, optionIds: sizes },
        { attributeId: color, optionIds: colors.slice(0, 1) },
      ],
    });
    await shop.patch(`/products/${product.id}`, { basePrice: 500 });
    expect(await productFees(shop.tenantId)).toHaveLength(1);
  });

  it('refuses the product, and charges nothing, when the balance cannot pay the fee', async () => {
    const shop = await payAsYouGo('5.00');
    const refused = await shop.post('/products', { name: 'Unpaid', basePrice: 1 });
    expect(refused.status).toBe(429);
    expect(errorOf(refused).code).toBe('quota_exceeded');
    expect(((await shop.get('/products')).body as { total: number }).total).toBe(0);
    expect(await productFees(shop.tenantId)).toEqual([]);
  });
});

describeIfDatabase('editing, links and deleting (PRD-05, PRD-13, LND-04, CCH-02)', () => {
  it('records a price change with the old and new price, and moves the catalogue version', async () => {
    const shop = await openShop(port, texts, 'audit');
    const cap = await create(shop, { name: 'Cap', basePrice: 300 });
    const before = await version(shop.tenantId);
    const edited = (await shop.patch(`/products/${cap.id}`, { basePrice: 350, name: 'Blue cap' }))
      .body as Product;
    expect(edited).toMatchObject({
      name: 'Blue cap',
      slug: 'cap',
      basePrice: '350.00',
      minPrice: '350.00',
    });
    expect(await version(shop.tenantId)).toBe(before + 1);
    const log = await admin.query<{ summary: { oldPrice?: string; newPrice?: string } }>(
      "SELECT summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'product_updated'",
      [shop.tenantId],
    );
    expect(log.rows[0]?.summary).toMatchObject({ oldPrice: '300.00', newPrice: '350.00' });
  });

  it('keeps an old link leading to its product after a slug change, never to anyone else (LND-04)', async () => {
    const shop = await openShop(port, texts, 'links');
    const saree = await create(shop, { name: 'Saree', basePrice: 3000 });
    const other = await create(shop, { name: 'Lehenga', basePrice: 9000 });
    const moved = (await shop.put(`/products/${saree.id}/slug`, { slug: 'eid-saree' }))
      .body as Product;
    expect(moved).toMatchObject({ slug: 'eid-saree', oldSlugs: ['saree'] });

    const taken = await shop.put(`/products/${other.id}/slug`, { slug: 'saree' });
    expect(taken.status).toBe(409);
    expect(fieldsOf(taken)).toEqual({ slug: 'taken' });
    expect((await shop.post('/products', { name: 'Saree', basePrice: 1 })).body).toMatchObject({
      slug: 'saree-2',
    });

    const backAgain = (await shop.put(`/products/${saree.id}/slug`, { slug: 'saree' }))
      .body as Product;
    expect(backAgain).toMatchObject({ slug: 'saree', oldSlugs: ['eid-saree'] });
  });

  it('archives by default (hidden, still readable, no longer counted) and deletes for good on request (PRD-13)', async () => {
    const shop = await openShop(port, texts, 'delete');
    const kept = await create(shop, { name: 'Archived one', basePrice: 1 });
    const gone = await create(shop, { name: 'Gone one', basePrice: 1 });
    expect((await shop.delete(`/products/${kept.id}`)).status).toBe(200);
    expect(((await shop.get('/products')).body as { total: number }).total).toBe(1);
    expect((await shop.get(`/products/${kept.id}`)).body).toMatchObject({ archived: true });

    expect((await shop.delete(`/products/${gone.id}?hard=true`)).status).toBe(200);
    expect((await shop.get(`/products/${gone.id}`)).status).toBe(404);
    const rows = await admin.query('SELECT 1 FROM tenant.product_variants WHERE product_id = $1', [
      gone.id,
    ]);
    expect(rows.rowCount).toBe(0);
  });

  it('searches by name and pages 20 at a time (PRD-12)', async () => {
    const shop = await openShop(port, texts, 'search');
    // More than a trial's 20 products (TRL-03): this shop's limit is lifted (PLN-19).
    await admin.query(
      `INSERT INTO control.plan_limit_overrides (tenant_id, limit_key, value, reason, set_by)
       VALUES ($1, 'products', 'null', 'test', gen_random_uuid())`,
      [shop.tenantId],
    );
    for (let n = 1; n <= 22; n += 1)
      await create(shop, { name: `Cell ${String(n)}`, basePrice: 1 });
    await create(shop, { name: 'Charger', basePrice: 1 });
    const first = (await shop.get('/products?search=cell')).body as {
      products: unknown[];
      total: number;
      pages: number;
    };
    expect(first).toMatchObject({ total: 22, pages: 2 });
    expect(first.products).toHaveLength(20);
    expect(
      ((await shop.get('/products?search=cell&page=2')).body as { products: unknown[] }).products,
    ).toHaveLength(2);
  });

  it('filters by the segments, counting each over what the search and category pick (PRD-12, INV-08)', async () => {
    const shop = await openShop(port, texts, 'segments');
    const shelf = (await shop.post('/categories', { name: 'Shelf' })).body as { id: string };
    // Thresholds 5: in, low, out, an inactive one, another low one the search leaves out, and an archived one.
    const stocked = (name: string, openingStock: number, extra: Record<string, unknown> = {}) =>
      create(shop, { name, basePrice: 1, variants: [{ optionIds: [], openingStock }], ...extra });
    await stocked('Plenty tea', 20, { categoryIds: [shelf.id] });
    await stocked('Few tea', 2);
    await stocked('No tea', 0, { categoryIds: [shelf.id] });
    await stocked('Resting tea', 1, { active: false });
    await stocked('Sugar', 1);
    const old = await stocked('Old tea', 1);
    expect((await shop.delete(`/products/${old.id}`)).status).toBe(200);

    interface Page {
      products: { name: string }[];
      total: number;
      counts: { total: number; active: number; low: number; out: number; archived: number };
    }
    const page = async (query: string) => (await shop.get(`/products?${query}`)).body as Page;
    const names = async (query: string) =>
      (await page(query)).products.map((row) => row.name).sort();

    expect(await names('search=tea&active=true')).toEqual(['Few tea', 'No tea', 'Plenty tea']);
    expect(await names('search=tea&active=false')).toEqual(['Resting tea']);
    expect(await names('search=tea&active=true&stock=low')).toEqual(['Few tea']);
    expect(await names('search=tea&active=true&stock=out')).toEqual(['No tea']);
    // PRD-13: the archived ones, and only those, when asked for.
    expect(await names('search=tea&archived=true')).toEqual(['Old tea']);
    // The counts are the segments', whatever segment the page shows; Low and Out count active products, as Home does.
    const lowOnly = await page('search=tea&active=true&stock=low');
    expect(lowOnly.total).toBe(1);
    expect(lowOnly.counts).toEqual({ total: 4, active: 3, low: 1, out: 1, archived: 1 });
    expect((await page('')).counts).toEqual({ total: 5, active: 4, low: 2, out: 1, archived: 1 });
    expect((await page(`categoryId=${shelf.id}`)).counts).toEqual({
      total: 2,
      active: 2,
      low: 0,
      out: 1,
      archived: 0,
    });
    expect((await shop.get('/products?stock=plenty')).status).toBe(400);
    expect((await shop.get('/products?active=yes')).status).toBe(400);
  });
});

describeIfDatabase("one shop never reaches another's catalogue (SEC-02, TEN-03)", () => {
  it("answers not_found for another shop's product, category and attribute, and refuses their ids in a body", async () => {
    const owner = await openShop(port, texts, 'iso-a');
    const intruder = await openShop(port, texts, 'iso-b');
    const shelf = (await owner.post('/categories', { name: 'Shelf' })).body as { id: string };
    const blend = (await owner.post('/attributes', { name: 'Blend', dataType: 'enum_single' }))
      .body as { id: string };
    const [gold = ''] = await optionIds(owner, blend.id, ['Gold']);
    const product = await create(owner, { name: 'Secret', basePrice: 1, categoryIds: [shelf.id] });

    expect((await intruder.get(`/products/${product.id}`)).status).toBe(404);
    expect((await intruder.patch(`/products/${product.id}`, { name: 'Mine' })).status).toBe(404);
    expect((await intruder.delete(`/products/${product.id}?hard=true`)).status).toBe(404);
    expect((await intruder.put(`/products/${product.id}/slug`, { slug: 'mine' })).status).toBe(404);
    expect((await intruder.post(`/products/${product.id}/restore`, {})).status).toBe(404);
    expect(
      (await intruder.put(`/products/${product.id}/variants`, { variantAttributes: [] })).status,
    ).toBe(404);
    expect(
      (await intruder.put(`/products/${product.id}/attributes`, { attributes: [] })).status,
    ).toBe(404);
    expect((await intruder.patch(`/categories/${shelf.id}`, { name: 'Mine' })).status).toBe(404);
    expect((await intruder.delete(`/categories/${shelf.id}`)).status).toBe(404);
    expect(
      (await intruder.put(`/categories/${shelf.id}/attributes`, { attributeIds: [] })).status,
    ).toBe(404);
    expect((await intruder.patch(`/attributes/${blend.id}`, { name: 'Mine' })).status).toBe(404);
    expect(
      (await intruder.post(`/attributes/${blend.id}/options`, { value: 'Silver' })).status,
    ).toBe(404);
    expect(
      (await intruder.patch(`/attributes/${blend.id}/options/${gold}`, { value: 'x' })).status,
    ).toBe(404);

    const borrowing = await intruder.post('/products', {
      name: 'Borrowed',
      basePrice: 1,
      categoryIds: [shelf.id],
      variantAttributes: [{ attributeId: blend.id, optionIds: [gold] }],
    });
    expect(borrowing.status).toBe(400);
    expect(fieldsOf(borrowing)).toMatchObject({ 'categoryIds.0': 'not_found' });

    // And the owner's catalogue is untouched.
    expect((await owner.get(`/products/${product.id}`)).body).toMatchObject({
      name: 'Secret',
      slug: 'secret',
    });
    expect(((await intruder.get('/products')).body as { total: number }).total).toBe(0);
  });
});
