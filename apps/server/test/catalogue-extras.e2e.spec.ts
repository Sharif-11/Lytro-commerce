import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase, seedBalance } from './support/database';
import {
  cookieFrom,
  deleteJson,
  getJson,
  patchJson,
  postJson,
  type HttpResult,
} from './support/http';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 1b over HTTP: size charts (PRD-17), duplicating a product (PRD-18), option sets and swatches
// (ATR-16, ATR-18), categories that behave like another shop type and the up-front fields (PST-05, PST-06), and the
// operator's curation of the presets and the platform library (PST-04, ATL-01). Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_catalogue_extras_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const PASSWORD = 'operator-pass-123';

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'catalogue-extras-e2e-otp-secret-0123456789';
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

interface Option {
  id: string;
  value: string;
  swatchColor: string | null;
  scope: string;
  retired: boolean;
}

interface Attribute {
  id: string;
  name: string;
  scope: string;
  options: Option[];
}

interface Category {
  id: string;
  name: string;
  behavesLike: string | null;
  sizeChart: string[][] | null;
}

interface OptionSet {
  id: string;
  name: string;
  options: string[];
  scope: string;
  presetKey: string | null;
}

interface Defaults {
  businessType: string | null;
  presetKey: string | null;
  fromCategoryId: string | null;
  stockUnit: string;
  batchTracked: boolean;
  serialTracked: boolean;
  suggestedAttributeIds: string[];
  upFrontFields: string[];
}

interface Product {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  basePrice: string;
  stockUnit: string;
  batchTracked: boolean;
  categoryIds: string[];
  primaryCategoryId: string | null;
  variantAttributes: {
    attributeId: string;
    options: { id: string; value: string; swatchColor: string | null }[];
  }[];
  attributes: unknown[];
  variants: { id: string; optionIds: string[]; price: string | null; sku: string | null }[];
  sizeChart: { source: string; categoryId: string | null; rows: string[][] } | null;
}

async function platformId(shop: ShopClient, name: string): Promise<string> {
  const rows = (await shop.get('/attributes')).body as Attribute[];
  const found = rows.find((row) => row.name === name && row.scope === 'platform');
  if (!found) throw new Error(`no platform attribute ${name}`);
  return found.id;
}

async function addValues(
  shop: ShopClient,
  attributeId: string,
  values: string[],
): Promise<Option[]> {
  const result = await shop.post(`/attributes/${attributeId}/options/batch`, { values });
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return result.body as Option[];
}

async function category(
  shop: ShopClient,
  name: string,
  extra: Record<string, unknown> = {},
): Promise<Category> {
  const result = await shop.post('/categories', { name, ...extra });
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return result.body as Category;
}

async function create(shop: ShopClient, body: unknown): Promise<Product> {
  const result = await shop.post('/products', body);
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return result.body as Product;
}

async function product(shop: ShopClient, id: string): Promise<Product> {
  return (await shop.get(`/products/${id}`)).body as Product;
}

async function defaults(shop: ShopClient, categoryId?: string): Promise<Defaults> {
  const result = await shop.get(
    `/product-defaults${categoryId ? `?categoryId=${categoryId}` : ''}`,
  );
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body as Defaults;
}

async function version(tenantId: string): Promise<number> {
  const result = await admin.query<{ version: string }>(
    'SELECT version FROM tenant.catalogue_state WHERE tenant_id = $1',
    [tenantId],
  );
  return Number(result.rows[0]?.version ?? 0);
}

