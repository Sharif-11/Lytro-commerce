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

// Phase 3 Slice 1 over HTTP: the shop-type presets (PST-01 to PST-03), the attribute library (ATL-01, ATR-01,
// ATR-10, UOM-02) and the category tree (PRD-03, ATR-02, ATL-05). Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_catalogue_library_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'catalogue-library-e2e-otp-secret-0123456789';
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

interface Attribute {
  id: string;
  name: string;
  dataType: string;
  scope: string;
  retired: boolean;
  options: { id: string; value: string; scope: string }[];
}

interface Category {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  depth: number;
  productCount: number;
  suggestedAttributeIds: string[];
}

async function attributes(shop: ShopClient, query = ''): Promise<Attribute[]> {
  return (await shop.get(`/attributes${query}`)).body as Attribute[];
}

async function platform(shop: ShopClient, name: string): Promise<Attribute> {
  const found = (await attributes(shop)).find(
    (row) => row.name === name && row.scope === 'platform',
  );
  if (!found) throw new Error(`no platform attribute ${name}`);
  return found;
}

async function category(shop: ShopClient, name: string, parentId?: string): Promise<Category> {
  const result = await shop.post('/categories', { name, ...(parentId ? { parentId } : {}) });
  expect(result.status).toBe(201);
  return result.body as Category;
}

describeIfDatabase('shop-type presets (PST-01 to PST-03)', () => {
  it('lists the eleven shop types the set-up step offers, each with its defaults', async () => {
    const shop = await openShop(port, texts, 'preset');
    const presets = (await shop.get('/presets')).body as {
      key: string;
      labelBn: string;
      defaults: {
        stockUnit: string;
        batchTracked: boolean;
        serialTracked: boolean;
        stockTracking: string;
      };
    }[];
    expect(presets.map((preset) => preset.key)).toEqual([
      'clothing',
      'shoes_bags',
      'cosmetics',
      'electronics',
      'mobiles_gadgets',
      'grocery',
      'food_bakery',
      'books_stationery',
      'pharmacy',
      'home_decor',
      'other',
    ]);
    const byKey = new Map(presets.map((preset) => [preset.key, preset]));
    expect(byKey.get('cosmetics')).toMatchObject({
      labelBn: 'কসমেটিক্স',
      defaults: { batchTracked: true },
    });
    expect(byKey.get('mobiles_gadgets')?.defaults.serialTracked).toBe(true);
    expect(byKey.get('grocery')?.defaults.stockUnit).toBe('kg');
    expect(byKey.get('pharmacy')?.defaults.stockUnit).toBe('box');
    expect(byKey.get('food_bakery')?.defaults.stockTracking).toBe('not_tracked');
  });

  it("starts a shop with no type on Other's defaults, and a chosen type sets the next product's (PST-02)", async () => {
    const shop = await openShop(port, texts, 'cosmetics');
    expect((await shop.get('/product-defaults')).body).toMatchObject({
      businessType: null,
      stockUnit: 'piece',
      batchTracked: false,
    });

    const chosen = await shop.put('/business-type', { businessType: 'cosmetics' });
    expect(chosen.status).toBe(200);
    const shade = await platform(shop, 'Shade');
    expect(chosen.body).toMatchObject({ businessType: 'cosmetics', batchTracked: true });
    expect((chosen.body as { suggestedAttributeIds: string[] }).suggestedAttributeIds[0]).toBe(
      shade.id,
    );

    const lipstick = await shop.post('/products', { name: 'Lipstick', basePrice: 450 });
    expect(lipstick.body).toMatchObject({ batchTracked: true, stockUnit: 'piece' });
    // Defaults only: a hair dryer in the same shop may say otherwise (PST-02).
    const dryer = await shop.post('/products', {
      name: 'Hair dryer',
      basePrice: 2500,
      batchTracked: false,
    });
    expect(dryer.body).toMatchObject({ batchTracked: false });

    // PST-03: changing the type never touches what exists.
    await shop.put('/business-type', { businessType: 'grocery' });
    const again = await shop.get(`/products/${(lipstick.body as { id: string }).id}`);
    expect(again.body).toMatchObject({ batchTracked: true, stockUnit: 'piece' });
    expect((await shop.post('/products', { name: 'Rice', basePrice: 90 })).body).toMatchObject({
      stockUnit: 'kg',
    });
  });

  it('refuses a type that is not a preset, and records the change in the activity log', async () => {
    const shop = await openShop(port, texts, 'badtype');
    const refused = await shop.put('/business-type', { businessType: 'spaceships' });
    expect(refused.status).toBe(400);
    expect(fieldsOf(refused)).toEqual({ businessType: 'not_found' });

    await shop.put('/business-type', { businessType: 'clothing' });
    const log = await admin.query<{ summary: unknown }>(
      "SELECT summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'business_type_changed'",
      [shop.tenantId],
    );
    expect(log.rows[0]?.summary).toEqual({ from: null, to: 'clothing' });
  });
});

