import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PRODUCT_IMAGES_MAX } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import type { MessageKey } from '../src/common/i18n/message-key';
import { translate } from '../src/common/i18n/messages';
import { PlanLimitOverridesService } from '../src/modules/billing/services/plan-limit-overrides.service';
import { MediaDeleter } from '../src/modules/media/services/media-deleter';
import { MediaEraser } from '../src/modules/media/services/media-eraser';
import { MediaProcessor } from '../src/modules/media/services/media-processor';
import type { MediaDeletePayload } from '../src/modules/media/services/media.service';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { MemoryStorage } from './support/memory-storage';
import { prepareTestDatabase } from './support/database';
import { getJson, postJson, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 6a: media -- starting an upload, the browser's signed send, processing by content into a WebP picture
// and thumbnail under the shop's prefix, storage use and its limit, the library, attaching images to products,
// categories, swatches, size charts and the logo, deleting, and the day-60 wipe. MED-01, MED-03, MED-04, MED-08,
// MED-09, MED-11; STO-01 to STO-04, STO-06, STO-07; PRD-11; TEN-16. The store is an in-memory stand-in for R2 that
// refuses any file but the one signed for, as R2 does (D3-4); test/media-storage.spec.ts runs the real store. Runs
// only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_media_test';

// Image work on one thread here, so this file leaves the other spec files their share of the machine.
sharp.concurrency(1);
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

interface MediaView {
  id: string;
  kind: string;
  status: string;
  purpose: string;
  width: number | null;
  height: number | null;
  bytes: number;
  urls: { main: string; thumbnail: string } | null;
  failure: string | null;
}

interface Started {
  media: MediaView;
  upload: { url: string; method: string; headers: Record<string, string> };
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const storage = new MemoryStorage();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'media-e2e-otp-secret-0123456789abcdefghijkl';
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

/** What the dashboard is told, in the default language (Bangla). */
function said(key: MessageKey, params: Record<string, string | number> = {}): string {
  return translate(key, 'bn', params);
}

/** A flat-coloured JPEG, small and quick. */
function photo(width = 800, height = 600): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 60, b: 90 } },
  })
    .jpeg()
    .toBuffer();
}

/** A JPEG of noise: large on disk, the way a phone photo is (STO-04's 4 MB case). */
function noisyPhoto(width: number, height: number): Promise<Buffer> {
  return sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

function start(
  shop: ShopClient,
  file: Buffer,
  body: Record<string, unknown> = {},
  headers?: Record<string, string>,
): Promise<HttpResult> {
  const request = {
    kind: 'image',
    contentType: 'image/jpeg',
    bytes: file.length,
    purpose: 'product_image',
    ...body,
  };
  return headers
    ? postJson(port, '/media/uploads', request, headers)
    : shop.post('/media/uploads', request);
}

/** Starts, sends and finishes an upload, then runs the processing job, as the worker would. */
async function upload(
  shop: ShopClient,
  file: Buffer,
  body: Record<string, unknown> = {},
  contentType = 'image/jpeg',
): Promise<MediaView> {
  const started = await start(shop, file, { contentType, ...body });
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  const { media, upload: link } = started.body as Started;
  expect(media.status).toBe('uploading');
  expect(storage.send(link.url, file, contentType)).toBe(200);
  const finished = await shop.post(`/media/${media.id}/finish`, {});
  expect(finished.status, JSON.stringify(finished.body)).toBe(201);
  expect((finished.body as MediaView).status).toBe('processing');
  await app.get(MediaProcessor).process(shop.tenantId, media.id);
  return (await shop.get(`/media/${media.id}`)).body as MediaView;
}

async function usage(shop: ShopClient): Promise<{ usedBytes: number; limitBytes: number | null }> {
  return (await shop.get('/media/usage')).body as { usedBytes: number; limitBytes: number | null };
}

/** The deletion jobs enqueued for the shop's files, run as the worker would (MED-07). */
async function runDeletions(): Promise<void> {
  const rows = await admin.query<{ id: string; payload: MediaDeletePayload }>(
    "SELECT id, payload FROM control.job_outbox WHERE queue_name = 'media_delete' AND status = 'pending'",
  );
  for (const row of rows.rows) {
    await app.get(MediaDeleter).delete(row.payload);
    await admin.query("UPDATE control.job_outbox SET status = 'sent' WHERE id = $1", [row.id]);
  }
}

async function product(shop: ShopClient, name = 'Kurti'): Promise<string> {
  const made = await shop.post('/products', { name, basePrice: 500 });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { id: string }).id;
}