describeIfDatabase('size charts (PRD-17)', () => {
  it("shows a category's chart on its products and those below it, until a product sets its own", async () => {
    const shop = await openShop(port, texts, 'charts');
    const shoes = await category(shop, 'Shoes');
    const sneakers = await category(shop, 'Sneakers', { parentId: shoes.id });
    const rows = [
      ['Size', 'Foot (cm)'],
      ['40', '25.5'],
      ['41', '26'],
    ];
    const set = await shop.put(`/categories/${shoes.id}/size-chart`, { rows });
    expect(set.status).toBe(200);
    expect(set.body).toEqual({ rows, image: null });

    const runner = await create(shop, {
      name: 'Runner',
      basePrice: 900,
      categoryIds: [sneakers.id],
    });
    expect(runner.sizeChart).toEqual({
      source: 'category',
      categoryId: shoes.id,
      rows,
      image: null,
    });
    expect((await create(shop, { name: 'Laces', basePrice: 50 })).sizeChart).toBeNull();

    const own = [
      ['Size', 'Foot (cm)'],
      ['40', '25'],
    ];
    expect((await shop.put(`/products/${runner.id}/size-chart`, { rows: own })).status).toBe(200);
    expect((await product(shop, runner.id)).sizeChart).toEqual({
      source: 'product',
      categoryId: null,
      rows: own,
      image: null,
    });

    expect((await shop.delete(`/products/${runner.id}/size-chart`)).status).toBe(200);
    expect((await product(shop, runner.id)).sizeChart?.source).toBe('category');
    const listed = (await shop.get('/categories')).body as Category[];
    expect(listed.find((row) => row.id === shoes.id)?.sizeChart).toEqual(rows);
    expect(listed.find((row) => row.id === sneakers.id)?.sizeChart).toBeNull();

    const before = await version(shop.tenantId);
    expect((await shop.delete(`/categories/${shoes.id}/size-chart`)).status).toBe(200);
    expect(await version(shop.tenantId)).toBeGreaterThan(before);
    expect((await product(shop, runner.id)).sizeChart).toBeNull();
  });

  it('refuses a ragged table, more than 15 rows and a cell past 40 characters', async () => {
    const shop = await openShop(port, texts, 'chart-shape');
    const tee = await create(shop, { name: 'Tee', basePrice: 1 });
    const ragged = await shop.put(`/products/${tee.id}/size-chart`, { rows: [['S', 'M'], ['38']] });
    expect(errorOf(ragged).code).toBe('validation_error');
    expect(fieldsOf(ragged)).toEqual({ 'rows.1': 'not_allowed' });
    const tall = await shop.put(`/products/${tee.id}/size-chart`, {
      rows: Array.from({ length: 16 }, () => ['x']),
    });
    expect(errorOf(tall).code).toBe('validation_error');
    const long = await shop.put(`/products/${tee.id}/size-chart`, { rows: [['x'.repeat(41)]] });
    expect(errorOf(long).code).toBe('validation_error');
    expect((await product(shop, tee.id)).sizeChart).toBeNull();
  });

  it("answers 404 for another shop's product or category", async () => {
    const shop = await openShop(port, texts, 'chart-own');
    const other = await openShop(port, texts, 'chart-other');
    const tee = await create(shop, { name: 'Tee', basePrice: 1 });
    const tops = await category(shop, 'Tops');
    const rows = [['S']];
    expect((await other.put(`/products/${tee.id}/size-chart`, { rows })).status).toBe(404);
    expect((await other.delete(`/products/${tee.id}/size-chart`)).status).toBe(404);
    expect((await other.put(`/categories/${tops.id}/size-chart`, { rows })).status).toBe(404);
    expect((await other.delete(`/categories/${tops.id}/size-chart`)).status).toBe(404);
    expect((await product(shop, tee.id)).sizeChart).toBeNull();
  });
});

