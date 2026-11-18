import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { MediaProcessor } from '../src/modules/media/services/media-processor';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { sendExact, type HttpResult } from './support/http';
import { MemoryStorage } from './support/memory-storage';
import { fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// STOREFRONT-BUILDER-PLAN DC-1 to DC-7 (2026-11-18): each design of a product with two or more is its own card in the
// shop's lists when the storefront asks -- its own cover, prices and stock -- and the seller orders the cards: the
// Featured order follows them, the ones not placed first, newest first. The switch turns design cards off for the
// whole shop. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_design_cards_test';
const SITE = 'https://myshop.com';
const API_HOST = 'api.localhost';

sharp.concurrency(1);
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const storage = new MemoryStorage();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'design-cards-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['MEDIA_PUBLIC_BASE_URL'] = 'https://media.example.test';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(MEDIA_STORAGE)
    .useValue(storage)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

interface Card {
  id: string;
  name: string;
  minPrice: string | null;
  stockState: string;
  image: { id: string } | null;
  designId: string | null;
}

interface SellerCard {
  productId: string;
  designId: string | null;
  designNumber: number | null;
  active: boolean;
  placed: boolean;
  shown: boolean;
  mode: string | null;
  image: { id: string } | null;
}

interface SellerCards {
  designCards: boolean;
  cards: SellerCard[];
}

/** A photo in its own colour, so each upload is a different file. */
async function upload(shop: ShopClient, shade: number): Promise<string> {
  const file = await sharp({
    create: { width: 600, height: 750, channels: 3, background: { r: shade, g: 90, b: 110 } },
  })
    .jpeg()
    .toBuffer();
  const started = await shop.post('/media/uploads', {
    kind: 'image',
    contentType: 'image/jpeg',
    bytes: file.length,
    purpose: 'product_image',
  });
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  const { media, upload: link } = started.body as {
    media: { id: string };
    upload: { url: string };
  };
  expect(storage.send(link.url, file, 'image/jpeg')).toBe(200);
  expect((await shop.post(`/media/${media.id}/finish`, {})).status).toBe(201);
  await app.get(MediaProcessor).process(shop.tenantId, media.id);
  return media.id;
}

async function product(
  shop: ShopClient,
  name: string,
  imageIds: string[],
): Promise<{ id: string }> {
  const made = await shop.post('/products', {
    name,
    basePrice: 3500,
    stockTracking: 'not_tracked',
    imageIds,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as { id: string };
}

/** A burka in two designs (one photo each), each in two sizes; design 2 sells at 3900. */
async function designedBurka(shop: ShopClient) {
  const [black, striped] = [await upload(shop, 40), await upload(shop, 160)];
  const made = await product(shop, 'Irani burka', [black, striped]);
  const saved = await shop.put(`/products/${made.id}/images`, {
    photos: [
      { mediaId: black, design: 'a' },
      { mediaId: striped, design: 'b' },
    ],
    designs: [
      { key: 'a', name: 'ডিজাইন 1' },
      { key: 'b', name: 'ডিজাইন 2' },
    ],
  });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const designs = (saved.body as { designs: { id: string; number: number }[] }).designs;
  const attributes = (await shop.get('/attributes')).body as {
    id: string;
    name: string;
    scope: string;
  }[];
  const size = attributes.find((row) => row.name === 'Size' && row.scope === 'platform');
  if (!size) throw new Error('no platform Size attribute');
  const design = await admin.query<{ id: string }>(
    'SELECT id FROM tenant.attributes WHERE photo_designs',
  );
  const madeSizes = await shop.post(`/attributes/${size.id}/options/batch`, {
    values: ['52-cards', '54-cards'],
  });
  expect(madeSizes.status, JSON.stringify(madeSizes.body)).toBe(201);
  const split = await shop.put(`/products/${made.id}/variants`, {
    variantAttributes: [
      { attributeId: design.rows[0]?.id, optionIds: designs.map((row) => row.id) },
      {
        attributeId: size.id,
        optionIds: (madeSizes.body as { id: string }[]).map((option) => option.id),
      },
    ],
  });
  expect(split.status, JSON.stringify(split.body)).toBe(200);
  const [first, second] = [...designs].sort((a, b) => a.number - b.number);
  if (!first || !second) throw new Error('two designs');
  await admin.query(
    `UPDATE tenant.product_variants v SET price = 3900
     FROM tenant.variant_attribute_values va
     WHERE va.variant_id = v.id AND va.option_id = $1`,
    [second.id],
  );
  return {
    id: made.id,
    designs: { first: first.id, second: second.id },
    photos: { black, striped },
  };
}

async function keyFor(shop: ShopClient): Promise<string> {
  const made = await shop.post('/api-keys', { name: 'Website', websites: [SITE] });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { key: string }).key;
}

function callApi(path: string, key: string): Promise<HttpResult> {
  return sendExact(port, 'GET', path, undefined, {
    host: API_HOST,
    authorization: `Bearer ${key}`,
    origin: SITE,
  });
}

async function list(
  key: string,
  query: string,
): Promise<{ products: Card[]; nextCursor: string | null }> {
  const read = await callApi(`/v1/catalogue/products?${query}`, key);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return read.body as { products: Card[]; nextCursor: string | null };
}

const cardOf = (card: { id?: string; productId?: string; designId: string | null }) =>
  `${card.productId ?? card.id ?? ''}:${card.designId ?? ''}`;

async function sellerCards(shop: ShopClient): Promise<SellerCards> {
  const read = await shop.get('/storefront/design/cards');
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return read.body as SellerCards;
}

describeIfDatabase('design cards (DC-1, DC-5)', () => {
  it("spreads a product's designs into cards, each with its own cover and price, only when asked", async () => {
    const shop = await openShop(port, texts, 'cards');
    const plain = await product(shop, 'Cotton saree', [await upload(shop, 220)]);
    const burka = await designedBurka(shop);
    const key = await keyFor(shop);

    const spread = (await list(key, 'designs=true')).products;
    expect(spread.map(cardOf).sort()).toEqual(
      [
        `${plain.id}:`,
        `${burka.id}:${burka.designs.first}`,
        `${burka.id}:${burka.designs.second}`,
      ].sort(),
    );
    const first = spread.find((card) => card.designId === burka.designs.first);
    const second = spread.find((card) => card.designId === burka.designs.second);
    expect(first).toMatchObject({
      name: 'Irani burka',
      minPrice: '3500.00',
      image: { id: burka.photos.black },
    });
    expect(second).toMatchObject({ minPrice: '3900.00', image: { id: burka.photos.striped } });

    // Without the flag -- another website on the public API -- one card per product, as before.
    const kept = (await list(key, '')).products;
    expect(kept.map(cardOf).sort()).toEqual([`${plain.id}:`, `${burka.id}:`].sort());

    // A design sold out leaves an in-stock list; the other stays.
    await admin.query(
      `UPDATE tenant.product_variants v SET stock_state = 'out'
       FROM tenant.variant_attribute_values va WHERE va.variant_id = v.id AND va.option_id = $1`,
      [burka.designs.first],
    );
    await admin.query(
      'UPDATE tenant.catalogue_state SET version = version + 1 WHERE tenant_id = $1',
      [shop.tenantId],
    );
    const inStock = (await list(key, 'designs=true&inStock=true')).products;
    expect(inStock.map((card) => card.designId)).not.toContain(burka.designs.first);
    expect(inStock.map((card) => card.designId)).toContain(burka.designs.second);

    // Pages of one card each give every card once.
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { products: Card[]; nextCursor: string | null } = await list(
        key,
        `designs=true&limit=1${cursor === null ? '' : `&cursor=${cursor}`}`,
      );
      seen.push(...page.products.map(cardOf));
      cursor = page.nextCursor;
    } while (cursor !== null);
    expect(seen.sort()).toEqual(spread.map(cardOf).sort());
  });
});

describeIfDatabase("the seller's order (DC-6, DC-7)", () => {
  it('lists every card, orders the shop by it, puts a new product first, and refuses a card not of the shop', async () => {
    const shop = await openShop(port, texts, 'order');
    const plain = await product(shop, 'Cotton saree', [await upload(shop, 60)]);
    const burka = await designedBurka(shop);
    const hidden = await product(shop, 'Linen panjabi', []);
    expect((await shop.patch(`/products/${hidden.id}`, { active: false })).status).toBe(200);
    const key = await keyFor(shop);

    const before = await sellerCards(shop);
    expect(before.designCards).toBe(true);
    // Not placed yet: newest first, a product's designs in their own order; the hidden product kept in its place.
    // Every card that could show, the burka's own (compact) card too, not shown while it spreads its designs (DC-8).
    expect(before.cards.map((card) => [cardOf(card), card.shown])).toEqual([
      [`${hidden.id}:`, true],
      [`${burka.id}:`, false],
      [`${burka.id}:${burka.designs.first}`, true],
      [`${burka.id}:${burka.designs.second}`, true],
      [`${plain.id}:`, true],
    ]);
    expect(before.cards[0]).toMatchObject({ active: false, placed: false, mode: null });
    expect(before.cards[1]).toMatchObject({ mode: 'designs' });
    expect(before.cards[3]).toMatchObject({ designNumber: 2, image: { id: burka.photos.striped } });

    const order = [
      { productId: burka.id, designId: burka.designs.second },
      { productId: plain.id, designId: null },
      { productId: burka.id, designId: burka.designs.first },
      { productId: hidden.id, designId: null },
    ];
    const saved = await shop.put('/storefront/design/cards/order', { cards: order });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect((saved.body as SellerCards).cards.filter((card) => card.shown).map(cardOf)).toEqual(
      order.map(cardOf),
    );
    expect(
      (saved.body as SellerCards).cards.filter((card) => card.shown).every((card) => card.placed),
    ).toBe(true);

    // The shop's default list follows it at once (the hidden product is not in the shop).
    const featured = (await list(key, 'designs=true')).products;
    expect(featured.map(cardOf)).toEqual(order.slice(0, 3).map(cardOf));
    // One card per product, each at its first card's place.
    expect((await list(key, '')).products.map(cardOf)).toEqual([`${burka.id}:`, `${plain.id}:`]);

    // A product added after the order comes first until it is placed.
    const fresh = await product(shop, 'Kids frock', []);
    // (Its own question: the version is read through a cache of a few seconds, so the same question could be answered
    // as before for that long -- CCH-04.)
    expect((await list(key, 'designs=true&limit=10')).products.map(cardOf)[0]).toBe(`${fresh.id}:`);

    // A card that is not the shop's, or one named twice, is refused.
    for (const cards of [
      [...order, { productId: plain.id, designId: burka.designs.first }],
      [...order, order[0]],
    ]) {
      const refused = await shop.put('/storefront/design/cards/order', { cards });
      expect(refused.status).toBe(400);
      expect(fieldsOf(refused)).toEqual({ cards: 'not_found' });
    }
  });

  it('turns design cards off for the whole shop at once, and says so on the public shop read', async () => {
    const shop = await openShop(port, texts, 'switch');
    const burka = await designedBurka(shop);
    const key = await keyFor(shop);
    const off = await shop.put('/storefront/design/cards/designs', { on: false });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect(off.body).toMatchObject({
      designCards: false,
      cards: [{ productId: burka.id, designId: null }],
    });
    const read = await callApi('/v1/shop', key);
    expect((read.body as { design: { designCards: boolean } }).design.designCards).toBe(false);
    const on = await shop.put('/storefront/design/cards/designs', { on: true });
    expect((on.body as SellerCards).cards.filter((card) => card.shown)).toHaveLength(2);
    expect(
      ((await callApi('/v1/shop', key)).body as { design: { designCards: boolean } }).design
        .designCards,
    ).toBe(true);
  });

  it("shows a product's one compact card, or it and its designs, as the seller picks (DC-8)", async () => {
    const shop = await openShop(port, texts, 'modes');
    const burka = await designedBurka(shop);
    const key = await keyFor(shop);
    const save = (mode: string, cards: { productId: string; designId: string | null }[]) =>
      shop.put('/storefront/design/cards/order', { cards, modes: [{ productId: burka.id, mode }] });

    const compact = await save('compact', [{ productId: burka.id, designId: null }]);
    expect(compact.status, JSON.stringify(compact.body)).toBe(200);
    expect((compact.body as SellerCards).cards.filter((card) => card.shown).map(cardOf)).toEqual([
      `${burka.id}:`,
    ]);
    expect((await list(key, 'designs=true')).products.map(cardOf)).toEqual([`${burka.id}:`]);

    const order = [
      { productId: burka.id, designId: burka.designs.second },
      { productId: burka.id, designId: null },
      { productId: burka.id, designId: burka.designs.first },
    ];
    expect((await save('both', order)).status).toBe(200);
    expect((await list(key, 'designs=true&limit=5')).products.map(cardOf)).toEqual(
      order.map(cardOf),
    );

    // Only a product with designs to spread has a way.
    const plain = await product(shop, 'Cotton saree', []);
    const refused = await shop.put('/storefront/design/cards/order', {
      cards: order,
      modes: [{ productId: plain.id, mode: 'both' }],
    });
    expect(refused.status).toBe(400);
  });
});
