import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import type { MessageKey } from '../src/common/i18n/message-key';
import { translate } from '../src/common/i18n/messages';
import { MediaProcessor } from '../src/modules/media/services/media-processor';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { postJson, sendExact, type HttpResult } from './support/http';
import { MemoryStorage } from './support/memory-storage';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Photo designs (ATR-19, ATR-20; PHOTO-DESIGNS-PLAN PD-1 to PD-28): a product's own photos are its designs. A photos
// save groups them into designs, numbered once; a design and a size name one variant; the order line keeps the design's
// cover, whatever happens to the photos later, and the photo is kept while an order shows it; the shopper sees the
// photo, never the design's name; the feed, the duplicate and the public product follow. Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_photo_designs_test';
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
  process.env['OTP_SECRET'] = 'photo-designs-e2e-otp-secret-0123456789abcdef';
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

function said(key: MessageKey, params: Record<string, string | number> = {}): string {
  return translate(key, 'bn', params);
}

interface Detail {
  id: string;
  slug: string;
  images: { id: string; width: number | null; height: number | null; designId: string | null }[];
  designs: { id: string; name: string; number: number; photoIds: string[] }[];
  variants: { id: string; optionIds: string[]; sku: string | null }[];
}

/** A tall (2:3) photo, like a model shot, in its own colour so each one is a different file. */
async function upload(shop: ShopClient, shade: number): Promise<string> {
  const file = await sharp({
    create: { width: 600, height: 900, channels: 3, background: { r: shade, g: 80, b: 120 } },
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

async function photos(shop: ShopClient, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let n = 0; n < count; n += 1) ids.push(await upload(shop, 40 + n * 30));
  return ids;
}

async function burka(shop: ShopClient, imageIds: string[], name = 'Irani burka'): Promise<Detail> {
  const made = await shop.post('/products', {
    name,
    basePrice: 3500,
    stockTracking: 'not_tracked',
    imageIds,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as Detail;
}

function saveDesigns(
  shop: ShopClient,
  productId: string,
  placed: [string, string | null][],
  designs: { key: string; id?: string; name?: string }[],
): Promise<HttpResult> {
  return shop.put(`/products/${productId}/images`, {
    photos: placed.map(([mediaId, design]) => ({ mediaId, design })),
    designs,
  });
}

async function attributeIds(shop: ShopClient): Promise<{ size: string; design: string }> {
  const rows = (await shop.get('/attributes')).body as {
    id: string;
    name: string;
    scope: string;
  }[];
  const size = rows.find((row) => row.name === 'Size' && row.scope === 'platform');
  if (!size) throw new Error('no platform Size attribute');
  const design = await admin.query<{ id: string }>(
    'SELECT id FROM tenant.attributes WHERE photo_designs',
  );
  return { size: size.id, design: design.rows[0]?.id ?? '' };
}

async function sizes(shop: ShopClient, attributeId: string, values: string[]): Promise<string[]> {
  const made = await shop.post(`/attributes/${attributeId}/options/batch`, { values });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { id: string }[]).map((option) => option.id);
}

/** Two designs (the second with two photos) and a plain photo, in a burka sold in two sizes. */
async function designedBurka(shop: ShopClient, name = 'Irani burka') {
  const [black, stripedFront, stripedBack, pair] = await photos(shop, 4);
  const made = await burka(shop, [black, stripedFront, stripedBack, pair].map(String), name);
  const saved = await saveDesigns(
    shop,
    made.id,
    [
      [String(black), 'a'],
      [String(stripedFront), 'b'],
      [String(stripedBack), 'b'],
      [String(pair), null],
    ],
    [
      { key: 'a', name: 'ডিজাইন 1' },
      { key: 'b', name: 'ডিজাইন 2' },
    ],
  );
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const detail = saved.body as Detail;
  const { size, design } = await attributeIds(shop);
  const [s54, s56] = await sizes(shop, size, [`54-${name}`, `56-${name}`]);
  const split = await shop.put(`/products/${made.id}/variants`, {
    variantAttributes: [
      { attributeId: design, optionIds: detail.designs.map((row) => row.id) },
      { attributeId: size, optionIds: [String(s54), String(s56)] },
    ],
  });
  expect(split.status, JSON.stringify(split.body)).toBe(200);
  return {
    detail: split.body as Detail,
    photos: {
      black: String(black),
      stripedFront: String(stripedFront),
      stripedBack: String(stripedBack),
      pair: String(pair),
    },
    sizes: { s54: String(s54), s56: String(s56) },
    attributes: { size, design },
  };
}

async function order(shop: ShopClient, variantId: string): Promise<string> {
  const locations = (await shop.get('/locations')).body as {
    zillas: { thanas: { id: number }[] }[];
  };
  const made = await postJson(
    port,
    '/orders',
    {
      customerName: 'Rumana',
      phone: '01711000123',
      locationId: locations.zillas[0]?.thanas[0]?.id,
      deliveryAddress: 'Road 3, Mirpur',
      items: [{ variantId, quantity: 1 }],
    },
    shop.headers({ 'idempotency-key': randomUUID() }),
  );
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { id: string }).id;
}

describeIfDatabase("a product's photos as its designs (ATR-19, PD-2, PD-13, PD-14, PD-16)", () => {
  it('saves photos into designs, numbered once, each with its photos in order, and keeps the old way plain', async () => {
    const shop = await openShop(port, texts, 'designs');
    const ids = await photos(shop, 4);
    const made = await burka(shop, ids);
    expect(made.designs).toEqual([]);
    const saved = await saveDesigns(
      shop,
      made.id,
      [
        [String(ids[0]), 'a'],
        [String(ids[1]), 'b'],
        [String(ids[2]), 'b'],
        [String(ids[3]), null],
      ],
      [{ key: 'a', name: 'ডিজাইন 1' }, { key: 'b' }],
    );
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const detail = saved.body as Detail;
    expect(
      detail.designs.map(({ name, number, photoIds }) => ({ name, number, photoIds })),
    ).toEqual([
      { name: 'ডিজাইন 1', number: 1, photoIds: [ids[0]] },
      { name: 'D2', number: 2, photoIds: [ids[1], ids[2]] },
    ]);
    const [one, two] = detail.designs;
    // PD-28: every photo says its design and its pixels.
    expect(detail.images.map((image) => image.designId)).toEqual([one?.id, two?.id, two?.id, null]);
    expect(detail.images[0]).toMatchObject({ width: 600, height: 900 });

    // A rename keeps the design and its number; dropping design 1 retires it, and a new one takes 3, never 1 again.
    const again = await saveDesigns(
      shop,
      made.id,
      [
        [String(ids[1]), 'b'],
        [String(ids[2]), 'b'],
        [String(ids[0]), null],
        [String(ids[3]), 'c'],
      ],
      [
        { key: 'b', id: two?.id, name: 'স্ট্রাইপ' },
        { key: 'c', name: 'ডিজাইন 3' },
      ],
    );
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    const kept = (again.body as Detail).designs;
    expect(kept.map(({ name, number }) => ({ name, number }))).toEqual([
      { name: 'স্ট্রাইপ', number: 2 },
      { name: 'ডিজাইন 3', number: 3 },
    ]);
    expect(kept[0]?.id).toBe(two?.id);
    expect(kept[1]?.id).not.toBe(one?.id);

    // As before (mediaIds): every photo plain, every design gone.
    const plain = await shop.put(`/products/${made.id}/images`, { mediaIds: ids });
    expect(plain.status, JSON.stringify(plain.body)).toBe(200);
    expect((plain.body as Detail).designs).toEqual([]);
    expect((plain.body as Detail).images.every((image) => image.designId === null)).toBe(true);
  });

  it("names a design once within its product, any product its own 'ডিজাইন 1', and refuses another product's", async () => {
    const shop = await openShop(port, texts, 'designs');
    const ids = await photos(shop, 3);
    const first = await burka(shop, [String(ids[0]), String(ids[1])], 'Burka one');
    const second = await burka(shop, [String(ids[2])], 'Burka two');
    const twice = await saveDesigns(
      shop,
      first.id,
      [
        [String(ids[0]), 'a'],
        [String(ids[1]), 'b'],
      ],
      [
        { key: 'a', name: 'ডিজাইন 1' },
        { key: 'b', name: 'ডিজাইন 1' },
      ],
    );
    expect(twice.status).toBe(400);
    expect(fieldsOf(twice)).toMatchObject({ 'designs.1.name': 'taken' });
    const one = await saveDesigns(
      shop,
      first.id,
      [
        [String(ids[0]), 'a'],
        [String(ids[1]), null],
      ],
      [{ key: 'a', name: 'ডিজাইন 1' }],
    );
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    const own = await saveDesigns(
      shop,
      second.id,
      [[String(ids[2]), 'a']],
      [{ key: 'a', name: 'ডিজাইন 1' }],
    );
    expect(own.status, JSON.stringify(own.body)).toBe(200);
    // Another product's design is not this one's to show.
    const borrowed = await saveDesigns(
      shop,
      second.id,
      [[String(ids[2]), 'x']],
      [{ key: 'x', id: (one.body as Detail).designs[0]?.id }],
    );
    expect(borrowed.status).toBe(400);
    expect(fieldsOf(borrowed)).toMatchObject({ 'designs.0.id': 'not_found' });
  });

  it('keeps the Design attribute off the attribute screens and their option routes', async () => {
    const shop = await openShop(port, texts, 'designs');
    const { design } = await attributeIds(shop);
    const rows = (await shop.get('/attributes')).body as { id: string }[];
    expect(rows.some((row) => row.id === design)).toBe(false);
    const added = await shop.post(`/attributes/${design}/options`, { value: 'Hand made' });
    expect(added.status).toBe(409);
    expect(errorOf(added).message).toBe(said('DesignsAddedByPhotos'));
    const made = await burka(shop, []);
    const described = await shop.put(`/products/${made.id}/attributes`, {
      attributes: [{ attributeId: design, role: 'informational', optionIds: [] }],
    });
    expect(described.status).toBe(400);
  });
});

describeIfDatabase(
  'a design and a size name one variant (ATR-19, PD-1, PD-10, PD-13, PD-16)',
  () => {
    it('splits by design and size and fills each variant a SKU, unique in the shop', async () => {
      const shop = await openShop(port, texts, 'designs');
      const { detail } = await designedBurka(shop);
      expect(detail.variants).toHaveLength(4);
      const skus = detail.variants.map((variant) => variant.sku).sort();
      expect(
        skus.every((sku) => sku !== null && /^IB-D[12]-\d\d-IRANIBURKA$|^IB-D[12]-/.test(sku)),
      ).toBe(true);
      expect(new Set(skus).size).toBe(4);
      // A second product with the same initials gets its own, unique, SKUs.
      const { detail: other } = await designedBurka(shop, 'Irani Bridal');
      const all = [...skus, ...other.variants.map((variant) => variant.sku)];
      expect(new Set(all).size).toBe(8);
    });

    it("refuses another product's design in its variants", async () => {
      const shop = await openShop(port, texts, 'designs');
      const one = await designedBurka(shop, 'Burka A');
      const two = await designedBurka(shop, 'Burka B');
      const mixed = await shop.put(`/products/${two.detail.id}/variants`, {
        variantAttributes: [
          {
            attributeId: two.attributes.design,
            optionIds: [String(one.detail.variants[0]?.optionIds[0])],
          },
        ],
      });
      expect(mixed.status).toBe(400);
    });

    it('retires a design that no photo shows, and its variants with it', async () => {
      const shop = await openShop(port, texts, 'designs');
      const { detail, photos: p } = await designedBurka(shop);
      const [one, two] = detail.designs;
      const dropped = await saveDesigns(
        shop,
        detail.id,
        [
          [p.stripedFront, 'b'],
          [p.stripedBack, 'b'],
          [p.black, null],
          [p.pair, null],
        ],
        [{ key: 'b', id: two?.id }],
      );
      expect(dropped.status, JSON.stringify(dropped.body)).toBe(200);
      const after = dropped.body as Detail;
      expect(after.designs.map((row) => row.id)).toEqual([two?.id]);
      expect(after.variants.every((variant) => !variant.optionIds.includes(String(one?.id)))).toBe(
        true,
      );
      expect(after.variants).toHaveLength(2);
    });

    it('gives a duplicate its own designs, its variants and photos showing them (PRD-18)', async () => {
      const shop = await openShop(port, texts, 'designs');
      const { detail } = await designedBurka(shop);
      const copied = await shop.post(`/products/${detail.id}/duplicate`, {});
      expect(copied.status, JSON.stringify(copied.body)).toBe(201);
      const copy = (await shop.get(`/products/${(copied.body as { id: string }).id}`))
        .body as Detail;
      expect(copy.designs.map(({ name, number }) => ({ name, number }))).toEqual(
        detail.designs.map(({ name, number }) => ({ name, number })),
      );
      const sourceIds = new Set(detail.designs.map((row) => row.id));
      const copyIds = new Set(copy.designs.map((row) => row.id));
      expect([...copyIds].some((id) => sourceIds.has(id))).toBe(false);
      expect(copy.images.map((image) => image.designId === null)).toEqual(
        detail.images.map((image) => image.designId === null),
      );
      expect(
        copy.images.every((image) => image.designId === null || copyIds.has(image.designId)),
      ).toBe(true);
      expect(
        copy.variants.every((variant) => variant.optionIds.some((id) => copyIds.has(id))),
      ).toBe(true);
    });
  },
);

describeIfDatabase(
  'the order keeps the design that was chosen (ATR-20, PD-6, PD-7, PD-8, PD-22)',
  () => {
    it("pins the design's cover on the line, through every later edit of the photos, and keeps the photo", async () => {
      const shop = await openShop(port, texts, 'designs');
      const { detail, photos: p } = await designedBurka(shop);
      const striped = detail.designs[1];
      const variant = detail.variants.find((row) => row.optionIds.includes(String(striped?.id)));
      const orderId = await order(shop, String(variant?.id));
      const read = async () =>
        (await shop.get(`/orders/${orderId}`)).body as {
          trackingId: string;
          items: {
            thumbnail: { mediaId: string } | null;
            attributes: { value: string; design?: true }[];
          }[];
        };
      const placed = await read();
      expect(placed.items[0]?.thumbnail?.mediaId).toBe(p.stripedFront);
      expect(placed.items[0]?.attributes).toContainEqual(
        expect.objectContaining({ value: 'ডিজাইন 2', design: true }),
      );

      // The seller reorders the design's photos, renames it and takes its cover off the product.
      const edited = await saveDesigns(
        shop,
        detail.id,
        [
          [p.stripedBack, 'b'],
          [p.black, 'a'],
          [p.pair, null],
        ],
        [
          { key: 'a', id: detail.designs[0]?.id },
          { key: 'b', id: striped?.id, name: 'স্ট্রাইপ' },
        ],
      );
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
      const later = await read();
      expect(later.items[0]?.thumbnail?.mediaId).toBe(p.stripedFront);
      expect(later.items[0]?.attributes).toContainEqual(
        expect.objectContaining({ value: 'ডিজাইন 2', design: true }),
      );
      // PD-8: the order's photo stays, even off every product.
      expect((await shop.delete(`/media/${p.stripedFront}`)).status).toBe(409);

      // PD-22: the order picker shows the design's variant by its design's cover.
      const picker = (await shop.get(`/orders/picker/${detail.id}`)).body as {
        variants: { variantId: string; image: string | null }[];
      };
      const picked = picker.variants.find((row) => row.variantId === variant?.id);
      expect(picked?.image).toContain(p.stripedBack);

      // PD-6: the shopper's tracking shows the photo, never the design's name.
      const key = await shop.post('/api-keys', { name: 'Website', websites: [SITE] });
      expect(key.status, JSON.stringify(key.body)).toBe(201);
      const tracked = await sendExact(port, 'GET', `/v1/track/${placed.trackingId}`, undefined, {
        host: API_HOST,
        authorization: `Bearer ${(key.body as { key: string }).key}`,
        origin: SITE,
      });
      expect(tracked.status, JSON.stringify(tracked.body)).toBe(200);
      const item = (
        tracked.body as { items: { thumbnail: string | null; attributes: { value: string }[] }[] }
      ).items[0];
      expect(item?.thumbnail).toContain(p.stripedFront);
      expect(item?.attributes.some((row) => row.value === 'ডিজাইন 2')).toBe(false);
    });
  },
);

describeIfDatabase('the public product (ATR-19, PD-4, PD-28)', () => {
  it('marks the designs option, and gives each photo its design and pixels', async () => {
    const shop = await openShop(port, texts, 'designs');
    const { detail } = await designedBurka(shop);
    const key = await shop.post('/api-keys', { name: 'Website', websites: [SITE] });
    const answer = await sendExact(
      port,
      'GET',
      `/v1/catalogue/products/${detail.slug}`,
      undefined,
      {
        host: API_HOST,
        authorization: `Bearer ${(key.body as { key: string }).key}`,
        origin: SITE,
      },
    );
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    const product = answer.body as {
      images: {
        id: string;
        designId: string | null;
        width: number | null;
        height: number | null;
      }[];
      options: { designs: boolean; values: { id: string }[] }[];
    };
    const designs = product.options.find((option) => option.designs);
    expect(designs?.values.map((value) => value.id).sort()).toEqual(
      detail.designs.map((row) => row.id).sort(),
    );
    expect(product.options.filter((option) => !option.designs)).toHaveLength(1);
    expect(product.images.map((image) => image.designId)).toEqual(
      detail.images.map((image) => image.designId),
    );
    expect(product.images[0]).toMatchObject({ width: 600, height: 900 });
  });
});