describeIfDatabase('duplicating a product (PRD-18)', () => {
  it('copies its fields, categories, attributes, variants and size chart into an inactive copy', async () => {
    const shop = await openShop(port, texts, 'dup');
    const tops = await category(shop, 'Tops');
    const size = await platformId(shop, 'Size');
    const [small, medium] = (await addValues(shop, size, ['S', 'M'])).map((option) => option.id);
    const fabric = await platformId(shop, 'Fabric');
    const [cotton] = (await addValues(shop, fabric, ['Cotton'])).map((option) => option.id);
    const polo = await create(shop, {
      name: 'Polo',
      basePrice: 500,
      weightKg: 0.25,
      categoryIds: [tops.id],
      variantAttributes: [{ attributeId: size, optionIds: [small, medium] }],
      variants: [
        { optionIds: [small], price: 480, sku: 'POLO-S' },
        { optionIds: [medium], sku: 'POLO-M' },
      ],
      attributes: [{ attributeId: fabric, role: 'informational', optionIds: [cotton] }],
    });
    const chart = [
      ['S', 'M'],
      ['38', '40'],
    ];
    await shop.put(`/products/${polo.id}/size-chart`, { rows: chart });

    const copied = await shop.post(`/products/${polo.id}/duplicate`, {});
    expect(copied.status, JSON.stringify(copied.body)).toBe(201);
    const copy = copied.body as Product;
    expect(copy).toMatchObject({
      name: 'Polo (copy)',
      active: false,
      basePrice: '500.00',
      categoryIds: [tops.id],
      primaryCategoryId: tops.id,
      attributes: polo.attributes,
      sizeChart: { source: 'product', categoryId: null, rows: chart },
    });
    expect(copy.id).not.toBe(polo.id);
    expect(copy.slug).not.toBe(polo.slug);
    const byOption = (row: Product) =>
      Object.fromEntries(row.variants.map((variant) => [variant.optionIds.join(), variant]));
    expect(byOption(copy)[small ?? '']).toMatchObject({ price: '480.00', sku: null });
    expect(byOption(copy)[medium ?? '']).toMatchObject({ price: null, sku: null });
    expect(copy.variants).toHaveLength(2);

    // The original keeps its own SKUs; the copy is a product of its own, and a second copy takes another slug.
    expect((await product(shop, polo.id)).variants.map((variant) => variant.sku).sort()).toEqual([
      'POLO-M',
      'POLO-S',
    ]);
    const second = (await shop.post(`/products/${polo.id}/duplicate`, {})).body as Product;
    expect(second.slug).not.toBe(copy.slug);
    expect(((await shop.get('/products')).body as { total: number }).total).toBe(3);
  });

  it('is refused at the product limit, and charged the pay-as-you-go fee like a new product', async () => {
    const limited = await openShop(port, texts, 'dup-limit');
    const only = await create(limited, { name: 'Only', basePrice: 1 });
    await admin.query(
      `INSERT INTO control.plan_limit_overrides (tenant_id, limit_key, value, reason, set_by)
       VALUES ($1, 'products', '1', 'test', gen_random_uuid())`,
      [limited.tenantId],
    );
    const refused = await limited.post(`/products/${only.id}/duplicate`, {});
    expect(refused.status).toBe(402);
    expect(errorOf(refused).code).toBe('plan_limit_reached');

    const payg = await openShop(port, texts, 'dup-payg');
    await admin.query(
      `UPDATE control.tenants SET state = 'pay_as_you_go',
         plan_id = (SELECT id FROM control.plans WHERE name = 'Pay-as-you-go'), plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Pay-as-you-go')
       WHERE id = $1`,
      [payg.tenantId],
    );
    await seedBalance(admin, payg.tenantId, '100.00');
    const original = await create(payg, { name: 'Original', basePrice: 1 });
    const copy = (await payg.post(`/products/${original.id}/duplicate`, {})).body as Product;
    const fees = await admin.query<{ amount: string; reference: unknown }>(
      "SELECT amount, reference FROM tenant.balance_ledger WHERE tenant_id = $1 AND type = 'product_fee' ORDER BY id",
      [payg.tenantId],
    );
    expect(fees.rows).toEqual([
      { amount: '-10.00', reference: { productId: original.id } },
      { amount: '-10.00', reference: { productId: copy.id } },
    ]);
  });

  it("answers 404 for another shop's product and for an archived one", async () => {
    const shop = await openShop(port, texts, 'dup-own');
    const other = await openShop(port, texts, 'dup-other');
    const tee = await create(shop, { name: 'Tee', basePrice: 1 });
    expect((await other.post(`/products/${tee.id}/duplicate`, {})).status).toBe(404);
    await shop.delete(`/products/${tee.id}`);
    expect((await shop.post(`/products/${tee.id}/duplicate`, {})).status).toBe(404);
    expect(((await other.get('/products')).body as { total: number }).total).toBe(0);
  });
});

