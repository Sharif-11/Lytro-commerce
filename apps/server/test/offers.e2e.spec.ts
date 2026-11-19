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

// OFFERS-PLAN (the owner, 2026-11-18 and 19): an offer cuts the price of whole products or single designs, sets each
// size's own price with the old one struck through, changes live, locks those prices in the product editor, takes in a
// size added later, and End puts every price back exactly. Its link answers for shoppers while it runs and once it has
// ended. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_offers_test';
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
  process.env['OTP_SECRET'] = 'offers-e2e-otp-secret-0123456789abcdef0123';
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

interface OfferItemView {
  productId: string;
  designId: string | null;
  price: { low: string; high: string } | null;
  was: { low: string; high: string } | null;
  offer: { low: string; high: string } | null;
  belowOne: boolean;
  heldBy: { offerId: string; name: string } | null;
}

interface OfferView {
  id: string;
  slug: string;
  state: string;
  items: OfferItemView[];
}

/** Every size of these products with its own price and regular price, as stored. */
async function sizes(productIds: string[]): Promise<string[]> {
  const read = await admin.query<{
    id: string;
    price: string | null;
    regular_price: string | null;
  }>(
    `SELECT id, price, regular_price FROM tenant.product_variants
     WHERE product_id = ANY($1::uuid[]) AND deleted_at IS NULL AND NOT is_stock_holder ORDER BY id`,
    [productIds],
  );
  return read.rows.map((row) => `${row.id} ${row.price ?? '-'} ${row.regular_price ?? '-'}`);
}

/** The own prices of one design's sizes. */
async function designPrices(designId: string): Promise<string[]> {
  const read = await admin.query<{ price: string | null; regular_price: string | null }>(
    `SELECT v.price, v.regular_price FROM tenant.product_variants v
     JOIN tenant.variant_attribute_values va ON va.variant_id = v.id AND va.option_id = $1
     WHERE v.deleted_at IS NULL ORDER BY v.id`,
    [designId],
  );
  return read.rows.map((row) => `${row.price ?? '-'} ${row.regular_price ?? '-'}`);
}