describeIfDatabase('uploading and processing an image (MED-03, STO-04)', () => {
  it('stores a large JPEG smaller, as a 1600 px WebP and a 300 px thumbnail under the shop prefix', async () => {
    const shop = await openShop(port, texts, 'media');
    const file = await noisyPhoto(2600, 1500);
    expect(file.length).toBeGreaterThan(3 * 1024 * 1024);
    expect(file.length).toBeLessThanOrEqual(5 * 1024 * 1024);
    const before = await usage(shop);

    const ready = await upload(shop, file);
    expect(ready).toMatchObject({ status: 'ready', kind: 'image', width: 1600, height: 923 });
    expect(ready.failure).toBeNull();
    // MED-01, MED-08: under the shop's prefix, named by the content's fingerprint.
    const stem = `tenants/${shop.tenantId}/${ready.id}/`;
    expect(ready.urls?.main).toMatch(
      new RegExp(`^https://media\\.example\\.test/${stem}[0-9a-f]{32}\\.webp$`),
    );
    expect(ready.urls?.thumbnail).toBe(ready.urls?.main.replace('.webp', '.thumb.webp'));
    const stored = await storage.listMedia(stem);
    expect(stored).toHaveLength(2);
    const fileOf = (thumb: boolean): Buffer => {
      const key = stored.find((object) => object.key.includes('.thumb.') === thumb)?.key;
      const body = key === undefined ? undefined : storage.media.get(key);
      if (!body) throw new Error('the stored file is missing');
      return body;
    };
    const main = fileOf(false);
    const thumbnail = fileOf(true);
    expect((await sharp(main).metadata()).format).toBe('webp');
    expect((await sharp(thumbnail).metadata()).width).toBe(300);
    // STO-01: usage is the stored files, smaller than what was sent; the temporary upload is gone.
    expect(ready.bytes).toBe(main.length + thumbnail.length);
    expect(ready.bytes).toBeLessThan(file.length);
    expect((await usage(shop)).usedBytes).toBe(before.usedBytes + ready.bytes);
    expect(storage.uploads.has(`${shop.tenantId}/${ready.id}`)).toBe(false);
  });

  it('refuses an image over 5 MB before any file is sent', async () => {
    const shop = await openShop(port, texts, 'media');
    const started = await shop.post('/media/uploads', {
      kind: 'image',
      contentType: 'image/jpeg',
      bytes: 6 * 1024 * 1024,
      purpose: 'product_image',
    });
    expect(started.status).toBe(400);
    expect(fieldsOf(started)).toEqual({ bytes: 'too_large' });
    expect(errorOf(started).message).toBe(said('ImageTooLarge', { mb: 5 }));
    expect(((await shop.get('/media')).body as { total: number }).total).toBe(0);
  });

  it('refuses a renamed executable by its content, storing and counting nothing', async () => {
    const shop = await openShop(port, texts, 'media');
    const exe = Buffer.concat([Buffer.from('MZ\x90\x00\x03\x00\x00\x00'), randomBytes(4000)]);
    const refused = await upload(shop, exe);
    expect(refused).toMatchObject({
      status: 'failed',
      failure: 'not_supported',
      bytes: 0,
      urls: null,
    });
    expect(await storage.listMedia(`tenants/${shop.tenantId}/`)).toEqual([]);
    expect((await usage(shop)).usedBytes).toBe(0);
    expect(storage.uploads.has(`${shop.tenantId}/${refused.id}`)).toBe(false);
    // A refused item is not in the library.
    expect(((await shop.get('/media')).body as { total: number }).total).toBe(0);
  });

  it('takes only the file it signed for, and marks a never-sent upload refused', async () => {
    const shop = await openShop(port, texts, 'media');
    const file = await photo();
    const started = (await start(shop, file)).body as Started;
    // A bigger file, or another type, on the same link is refused by the store itself.
    expect(storage.send(started.upload.url, Buffer.concat([file, file]), 'image/jpeg')).toBe(403);
    expect(storage.send(started.upload.url, file, 'image/png')).toBe(403);
    expect(started.upload.headers).toEqual({ 'content-type': 'image/jpeg' });
    await shop.post(`/media/${started.media.id}/finish`, {});
    await app.get(MediaProcessor).process(shop.tenantId, started.media.id);
    const refused = (await shop.get(`/media/${started.media.id}`)).body as MediaView;
    expect(refused).toMatchObject({ status: 'failed', failure: 'not_uploaded' });
  });

  it('processes once: finishing or processing again changes nothing', async () => {
    const shop = await openShop(port, texts, 'media');
    const ready = await upload(shop, await photo());
    await app.get(MediaProcessor).process(shop.tenantId, ready.id);
    const again = await shop.post(`/media/${ready.id}/finish`, {});
    expect(again.status).toBe(201);
    expect(again.body).toMatchObject({ status: 'ready', bytes: ready.bytes });
    expect(await storage.listMedia(`tenants/${shop.tenantId}/`)).toHaveLength(2);
  });

  it('checks the place an upload names, and that the type matches what the place takes', async () => {
    const shop = await openShop(port, texts, 'media');
    const file = await photo();
    const missing = await start(shop, file, { targetId: randomUUID() });
    expect(missing.status).toBe(400);
    expect(fieldsOf(missing)).toEqual({ targetId: 'not_found' });
    const wrongType = await start(shop, file, { contentType: 'application/x-msdownload' });
    expect(fieldsOf(wrongType)).toEqual({ contentType: 'not_allowed' });
    const wrongKind = await start(shop, file, { purpose: 'product_video' });
    expect(fieldsOf(wrongKind)).toEqual({ purpose: 'not_allowed' });
    const logoWithPlace = await start(shop, file, { purpose: 'shop_logo', targetId: randomUUID() });
    expect(fieldsOf(logoWithPlace)).toEqual({ targetId: 'not_allowed' });
    const forProduct = await start(shop, file, { targetId: await product(shop) });
    expect(forProduct.status).toBe(201);
  });
});