describeIfDatabase('option sets and adding several values at once (ATR-16)', () => {
  it("offers the platform's sets, the shop type's first, then the shop's own", async () => {
    const shop = await openShop(port, texts, 'sets');
    expect((await shop.put('/business-type', { businessType: 'shoes_bags' })).status).toBe(200);
    const platform = (await shop.get('/option-sets')).body as OptionSet[];
    expect(platform.map((set) => [set.name, set.scope])).toEqual([
      ['Shoe 38–44', 'platform'],
      ['S–XXL', 'platform'],
      ['Common colors', 'platform'],
    ]);

    const saved = await shop.post('/option-sets', {
      name: 'Kids sizes',
      options: ['2-3Y', '4-5Y', '4-5y', '6-7Y'],
    });
    expect(saved.status).toBe(201);
    const kids = saved.body as OptionSet;
    expect(kids).toMatchObject({
      name: 'Kids sizes',
      options: ['2-3Y', '4-5Y', '6-7Y'],
      scope: 'shop',
      presetKey: null,
    });
    expect(((await shop.get('/option-sets')).body as OptionSet[]).at(-1)?.id).toBe(kids.id);

    const other = await openShop(port, texts, 'sets-other');
    const seen = ((await other.get('/option-sets')).body as OptionSet[]).map((set) => set.name);
    expect(seen).not.toContain('Kids sizes');
    expect((await other.delete(`/option-sets/${kids.id}`)).status).toBe(404);
  });

  it('refuses a name the shop already sees, and deleting a platform set; deletes its own', async () => {
    const shop = await openShop(port, texts, 'sets-names');
    const taken = await shop.post('/option-sets', { name: 's–xxl', options: ['A'] });
    expect(taken.status).toBe(409);
    expect(fieldsOf(taken)).toEqual({ name: 'taken' });

    const sets = (await shop.get('/option-sets')).body as OptionSet[];
    const platformSet = sets.find((set) => set.scope === 'platform');
    expect((await shop.delete(`/option-sets/${platformSet?.id ?? ''}`)).status).toBe(404);

    const mine = (await shop.post('/option-sets', { name: 'Mine', options: ['A'] }))
      .body as OptionSet;
    expect((await shop.post('/option-sets', { name: 'MINE', options: ['B'] })).status).toBe(409);
    expect((await shop.delete(`/option-sets/${mine.id}`)).status).toBe(200);
    const after = (await shop.get('/option-sets')).body as OptionSet[];
    expect(after.map((set) => set.name)).not.toContain('Mine');
  });

  it("adds a set's values in one call, reusing the ones already there with their swatches", async () => {
    const shop = await openShop(port, texts, 'batch');
    const size = await platformId(shop, 'Size');
    const sizes = ['S', 'M', 'L', 'XL', 'XXL'];
    const made = await addValues(shop, size, sizes);
    expect(made.map((option) => [option.value, option.scope])).toEqual(
      sizes.map((value) => [value, 'shop']),
    );
    const again = await addValues(shop, size, ['s', 'XXL', 'M']);
    expect(again.map((option) => option.id)).toEqual(
      [made[0], made[4], made[1]].map((option) => option?.id),
    );

    // Editable after insertion: retiring XXL leaves four, and adding the set again brings it back.
    const xxl = made[4]?.id ?? '';
    await shop.patch(`/attributes/${size}/options/${xxl}`, { retired: true });
    const live = ((await shop.get('/attributes')).body as Attribute[])
      .find((row) => row.id === size)
      ?.options.filter((option) => option.scope === 'shop');
    expect(live?.map((option) => option.value)).toEqual(['S', 'M', 'L', 'XL']);
    const revived = await addValues(shop, size, ['XXL']);
    expect(revived[0]).toMatchObject({ id: xxl, retired: false });

    const color = await platformId(shop, 'Color');
    const colours = await addValues(shop, color, ['Red', 'Teal']);
    expect(colours.map((option) => [option.value, option.scope, option.swatchColor])).toEqual([
      ['Red', 'platform', '#D32F2F'],
      ['Teal', 'shop', null],
    ]);
  });

  it("answers 404 for another shop's attribute, and checks a number's values", async () => {
    const shop = await openShop(port, texts, 'batch-own');
    const other = await openShop(port, texts, 'batch-other');
    const own = (await shop.post('/attributes', { name: 'Thread', dataType: 'enum_single' }))
      .body as Attribute;
    expect(
      (await other.post(`/attributes/${own.id}/options/batch`, { values: ['A'] })).status,
    ).toBe(404);
    const pack = await platformId(shop, 'Pack size');
    const refused = await shop.post(`/attributes/${pack}/options/batch`, { values: ['6', 'six'] });
    expect(fieldsOf(refused)).toEqual({ 'values.1': 'out_of_range' });
  });
});