async function simple(shop: ShopClient, name: string, price: number, regular?: number) {
  const made = await shop.post('/products', {
    name,
    basePrice: price,
    ...(regular === undefined ? {} : { regularPrice: regular }),
    stockTracking: 'not_tracked',
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as { id: string };
}

async function offer(shop: ShopClient, body: Record<string, unknown>): Promise<OfferView> {
  const made = await shop.post('/offers', body);
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as OfferView;
}

describeIfDatabase('offers (OFFERS-PLAN)', () => {
  it('sets each size of a whole product or one design to the offer price, and End puts every price back exactly', async () => {
    const shop = await openShop(port, texts, 'offer-start');
    const plain = await simple(shop, 'Cotton saree', 3500);
    const onSale = await simple(shop, 'Silk scarf', 900, 1000);
    const burka = await designedBurka(shop);
    const before = await sizes([plain.id, onSale.id, burka.id]);
    const key = await keyFor(shop);

    const started = await offer(shop, {
      name: 'Eid offer',
      cut: { kind: 'percent', amount: 20 },
      items: [
        { productId: plain.id, designId: null },
        { productId: onSale.id, designId: null },
        { productId: burka.id, designId: burka.designs.second },
      ],
      start: true,
    });
    expect(started.state).toBe('running');
    expect(started.slug).toBe('eid-offer');
    // OF-10: cut from today's price, the regular price it was already on sale from still struck through.
    expect(started.items.map((item) => [item.price?.low, item.was?.low, item.offer?.low])).toEqual([
      ['3500.00', '3500.00', '2800.00'],
      ['3900.00', '3900.00', '3120.00'],
      ['900.00', '1000.00', '720.00'],
    ]);
    // Only the second design's sizes move; the first design sells as before.
    expect(await designPrices(burka.designs.second)).toEqual([
      '3120.00 3900.00',
      '3120.00 3900.00',
    ]);
    expect(await designPrices(burka.designs.first)).toEqual(['- -', '- -']);
    const shown = (await list(key, 'designs=true&limit=10')).products;
    const plainCard = shown.find((card) => card.id === plain.id) as Card & {
      minRegularPrice: string | null;
    };
    expect([plainCard.minPrice, plainCard.minRegularPrice]).toEqual(['2800.00', '3500.00']);

    // The shop's own read of the offer, and its link for shoppers.
    const read = await callApi('/v1/catalogue/offers/eid-offer', key);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(read.body).toMatchObject({ name: 'Eid offer', state: 'running', products: 3 });
    const cards = (await list(key, 'offer=eid-offer&designs=true')).products.map(cardOf);
    expect(cards.sort()).toEqual(
      [`${plain.id}:`, `${onSale.id}:`, `${burka.id}:${burka.designs.second}`].sort(),
    );

    const ended = await shop.post(`/offers/${started.id}/end`, {});
    expect(ended.status, JSON.stringify(ended.body)).toBe(200);
    expect((ended.body as OfferView).state).toBe('ended');
    expect(await sizes([plain.id, onSale.id, burka.id])).toEqual(before);
    // OF-12: the ended offer's link still answers, with the same cards at their own prices.
    // (The version is read through a cache of a few seconds, so the same question may be answered as before for that
    // long -- CCH-04.)
    await expect
      .poll(
        async () =>
          ((await callApi('/v1/catalogue/offers/eid-offer', key)).body as { state: string }).state,
        {
          timeout: 15_000,
        },
      )
      .toBe('ended');
    const back = (await list(key, 'offer=eid-offer&designs=true&limit=10')).products;
    expect(back.find((card) => card.id === plain.id)?.minPrice).toBe('3500.00');
  });

  it('rounds down to whole taka, refuses a cut below ৳1, and holds a design for one offer at a time', async () => {
    const shop = await openShop(port, texts, 'offer-rules');
    const odd = await simple(shop, 'Cotton kurti', 1190);
    const cheap = await simple(shop, 'Hair band', 450);
    const burka = await designedBurka(shop);

    const rounded = await offer(shop, {
      name: 'Puja offer',
      cut: { kind: 'percent', amount: 15 },
      items: [{ productId: odd.id, designId: null }],
      start: true,
    });
    // OF-11: 15% off ৳1,190 is ৳1,011.50, sold at ৳1,011.
    expect(rounded.items[0]?.offer?.low).toBe('1011.00');

    const tooBig = await shop.post('/offers', {
      name: 'Flash sale',
      cut: { kind: 'taka', amount: 700 },
      items: [{ productId: cheap.id, designId: null }],
      start: true,
    });
    expect(tooBig.status).toBe(400);
    expect(fieldsOf(tooBig)).toEqual({ cut: 'too_large' });
    const tooMuch = await shop.post('/offers', {
      name: 'Flash sale',
      cut: { kind: 'percent', amount: 95 },
      items: [{ productId: cheap.id, designId: null }],
      start: false,
    });
    expect(tooMuch.status).toBe(400);

    // OF-16: a not-started offer holds the first design; the burka whole is refused, its second design is not.
    const waiting = await offer(shop, {
      name: 'Winter offer',
      cut: { kind: 'percent', amount: 10 },
      items: [{ productId: burka.id, designId: burka.designs.first }],
      start: false,
    });
    expect(waiting.state).toBe('waiting');
    expect(await designPrices(burka.designs.first)).toEqual(['- -', '- -']);
    const whole = await shop.post('/offers', {
      name: 'Eid offer',
      cut: { kind: 'percent', amount: 20 },
      items: [{ productId: burka.id, designId: null }],
      start: true,
    });
    expect(whole.status).toBe(409);
    expect(fieldsOf(whole)).toEqual({ items: 'taken' });
    const other = await offer(shop, {
      name: 'Eid offer',
      cut: { kind: 'percent', amount: 20 },
      items: [{ productId: burka.id, designId: burka.designs.second }],
      start: true,
    });
    expect(other.state).toBe('running');

    // The picker says who holds what.
    const picker = await shop.get('/offers/pickable');
    expect(picker.status, JSON.stringify(picker.body)).toBe(200);
    const row = (
      picker.body as {
        products: {
          productId: string;
          designs: { designId: string; heldBy: { name: string } | null }[];
        }[];
      }
    ).products.find((each) => each.productId === burka.id);
    expect(row?.designs.map((design) => design.heldBy?.name ?? null)).toEqual([
      'Winter offer',
      'Eid offer',
    ]);
  });

  it('changes a running offer live, locks its prices in the product editor, and takes in a size added later', async () => {
    const shop = await openShop(port, texts, 'offer-live');
    const plain = await simple(shop, 'Cotton saree', 3500);
    const extra = await simple(shop, 'Linen panjabi', 2000);
    const burka = await designedBurka(shop);
    const before = await sizes([plain.id]);
    const running = await offer(shop, {
      name: 'Eid offer',
      cut: { kind: 'percent', amount: 20 },
      items: [
        { productId: plain.id, designId: null },
        { productId: burka.id, designId: burka.designs.second },
      ],
      start: true,
    });

    // OF-17: a size the offer priced keeps its price; the product whole keeps its own price.
    const variants = (await shop.get(`/products/${burka.id}`)).body as {
      variants: { id: string; price: string | null; combinationKey?: string }[];
      offers: { name: string; designIds: string[] | null; lockedVariantIds: string[] }[];
    };
    expect(variants.offers).toEqual([
      expect.objectContaining({ name: 'Eid offer', designIds: [burka.designs.second] }),
    ]);
    expect(variants.offers[0]?.lockedVariantIds).toHaveLength(2);
    const lockedPrice = await shop.patch(`/products/${plain.id}`, { basePrice: 3000 });
    expect(lockedPrice.status).toBe(409);
    expect(fieldsOf(lockedPrice)).toEqual({ basePrice: 'not_allowed' });
    const list1 = (await shop.get('/products')).body as {
      products: { id: string; offer: { name: string } | null }[];
    };
    expect(list1.products.find((row) => row.id === plain.id)?.offer?.name).toBe('Eid offer');

    // OF-15: a new cut from what each size sold at when the offer took it; one product out, another in.
    const changed = await shop.patch(`/offers/${running.id}`, {
      cut: { kind: 'percent', amount: 25 },
      items: [
        { productId: extra.id, designId: null },
        { productId: burka.id, designId: burka.designs.second },
      ],
    });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(await designPrices(burka.designs.second)).toEqual([
      '2925.00 3900.00',
      '2925.00 3900.00',
    ]);
    expect(await sizes([plain.id])).toEqual(before);
    const extraNow = await admin.query<{ price: string }>(
      'SELECT price FROM tenant.product_variants WHERE product_id = $1 AND deleted_at IS NULL',
      [extra.id],
    );
    expect(extraNow.rows.map((row) => row.price)).toEqual(['1500.00']);
    expect((await shop.patch(`/products/${plain.id}`, { basePrice: 3000 })).status).toBe(200);

    // OF-19: a third size of the burka; the offered design's new size joins at 25% off.
    const attributes = (await shop.get('/attributes')).body as {
      id: string;
      name: string;
      scope: string;
    }[];
    const size = attributes.find((row) => row.name === 'Size' && row.scope === 'platform');
    if (!size) throw new Error('no platform Size attribute');
    // The burka's two sizes now, read from its variants.
    const current = await admin.query<{ option_id: string }>(
      `SELECT DISTINCT va.option_id FROM tenant.variant_attribute_values va
       JOIN tenant.attribute_options o ON o.id = va.option_id
       WHERE va.product_id = $1 AND o.attribute_id = $2`,
      [burka.id, size.id],
    );
    const added = await shop.post(`/attributes/${size.id}/options/batch`, { values: ['56-cards'] });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    const design = await admin.query<{ id: string }>(
      'SELECT id FROM tenant.attributes WHERE photo_designs',
    );
    const grown = await shop.put(`/products/${burka.id}/variants`, {
      variantAttributes: [
        {
          attributeId: design.rows[0]?.id,
          optionIds: [burka.designs.first, burka.designs.second],
        },
        {
          attributeId: size.id,
          optionIds: [
            ...current.rows.map((row) => row.option_id),
            ...(added.body as { id: string }[]).map((option) => option.id),
          ],
        },
      ],
    });
    expect(grown.status, JSON.stringify(grown.body)).toBe(200);
    // The new size sells at the product's own ৳3,500 (its design's ৳3,900 is the old sizes' own), so 25% off that.
    expect((await designPrices(burka.designs.second)).sort()).toEqual([
      '2625.00 3500.00',
      '2925.00 3900.00',
      '2925.00 3900.00',
    ]);
    expect(await designPrices(burka.designs.first)).toEqual(['- -', '- -', '- -']);
  });

  it('keeps an offer to its shop, hides one not started, runs it again and deletes only one not running', async () => {
    const shop = await openShop(port, texts, 'offer-own');
    const other = await openShop(port, texts, 'offer-other');
    const plain = await simple(shop, 'Cotton saree', 3500);
    const theirs = await simple(other, 'Their saree', 1200);
    const key = await keyFor(shop);

    const waiting = await offer(shop, {
      name: 'Eid offer',
      cut: { kind: 'taka', amount: 500 },
      items: [{ productId: plain.id, designId: null }],
      start: false,
    });
    // OF-21: a not-started offer is not public.
    expect((await callApi('/v1/catalogue/offers/eid-offer', key)).status).toBe(404);
    expect((await list(key, 'offer=eid-offer')).products).toEqual([]);
    // SEC-02: another shop neither reads it nor puts its product in one here.
    expect((await other.get(`/offers/${waiting.id}`)).status).toBe(404);
    expect((await other.post(`/offers/${waiting.id}/start`, {})).status).toBe(404);
    const foreign = await shop.post('/offers', {
      name: 'Theirs',
      cut: { kind: 'percent', amount: 10 },
      items: [{ productId: theirs.id, designId: null }],
      start: false,
    });
    expect(foreign.status).toBe(400);
    expect(fieldsOf(foreign)).toEqual({ items: 'not_found' });

    const started = await shop.post(`/offers/${waiting.id}/start`, {});
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    // Running, its link answers on this shop's key only.
    expect((await callApi('/v1/catalogue/offers/eid-offer', await keyFor(other))).status).toBe(404);
    expect((await shop.delete(`/offers/${waiting.id}`)).status).toBe(409);
    expect((await shop.post(`/offers/${waiting.id}/end`, {})).status).toBe(200);
    expect((await shop.patch(`/offers/${waiting.id}`, { name: 'Late' })).status).toBe(409);

    // OF-14: Run it again -- a not-started copy with its own link name.
    const copy = await shop.post(`/offers/${waiting.id}/copy`, {});
    expect(copy.status, JSON.stringify(copy.body)).toBe(201);
    expect(copy.body).toMatchObject({ state: 'waiting', slug: 'eid-offer-2', name: 'Eid offer' });
    const removed = await shop.delete(`/offers/${(copy.body as OfferView).id}`);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect((removed.body as { offers: unknown[] }).offers).toHaveLength(1);
  });
});