describeIfDatabase('storage and its limit (STO-01 to STO-03, MED-11)', () => {
  it('refuses an upload that would not fit with plan_limit_reached, while existing images still load', async () => {
    const shop = await openShop(port, texts, 'media');
    const kept = await upload(shop, await photo());
    await app
      .get(PlanLimitOverridesService)
      .set(shop.tenantId, 'storage_mb', 1, 'storage limit test', randomUUID());
    expect((await usage(shop)).limitBytes).toBe(1024 * 1024);

    // Declared at 2 MB: refused before any file is sent.
    const refused = await start(shop, await photo(), { bytes: 2 * 1024 * 1024 });
    expect(refused.status).toBe(402);
    expect(errorOf(refused).code).toBe('plan_limit_reached');
    expect(errorOf(refused).message).toBe(said('StorageLimitReached', { mb: 1 }));
    const still = (await shop.get(`/media/${kept.id}`)).body as MediaView;
    expect(still.status).toBe('ready');
    expect(storage.media.size).toBeGreaterThan(0);
  });

  it('weighs the stored sizes again at the end, keeping nothing that no longer fits', async () => {
    const shop = await openShop(port, texts, 'media');
    const file = await photo();
    const started = (await start(shop, file)).body as Started;
    storage.send(started.upload.url, file, 'image/jpeg');
    await shop.post(`/media/${started.media.id}/finish`, {});
    // The room went while it was processing.
    await app
      .get(PlanLimitOverridesService)
      .set(shop.tenantId, 'storage_mb', 0, 'storage limit test', randomUUID());
    await app.get(MediaProcessor).process(shop.tenantId, started.media.id);
    const refused = (await shop.get(`/media/${started.media.id}`)).body as MediaView;
    expect(refused).toMatchObject({ status: 'failed', failure: 'storage_full', bytes: 0 });
    expect((await usage(shop)).usedBytes).toBe(0);
    await runDeletions();
    expect(await storage.listMedia(`tenants/${shop.tenantId}/`)).toEqual([]);
  });

  it('counts nothing against an unlimited plan', async () => {
    const shop = await openShop(port, texts, 'media');
    await app
      .get(PlanLimitOverridesService)
      .set(shop.tenantId, 'storage_mb', null, 'storage limit test', randomUUID());
    expect((await usage(shop)).limitBytes).toBeNull();
    expect((await upload(shop, await photo())).status).toBe('ready');
  });

  it('answers 503 with a retry hint while the store is away, and keeps nothing (MED-11)', async () => {
    const shop = await openShop(port, texts, 'media');
    storage.down = true;
    try {
      const refused = await start(shop, await photo());
      expect(refused.status).toBe(503);
      expect(errorOf(refused).code).toBe('service_unavailable');
      expect(errorOf(refused).message).toBe(said('StorageUnavailable'));
      expect(refused.headers['retry-after']).toBe('60');
    } finally {
      storage.down = false;
    }
    const rows = await admin.query('SELECT 1 FROM tenant.media WHERE tenant_id = $1', [
      shop.tenantId,
    ]);
    expect(rows.rowCount).toBe(0);
  });
});