describeIfDatabase('option swatches (ATR-18)', () => {
  it("gives a shop's own value a swatch that shows on every product using it", async () => {
    const shop = await openShop(port, texts, 'swatch');
    const shade = (await shop.post('/attributes', { name: 'Lip shade', dataType: 'enum_single' }))
      .body as Attribute;
    const made = await shop.post(`/attributes/${shade.id}/options`, {
      value: 'Ruby 05',
      swatchColor: '#b0102a',
    });
    expect(made.status).toBe(201);
    const ruby = made.body as Option;
    expect(ruby).toMatchObject({ value: 'Ruby 05', swatchColor: '#B0102A' });

    const lipstick = await create(shop, {
      name: 'Lipstick',
      basePrice: 300,
      variantAttributes: [{ attributeId: shade.id, optionIds: [ruby.id] }],
    });
    expect(lipstick.variantAttributes[0]?.options).toEqual([
      { id: ruby.id, value: 'Ruby 05', swatchColor: '#B0102A', swatchImage: null },
    ]);

    // Re-colouring shows at once and moves the catalogue version (CCH-02).
    const before = await version(shop.tenantId);
    const recoloured = await shop.patch(`/attributes/${shade.id}/options/${ruby.id}`, {
      swatchColor: '#FF0000',
    });
    expect(recoloured.status).toBe(200);
    expect(await version(shop.tenantId)).toBeGreaterThan(before);
    expect((await product(shop, lipstick.id)).variantAttributes[0]?.options[0]?.swatchColor).toBe(
      '#FF0000',
    );
    const cleared = await shop.patch(`/attributes/${shade.id}/options/${ruby.id}`, {
      swatchColor: null,
    });
    expect((cleared.body as Option).swatchColor).toBeNull();

    // A PATCH with nothing in it changes nothing and answers with the record as it stands.
    const unchanged = await shop.patch(`/attributes/${shade.id}/options/${ruby.id}`, {});
    expect(unchanged.status).toBe(200);
    expect(unchanged.body).toMatchObject({ value: 'Ruby 05', swatchColor: null });
    expect((await shop.patch(`/attributes/${shade.id}`, {})).status).toBe(200);
    const tops = await category(shop, 'Tops');
    const same = await shop.patch(`/categories/${tops.id}`, {});
    expect(same.status).toBe(200);
    expect((same.body as Category).name).toBe('Tops');
  });

  it("refuses a swatch that is not a #RRGGBB colour, and a platform value is never the shop's", async () => {
    const shop = await openShop(port, texts, 'swatch-bad');
    const color = await platformId(shop, 'Color');
    const refused = await shop.post(`/attributes/${color}/options`, {
      value: 'Teal',
      swatchColor: 'teal',
    });
    expect(errorOf(refused).code).toBe('validation_error');
    expect(Object.keys(fieldsOf(refused))).toEqual(['swatchColor']);
    const [red] = await addValues(shop, color, ['Red']);
    const changed = await shop.patch(`/attributes/${color}/options/${red?.id ?? ''}`, {
      swatchColor: '#000000',
    });
    expect(changed.status).toBe(404);
  });
});