describeIfDatabase('the attribute library (ATL-01, ATR-01, ATR-10, UOM-02)', () => {
  it("shows every shop the platform's attributes, and a shop's own only to that shop", async () => {
    const one = await openShop(port, texts, 'attr-one');
    const two = await openShop(port, texts, 'attr-two');
    expect((await platform(one, 'Size')).dataType).toBe('enum_single');
    expect((await platform(one, 'Compatible models')).dataType).toBe('enum_multi');

    const made = await one.post('/attributes', { name: 'Thread count', dataType: 'text' });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ name: 'Thread count', scope: 'shop', options: [] });
    expect((await attributes(one)).some((row) => row.name === 'Thread count')).toBe(true);
    expect((await attributes(two)).some((row) => row.name === 'Thread count')).toBe(false);
  });

  it("refuses a name the shop already sees, its own or the platform's, pointing at the one to use", async () => {
    const shop = await openShop(port, texts, 'attr-dup');
    const size = await platform(shop, 'Size');
    const refused = await shop.post('/attributes', { name: 'size', dataType: 'enum_single' });
    expect(refused.status).toBe(409);
    expect(fieldsOf(refused)).toEqual({ name: 'taken' });
    expect(errorOf(refused).details).toMatchObject({ attributeId: size.id });
  });

  it('asks what a number with a unit measures, and nothing else has a unit', async () => {
    const shop = await openShop(port, texts, 'attr-unit');
    expect(
      fieldsOf(await shop.post('/attributes', { name: 'Volume', dataType: 'number_with_unit' })),
    ).toEqual({
      unitKind: 'required',
    });
    expect(
      fieldsOf(
        await shop.post('/attributes', { name: 'Mood', dataType: 'text', unitKind: 'weight' }),
      ),
    ).toEqual({ unitKind: 'not_allowed' });
  });

  it('lets a shop add its own values to a platform attribute, seen only by it', async () => {
    const one = await openShop(port, texts, 'opt-one');
    const two = await openShop(port, texts, 'opt-two');
    const shade = await platform(one, 'Shade');
    const ruby = await one.post(`/attributes/${shade.id}/options`, { value: 'Ruby 05' });
    expect(ruby.status).toBe(201);
    expect(ruby.body).toMatchObject({ value: 'Ruby 05', scope: 'shop' });
    expect((await platform(one, 'Shade')).options.map((o) => o.value)).toContain('Ruby 05');
    expect((await platform(two, 'Shade')).options.map((o) => o.value)).not.toContain('Ruby 05');
    // The other shop may hold its own Ruby 05: values are unique within a shop, not across shops.
    expect((await two.post(`/attributes/${shade.id}/options`, { value: 'ruby 05' })).status).toBe(
      201,
    );
    // The same value twice in one shop points at the one already there.
    const again = await one.post(`/attributes/${shade.id}/options`, { value: 'RUBY 05' });
    expect(again.status).toBe(409);
    expect(errorOf(again).details).toMatchObject({ optionId: (ruby.body as { id: string }).id });
  });

  it('keeps a number with a unit as a number, sorted as one (UOM-02)', async () => {
    const shop = await openShop(port, texts, 'pack');
    const pack = await platform(shop, 'Pack size');
    for (const value of ['12', '6.0', '24']) {
      expect((await shop.post(`/attributes/${pack.id}/options`, { value })).status).toBe(201);
    }
    expect((await platform(shop, 'Pack size')).options.map((option) => option.value)).toEqual([
      '6',
      '12',
      '24',
    ]);
    expect(fieldsOf(await shop.post(`/attributes/${pack.id}/options`, { value: 'six' }))).toEqual({
      value: 'out_of_range',
    });
  });

  it('gives no options to an attribute that holds none', async () => {
    const shop = await openShop(port, texts, 'noopt');
    const warranty = await platform(shop, 'Warranty');
    const refused = await shop.post(`/attributes/${warranty.id}/options`, { value: '1 year' });
    expect(refused.status).toBe(409);
    expect(errorOf(refused).code).toBe('conflict');
  });

  it("retires a shop's own attribute from the picker without touching it, and never a platform one (ATR-10)", async () => {
    const shop = await openShop(port, texts, 'retire');
    const material = (await shop.post('/attributes', { name: 'Weave', dataType: 'enum_single' }))
      .body as Attribute;
    const retired = await shop.patch(`/attributes/${material.id}`, { retired: true });
    expect(retired.body).toMatchObject({ retired: true });
    expect((await attributes(shop)).some((row) => row.id === material.id)).toBe(false);
    expect(
      (await attributes(shop, '?includeRetired=true')).some((row) => row.id === material.id),
    ).toBe(true);

    const size = await platform(shop, 'Size');
    expect((await shop.patch(`/attributes/${size.id}`, { name: 'Bigness' })).status).toBe(404);
  });
});