describeIfDatabase('attaching images (PRD-11, PRD-17, ATR-18, TEN-16)', () => {
  it("sets a product's photos in order, shows them on the product and the list, and copies them", async () => {
    const shop = await openShop(port, texts, 'media');
    const id = await product(shop);
    const first = await upload(shop, await photo(), { targetId: id });
    const second = await upload(shop, await photo(400, 400));
    const saved = await shop.put(`/products/${id}/images`, { mediaIds: [second.id, first.id] });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const detail = saved.body as {
      images: { id: string; urls: { main: string }; bytes: number }[];
    };
    expect(detail.images.map((image) => image.id)).toEqual([second.id, first.id]);
    expect(detail.images[0]?.urls.main).toBe(second.urls?.main);
    // STO-01: each with the bytes /media counts for it, every file of it, so the media sheet's share agrees with Usage.
    expect(first.bytes).toBeGreaterThan(0);
    expect(detail.images.map((image) => image.bytes)).toEqual([second.bytes, first.bytes]);
    const list = (await shop.get('/products')).body as {
      products: { id: string; image: { id: string } | null }[];
    };
    expect(list.products.find((row) => row.id === id)?.image?.id).toBe(second.id);

    // PRD-18: the copy shows the same photos.
    const copy = (await shop.post(`/products/${id}/duplicate`, {})).body as {
      images: { id: string }[];
    };
    expect(copy.images.map((image) => image.id)).toEqual([second.id, first.id]);

    const cleared = (await shop.put(`/products/${id}/images`, { mediaIds: [] })).body as {
      images: unknown[];
    };
    expect(cleared.images).toEqual([]);
    // Removing a photo keeps it in the library.
    expect(((await shop.get('/media')).body as { total: number }).total).toBe(2);
  });

  it('attaches only ready images of the shop, up to the limit, each once', async () => {
    const shop = await openShop(port, texts, 'media');
    const other = await openShop(port, texts, 'media');
    const id = await product(shop);
    const theirs = await upload(other, await photo());
    const pending = (await start(shop, await photo())).body as Started;
    for (const mediaId of [theirs.id, pending.media.id, randomUUID()]) {
      const refused = await shop.put(`/products/${id}/images`, { mediaIds: [mediaId] });
      expect(refused.status).toBe(400);
      expect(fieldsOf(refused)).toEqual({ mediaIds: 'not_found' });
      expect(errorOf(refused).message).toBe(said('MediaNotAttachable'));
    }
    const mine = await upload(shop, await photo());
    const twice = await shop.put(`/products/${id}/images`, { mediaIds: [mine.id, mine.id] });
    expect(twice.status).toBe(400);
    // PRD-11 (raised to 50 on 2026-10-22): more photos than the old ten are taken, and one more than the limit is not.
    const eleven: string[] = [];
    for (let width = 80; eleven.length < 11; width += 1) {
      eleven.push((await upload(shop, await photo(width, 60))).id);
    }
    const taken = await shop.put(`/products/${id}/images`, { mediaIds: eleven });
    expect(taken.status, JSON.stringify(taken.body)).toBe(200);
    expect((taken.body as { images: unknown[] }).images).toHaveLength(11);
    const tooMany = await shop.put(`/products/${id}/images`, {
      mediaIds: Array.from({ length: PRODUCT_IMAGES_MAX + 1 }, () => randomUUID()),
    });
    expect(tooMany.status).toBe(400);
    expect(fieldsOf(tooMany)).toEqual({ mediaIds: 'too_many' });
  });

  it('gives a category a banner and an image size chart, a product an image chart, and an option an image swatch', async () => {
    const shop = await openShop(port, texts, 'media');
    const banner = await upload(shop, await photo(), { purpose: 'category_image' });
    const chart = await upload(shop, await photo(), { purpose: 'size_chart_image' });
    const swatch = await upload(shop, await photo(64, 64), { purpose: 'swatch_image' });

    const category = await shop.post('/categories', { name: 'Shoes', imageId: banner.id });
    expect(category.status, JSON.stringify(category.body)).toBe(201);
    const categoryId = (category.body as { id: string }).id;
    expect(category.body).toMatchObject({ image: { id: banner.id, urls: banner.urls } });
    const charted = await shop.put(`/categories/${categoryId}/size-chart`, { imageId: chart.id });
    expect(charted.body).toEqual({ rows: null, image: { id: chart.id, urls: chart.urls } });
    const listed = (await shop.get('/categories')).body as {
      id: string;
      sizeChart: unknown;
      sizeChartImage: { id: string } | null;
    }[];
    expect(listed.find((row) => row.id === categoryId)).toMatchObject({
      sizeChart: null,
      sizeChartImage: { id: chart.id },
    });

    const id = await product(shop);
    const both = await shop.put(`/products/${id}/size-chart`, {
      rows: [['S', 'M']],
      imageId: chart.id,
    });
    expect(both.status).toBe(400);
    expect((await shop.put(`/products/${id}/size-chart`, { imageId: chart.id })).status).toBe(200);
    expect(((await shop.get(`/products/${id}`)).body as { sizeChart: unknown }).sizeChart).toEqual({
      source: 'product',
      categoryId: null,
      rows: null,
      image: { id: chart.id, urls: chart.urls },
    });

    const made = await shop.post('/attributes', { name: 'Print', dataType: 'enum_single' });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const attribute = made.body as { id: string };
    const option = await shop.post(`/attributes/${attribute.id}/options`, {
      value: 'Ruby 05',
      swatchImageId: swatch.id,
    });
    expect(option.status, JSON.stringify(option.body)).toBe(201);
    expect(option.body).toMatchObject({ swatchColor: null, swatchImage: { id: swatch.id } });
    const optionId = (option.body as { id: string }).id;
    const bothSwatches = await shop.patch(`/attributes/${attribute.id}/options/${optionId}`, {
      swatchColor: '#FF0000',
      swatchImageId: swatch.id,
    });
    expect(fieldsOf(bothSwatches)).toEqual({ swatchImageId: 'not_allowed' });
    // Setting a colour clears the image.
    const recoloured = await shop.patch(`/attributes/${attribute.id}/options/${optionId}`, {
      swatchColor: '#FF0000',
    });
    expect(recoloured.body).toMatchObject({ swatchColor: '#FF0000', swatchImage: null });
  });

  it('sets the shop logo from its ready images, and clears it back to the monogram', async () => {
    const shop = await openShop(port, texts, 'media');
    const logo = await upload(shop, await photo(256, 256), { purpose: 'shop_logo' });
    const saved = await shop.put('/shop-settings/logo', { mediaId: logo.id });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body).toMatchObject({ logo: { id: logo.id, urls: logo.urls } });
    expect((await shop.get('/shop-settings')).body).toMatchObject({ logo: { id: logo.id } });
    // TEN-16: the dashboard's navigation shows it, for every member.
    expect((await shop.get('/me')).body).toMatchObject({
      tenant: { logo: { id: logo.id, urls: logo.urls } },
    });
    const refused = await shop.put('/shop-settings/logo', { mediaId: randomUUID() });
    expect(fieldsOf(refused)).toEqual({ mediaId: 'not_found' });
    expect((await shop.put('/shop-settings/logo', { mediaId: null })).body).toMatchObject({
      logo: null,
    });
    expect((await shop.get('/me')).body).toMatchObject({ tenant: { logo: null } });
    const activity = (await shop.get('/activity')).body as { entries: { action: string }[] };
    expect(activity.entries.map((entry) => entry.action)).toContain('shop_logo_saved');
  });
});