describeIfDatabase(
  'a category that behaves like another shop type (PST-06, PST-05, PST-03)',
  () => {
    it("gives its products, and those of the categories below it, that type's defaults", async () => {
      const shop = await openShop(port, texts, 'mixed');
      await shop.put('/business-type', { businessType: 'clothing' });
      const cosmetics = await category(shop, 'Cosmetics', { behavesLike: 'cosmetics' });
      expect(cosmetics.behavesLike).toBe('cosmetics');
      const lipstick = await category(shop, 'Lipstick', { parentId: cosmetics.id });
      const kurti = await category(shop, 'Kurti');

      expect(await defaults(shop)).toMatchObject({
        businessType: 'clothing',
        presetKey: 'clothing',
        fromCategoryId: null,
        batchTracked: false,
        upFrontFields: ['sizeChart'],
      });
      expect(await defaults(shop, kurti.id)).toMatchObject({ presetKey: 'clothing' });
      expect(await defaults(shop, lipstick.id)).toMatchObject({
        businessType: 'clothing',
        presetKey: 'cosmetics',
        fromCategoryId: cosmetics.id,
        batchTracked: true,
        upFrontFields: ['batchTracked'],
      });

      const matte = await create(shop, {
        name: 'Matte lipstick',
        basePrice: 350,
        categoryIds: [lipstick.id],
      });
      expect(matte.batchTracked).toBe(true);
      const cotton = await create(shop, {
        name: 'Cotton kurti',
        basePrice: 900,
        categoryIds: [kurti.id],
      });
      expect(cotton.batchTracked).toBe(false);

      // PST-03: changing the setting later leaves saved products as they are.
      const moved = await shop.patch(`/categories/${cosmetics.id}`, { behavesLike: 'grocery' });
      expect((moved.body as Category).behavesLike).toBe('grocery');
      expect(await defaults(shop, lipstick.id)).toMatchObject({
        presetKey: 'grocery',
        stockUnit: 'kg',
      });
      expect(await product(shop, matte.id)).toMatchObject({
        batchTracked: true,
        stockUnit: 'piece',
      });

      await shop.patch(`/categories/${cosmetics.id}`, { behavesLike: null });
      expect(await defaults(shop, lipstick.id)).toMatchObject({
        presetKey: 'clothing',
        fromCategoryId: null,
      });
    });

    it("puts the category's own suggested attributes ahead of the type's", async () => {
      const shop = await openShop(port, texts, 'mixed-suggest');
      const cosmetics = await category(shop, 'Cosmetics', { behavesLike: 'cosmetics' });
      const brand = await platformId(shop, 'Brand');
      const shade = await platformId(shop, 'Shade');
      await shop.put(`/categories/${cosmetics.id}/attributes`, { attributeIds: [brand] });
      const suggested = (await defaults(shop, cosmetics.id)).suggestedAttributeIds;
      expect(suggested[0]).toBe(brand);
      expect(suggested).toContain(shade);
    });

    it("refuses an unknown shop type, and another shop's category", async () => {
      const shop = await openShop(port, texts, 'mixed-bad');
      const refused = await shop.post('/categories', {
        name: 'Rockets',
        behavesLike: 'spaceships',
      });
      expect(fieldsOf(refused)).toEqual({ behavesLike: 'not_found' });
      const tops = await category(shop, 'Tops');
      const other = await openShop(port, texts, 'mixed-other');
      expect((await other.get(`/product-defaults?categoryId=${tops.id}`)).status).toBe(404);
      expect(errorOf(await shop.get('/product-defaults?categoryId=tops')).code).toBe(
        'validation_error',
      );
    });
  },
);