describeIfDatabase('the category tree (PRD-03, ATR-02, ATL-05)', () => {
  it('builds a tree four levels deep and refuses a fifth', async () => {
    const shop = await openShop(port, texts, 'tree');
    const women = await category(shop, 'Women');
    const clothing = await category(shop, 'Clothing', women.id);
    const kurti = await category(shop, 'Kurti', clothing.id);
    const cotton = await category(shop, 'Cotton kurti', kurti.id);
    expect([women.depth, clothing.depth, kurti.depth, cotton.depth]).toEqual([1, 2, 3, 4]);
    const tooDeep = await shop.post('/categories', { name: 'Too deep', parentId: cotton.id });
    expect(tooDeep.status).toBe(400);
    expect(fieldsOf(tooDeep)).toEqual({ parentId: 'out_of_range' });
  });

  it('gives each category a slug unique in the shop, which a rename never changes', async () => {
    const shop = await openShop(port, texts, 'catslug');
    const first = await category(shop, 'Eid Sale');
    const second = await category(shop, 'Eid sale');
    expect([first.slug, second.slug]).toEqual(['eid-sale', 'eid-sale-2']);
    const renamed = await shop.patch(`/categories/${first.id}`, { name: 'Puja Sale' });
    expect(renamed.body).toMatchObject({ name: 'Puja Sale', slug: 'eid-sale' });
  });

  it('moves a category with everything under it, never under itself and never too deep', async () => {
    const shop = await openShop(port, texts, 'move');
    const a = await category(shop, 'A');
    const b = await category(shop, 'B', a.id);
    const c = await category(shop, 'C', b.id);
    expect(fieldsOf(await shop.patch(`/categories/${a.id}`, { parentId: c.id }))).toEqual({
      parentId: 'out_of_range',
    });

    const other = await category(shop, 'Other');
    const deep = await category(shop, 'Deep', other.id);
    const deeper = await category(shop, 'Deeper', deep.id);
    // B (with C under it) under Deeper would reach depth 5.
    expect(fieldsOf(await shop.patch(`/categories/${b.id}`, { parentId: deeper.id }))).toEqual({
      parentId: 'out_of_range',
    });
    const moved = await shop.patch(`/categories/${b.id}`, { parentId: other.id });
    expect(moved.body).toMatchObject({ parentId: other.id, depth: 2 });
    const tree = (await shop.get('/categories')).body as Category[];
    expect(tree.find((row) => row.id === c.id)?.depth).toBe(3);
  });

  it('refuses to delete a category with sub-categories or products, naming how many', async () => {
    const shop = await openShop(port, texts, 'catdel');
    const parent = await category(shop, 'Parent');
    await category(shop, 'Child', parent.id);
    const withChild = await shop.delete(`/categories/${parent.id}`);
    expect(withChild.status).toBe(409);
    expect(errorOf(withChild).details).toMatchObject({ count: 1 });

    const shoes = await category(shop, 'Shoes');
    for (const name of ['Loafer', 'Sneaker']) {
      await shop.post('/products', { name, basePrice: 1500, categoryIds: [shoes.id] });
    }
    const holding = await shop.delete(`/categories/${shoes.id}`);
    expect(holding.status).toBe(409);
    expect(errorOf(holding).details).toMatchObject({ count: 2 });
    // Bangla by default (I18N-01): the count is in the sentence a seller reads.
    expect(errorOf(holding).message).toContain('2টি প্রোডাক্ট');
  });

  it('moves its products to Uncategorized when asked, and they still list (PRD-03)', async () => {
    const shop = await openShop(port, texts, 'uncat');
    const bags = await category(shop, 'Bags');
    const tote = (
      await shop.post('/products', { name: 'Tote', basePrice: 900, categoryIds: [bags.id] })
    ).body as { id: string; primaryCategoryId: string | null };
    expect(tote.primaryCategoryId).toBe(bags.id);
    expect((await shop.delete(`/categories/${bags.id}?products=uncategorize`)).status).toBe(200);
    const after = await shop.get(`/products/${tote.id}`);
    expect(after.body).toMatchObject({ primaryCategoryId: null, categoryIds: [] });
    const uncategorized = (await shop.get('/products?categoryId=uncategorized')).body as {
      products: { id: string }[];
    };
    expect(uncategorized.products.map((product) => product.id)).toContain(tote.id);
  });

  it("suggests the platform's own attribute rows for a category, never copies, never required (ATR-02, ATL-05)", async () => {
    const shop = await openShop(port, texts, 'suggest');
    const clothing = await category(shop, 'Clothing');
    const [size, color] = [await platform(shop, 'Size'), await platform(shop, 'Color')];
    const saved = await shop.put(`/categories/${clothing.id}/attributes`, {
      attributeIds: [size.id, color.id],
    });
    expect(saved.body).toMatchObject({ suggestedAttributeIds: [size.id, color.id] });
    // Suggestions never block: a product filed here saves with no attributes at all.
    const plain = await shop.post('/products', {
      name: 'Plain shirt',
      basePrice: 500,
      categoryIds: [clothing.id],
    });
    expect(plain.status).toBe(201);
    const list = (await shop.get('/categories')).body as Category[];
    expect(list.find((row) => row.id === clothing.id)).toMatchObject({ productCount: 1 });

    const missing = await shop.put(`/categories/${clothing.id}/attributes`, {
      attributeIds: [size.id, '00000000-0000-4000-8000-000000000000'],
    });
    expect(fieldsOf(missing)).toEqual({ 'attributeIds.1': 'not_found' });
  });
});