describeIfDatabase('deleting media (MED-09, STO-07, LIF-19)', () => {
  it('removes an item from everywhere it shows at once, drops usage, and deletes its files in the job', async () => {
    const shop = await openShop(port, texts, 'media');
    const image = await upload(shop, await photo());
    const id = await product(shop);
    await shop.put(`/products/${id}/images`, { mediaIds: [image.id] });
    const category = (await shop.post('/categories', { name: 'Bags', imageId: image.id })).body as {
      id: string;
    };
    await shop.put(`/products/${id}/size-chart`, { imageId: image.id });
    await shop.put('/shop-settings/logo', { mediaId: image.id });

    const detail = (await shop.get(`/media/${image.id}`)).body as { uses: Record<string, unknown> };
    expect(detail.uses).toEqual({
      products: 1,
      videos: 0,
      categories: 1,
      swatches: 0,
      sizeCharts: 1,
      logo: true,
      pastOrders: 0,
    });

    const deleted = await shop.delete(`/media/${image.id}`);
    expect(deleted.status).toBe(200);
    expect((await shop.get(`/media/${image.id}`)).status).toBe(404);
    const shown = (await shop.get(`/products/${id}`)).body as {
      images: unknown[];
      sizeChart: unknown;
    };
    expect(shown.images).toEqual([]);
    expect(shown.sizeChart).toBeNull();
    const categories = (await shop.get('/categories')).body as { id: string; image: unknown }[];
    expect(categories.find((row) => row.id === category.id)?.image).toBeNull();
    expect((await shop.get('/shop-settings')).body).toMatchObject({ logo: null });
    expect((await usage(shop)).usedBytes).toBe(0);

    expect(await storage.listMedia(`tenants/${shop.tenantId}/`)).toHaveLength(2);
    await runDeletions();
    expect(await storage.listMedia(`tenants/${shop.tenantId}/`)).toEqual([]);
    const activity = (await shop.get('/activity')).body as { entries: { action: string }[] };
    expect(activity.entries.map((entry) => entry.action)).toContain('media_deleted');
  });

  it('wipes every row and every file under the shop prefix at day 60', async () => {
    const shop = await openShop(port, texts, 'media');
    await upload(shop, await photo());
    await upload(shop, await photo(300, 300));
    // A stray file the rows never knew of goes too.
    storage.media.set(`tenants/${shop.tenantId}/stray/file.webp`, Buffer.alloc(10));
    await app.get(MediaEraser).deleteAllForTenant(shop.tenantId);
    const rows = await admin.query('SELECT 1 FROM tenant.media WHERE tenant_id = $1', [
      shop.tenantId,
    ]);
    expect(rows.rowCount).toBe(0);
    await runDeletions();
    expect(await storage.listMedia(`tenants/${shop.tenantId}/`)).toEqual([]);
  });
});