describeIfDatabase(
  'the operator curating the platform library (PST-04, ATL-01, ATR-16, ATR-18)',
  // Each test signs a new operator in (password and TOTP), which is slow under a full parallel run.
  { timeout: 30_000 },
  () => {
    async function operator(): Promise<Record<string, string>> {
      const email = `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
      await admin.query(
        'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2)',
        [email, await hash(PASSWORD, 4)],
      );
      const signedIn = await postJson(port, '/auth/operator/signin', { email, password: PASSWORD });
      const { secret } = signedIn.body as { secret: string };
      const enrolled = await postJson(port, '/auth/operator/enroll', {
        email,
        password: PASSWORD,
        code: await generate({ secret }),
      });
      const { csrfToken } = enrolled.body as { csrfToken: string };
      return { cookie: cookieFrom(enrolled), 'x-csrf-token': csrfToken };
    }

    async function audited(action: string): Promise<{ actor_id: string; summary: unknown }[]> {
      const result = await admin.query<{ actor_id: string; summary: unknown }>(
        'SELECT actor_id, summary FROM control.platform_audit_log WHERE action = $1 ORDER BY created_at',
        [action],
      );
      return result.rows;
    }

    it('changes a preset for the next product created, never an existing one', async () => {
      const headers = await operator();
      const shop = await openShop(port, texts, 'curated');
      await shop.put('/business-type', { businessType: 'grocery' });
      const rice = await create(shop, { name: 'Rice', basePrice: 80 });
      expect(rice.stockUnit).toBe('kg');

      const brand = await platformId(shop, 'Brand');
      const flavour = await platformId(shop, 'Flavour');
      const changed = await patchJson(
        port,
        '/operator/presets/grocery',
        {
          suggestedAttributeIds: [flavour, brand, flavour],
          defaultStockUnit: 'piece',
          upFrontFields: ['batchTracked', 'weightKg'],
        },
        headers,
      );
      expect(changed.status, JSON.stringify(changed.body)).toBe(200);
      expect(changed.body).toMatchObject({
        key: 'grocery',
        defaults: { suggestedAttributeIds: [flavour, brand], stockUnit: 'piece' },
      });
      expect(await defaults(shop)).toMatchObject({
        stockUnit: 'piece',
        suggestedAttributeIds: [flavour, brand],
        upFrontFields: ['batchTracked', 'weightKg'],
      });
      expect((await create(shop, { name: 'Biscuit', basePrice: 20 })).stockUnit).toBe('piece');
      expect((await product(shop, rice.id)).stockUnit).toBe('kg');
      expect((await audited('preset_updated')).at(-1)?.summary).toMatchObject({ key: 'grocery' });

      const listed = (await getJson(port, '/operator/presets', headers)).body as { key: string }[];
      expect(listed.map((preset) => preset.key)).toContain('grocery');
    });

    it("refuses a shop's attribute as a suggestion, batches with serials, and an unknown preset", async () => {
      const headers = await operator();
      const shop = await openShop(port, texts, 'curated-bad');
      const own = (await shop.post('/attributes', { name: 'Shop only', dataType: 'text' }))
        .body as Attribute;
      const notPlatform = await patchJson(
        port,
        '/operator/presets/books_stationery',
        { suggestedAttributeIds: [own.id] },
        headers,
      );
      expect(fieldsOf(notPlatform)).toEqual({ 'suggestedAttributeIds.0': 'not_found' });
      const both = await patchJson(
        port,
        '/operator/presets/books_stationery',
        { defaultBatch: true, defaultSerial: true },
        headers,
      );
      expect(fieldsOf(both)).toEqual({ defaultSerial: 'not_allowed' });
      // Electronics already tracks serials, so batches on top of them are refused too.
      const onTop = await patchJson(
        port,
        '/operator/presets/electronics',
        { defaultBatch: true },
        headers,
      );
      expect(fieldsOf(onTop)).toEqual({ defaultBatch: 'not_allowed' });
      expect(
        (await patchJson(port, '/operator/presets/nope', { labelEn: 'Nope' }, headers)).status,
      ).toBe(404);
    });

    it('adds a platform attribute and a value with a swatch that every shop sees', async () => {
      const headers = await operator();
      const created = await postJson(
        port,
        '/operator/attributes',
        { name: 'Sleeve', dataType: 'enum_single' },
        headers,
      );
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const sleeve = created.body as Attribute;
      expect(sleeve.scope).toBe('platform');
      const long = await postJson(
        port,
        `/operator/attributes/${sleeve.id}/options`,
        { value: 'Long', swatchColor: '#123abc' },
        headers,
      );
      expect(long.status).toBe(201);
      const longId = (long.body as Option).id;

      const shop = await openShop(port, texts, 'sees-platform');
      const seen = ((await shop.get('/attributes')).body as Attribute[]).find(
        (row) => row.id === sleeve.id,
      );
      expect(seen?.options).toEqual([
        {
          id: longId,
          value: 'Long',
          swatchColor: '#123ABC',
          swatchImage: null,
          scope: 'platform',
          retired: false,
        },
      ]);
      expect((await shop.patch(`/attributes/${sleeve.id}`, { name: 'Mine now' })).status).toBe(404);

      const taken = await postJson(
        port,
        '/operator/attributes',
        { name: 'size', dataType: 'enum_single' },
        headers,
      );
      expect(taken.status).toBe(409);
      expect(
        (
          await postJson(
            port,
            `/operator/attributes/${sleeve.id}/options`,
            { value: 'LONG' },
            headers,
          )
        ).status,
      ).toBe(409);
      const renamed = await patchJson(
        port,
        `/operator/attributes/${sleeve.id}`,
        { name: 'Sleeve length' },
        headers,
      );
      expect((renamed.body as Attribute).name).toBe('Sleeve length');
      const retired = await patchJson(
        port,
        `/operator/attributes/${sleeve.id}/options/${longId}`,
        { retired: true, swatchColor: null },
        headers,
      );
      expect(retired.body).toMatchObject({ retired: true, swatchColor: null });
      expect((await audited('platform_attribute_created')).length).toBeGreaterThan(0);
      expect((await audited('platform_option_updated')).length).toBeGreaterThan(0);
    });

    it('manages the platform option sets', async () => {
      const headers = await operator();
      const created = await postJson(
        port,
        '/operator/option-sets',
        { name: 'Kids shoes', options: ['28', '29', '28'], presetKey: 'shoes_bags' },
        headers,
      );
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const kids = created.body as OptionSet;
      expect(kids).toMatchObject({
        options: ['28', '29'],
        scope: 'platform',
        presetKey: 'shoes_bags',
      });

      const unknown = await postJson(
        port,
        '/operator/option-sets',
        { name: 'Odd', options: ['A'], presetKey: 'spaceships' },
        headers,
      );
      expect(fieldsOf(unknown)).toEqual({ presetKey: 'not_found' });

      const shop = await openShop(port, texts, 'sees-sets');
      const seen = (await shop.get('/option-sets')).body as OptionSet[];
      expect(seen.map((set) => set.name)).toContain('Kids shoes');

      const renamed = await patchJson(
        port,
        `/operator/option-sets/${kids.id}`,
        { name: 'Kids shoe sizes', options: ['28', '29', '30'] },
        headers,
      );
      expect(renamed.body).toMatchObject({ name: 'Kids shoe sizes', options: ['28', '29', '30'] });
      const unchanged = await patchJson(port, `/operator/option-sets/${kids.id}`, {}, headers);
      expect(unchanged.status).toBe(200);
      expect(unchanged.body).toMatchObject({ name: 'Kids shoe sizes' });
      expect((await patchJson(port, '/operator/presets/other', {}, headers)).status).toBe(200);
      expect(
        (await patchJson(port, `/operator/option-sets/${kids.id}`, { name: 'S–XXL' }, headers))
          .status,
      ).toBe(409);
      expect((await deleteJson(port, `/operator/option-sets/${kids.id}`, headers)).status).toBe(
        200,
      );
      expect((await deleteJson(port, `/operator/option-sets/${kids.id}`, headers)).status).toBe(
        404,
      );
      expect(
        ((await shop.get('/option-sets')).body as OptionSet[]).map((set) => set.name),
      ).not.toContain('Kids shoe sizes');
      expect((await audited('platform_option_set_deleted')).length).toBe(1);
    });

    it('turns away a request without an operator session, a shop owner included', async () => {
      const shop = await openShop(port, texts, 'not-operator');
      const anonymous: HttpResult = await getJson(port, '/operator/presets');
      expect(anonymous.status).toBe(401);
      expect((await getJson(port, '/operator/attributes', shop.headers())).status).toBe(401);
      expect(
        (
          await postJson(
            port,
            '/operator/option-sets',
            { name: 'X', options: ['A'] },
            shop.headers(),
          )
        ).status,
      ).toBe(401);
    });
  },
);