describeIfDatabase('who may see and change media (STF-11, SEC-02)', () => {
  it('lets each permission reach only its own purposes', async () => {
    const shop = await openShop(port, texts, 'media');
    const file = await photo();
    // Room for three staff members.
    await app
      .get(PlanLimitOverridesService)
      .set(shop.tenantId, 'staff', null, 'media permissions test', randomUUID());
    const catalogue = await staffWith(port, texts, admin, shop, ['products:manage']);
    const settings = await staffWith(port, texts, admin, shop, ['settings:manage']);
    const reader = await staffWith(port, texts, admin, shop, ['products:read']);

    expect((await start(shop, file, {}, catalogue)).status).toBe(201);
    const noLogo = await start(shop, file, { purpose: 'shop_logo' }, catalogue);
    expect(noLogo.status).toBe(403);
    expect(errorOf(noLogo).message).toBe(said('PermissionDenied'));
    expect((await start(shop, file, { purpose: 'shop_logo' }, settings)).status).toBe(201);
    expect((await start(shop, file, {}, settings)).status).toBe(403);
    expect((await start(shop, file, {}, reader)).status).toBe(403);
    expect((await getJson(port, '/media', reader)).status).toBe(200);
    expect((await getJson(port, '/media/usage', reader)).status).toBe(200);
  });

  it("keeps a shop's media its own", async () => {
    const shop = await openShop(port, texts, 'media');
    const other = await openShop(port, texts, 'media');
    const theirs = await upload(other, await photo());
    expect((await shop.get(`/media/${theirs.id}`)).status).toBe(404);
    expect((await shop.post(`/media/${theirs.id}/finish`, {})).status).toBe(404);
    expect((await shop.delete(`/media/${theirs.id}`)).status).toBe(404);
    expect(((await shop.get('/media')).body as { total: number }).total).toBe(0);
    expect((await other.get(`/media/${theirs.id}`)).status).toBe(200);
  });
});
