import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { PlanLimitOverridesService } from '../src/modules/billing/services/plan-limit-overrides.service';
import { PublicApiEraser } from '../src/modules/public-api/services/public-api-eraser';
import { CATALOGUE_CACHE_SETTINGS } from '../src/modules/public-api/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson, putJson, sendExact } from './support/http';
import { fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 9b: a shop's Meta ad tracking -- the Pixel ID, public, and the Conversions API token, sealed and
// never returned -- and its Meta catalog feed: a secret link, kept hashed and sealed, serving one CSV row per variant
// on sale. LND-15 to LND-17, FED-01 to FED-05, SEC-01, SEC-10, LIF-19. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_ad_tracking_feed_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const SITE = 'https://myshop.com';
const API_HOST = 'api.localhost';
const TOKEN = 'EAAGsecretConversionsToken0123456789';
const COLUMNS = [
  'id',
  'item_group_id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'link',
  'image_link',
  'additional_image_link',
  'brand',
  'color',
  'size',
];

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'ad-tracking-feed-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['DATA_ENCRYPTION_KEY'] = Buffer.alloc(32, 9).toString('base64');
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    // The versions are read again on every request here, so an edit reaches the feed at once.
    .overrideProvider(CATALOGUE_CACHE_SETTINGS)
    .useValue({ maxBytes: 100 * 1024 * 1024, maxEntryBytes: 10 * 1024 * 1024, versionMs: 1 })
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

/** RFC 4180, as Meta reads it: quoted fields may hold commas, quotes and line breaks. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? '';
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function feedRows(text: string): Record<string, string>[] {
  const [header, ...lines] = parseCsv(text);
  expect(header).toEqual(COLUMNS);
  return lines.map((cells) =>
    Object.fromEntries(COLUMNS.map((name, at) => [name, cells[at] ?? ''])),
  );
}

interface FeedAnswer {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text: string;
}

/** A fetch as Meta's fetcher makes it: on the API host, no key, no website; the body as sent. */
function fetchFeed(url: string, extra: Record<string, string> = {}): Promise<FeedAnswer> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: new URL(url).pathname,
        method: 'GET',
        headers: { host: API_HOST, ...extra },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/** The error code of a refused fetch, from its JSON body. */
function codeOf(answer: FeedAnswer): string {
  return (JSON.parse(answer.text) as { errors: { code: string } }).errors.code;
}

async function feedLink(shop: ShopClient): Promise<string> {
  const answer = await shop.get('/catalog-feed');
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  return (answer.body as { url: string }).url;
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

async function optionIds(shop: ShopClient, attributeId: string, values: string[]) {
  const made = await shop.post(`/attributes/${attributeId}/options/batch`, { values });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { id: string }[]).map((option) => option.id);
}

async function create(shop: ShopClient, body: Record<string, unknown>) {
  const result = await shop.post('/products', body);
  expect(result.status, JSON.stringify(result.body)).toBe(201);
  return result.body as {
    id: string;
    slug: string;
    variants: { id: string; optionIds: string[] }[];
  };
}

async function activity(
  tenantId: string,
  prefix: string,
): Promise<{ action: string; summary: string }[]> {
  const rows = await admin.query<{ action: string; summary: string }>(
    `SELECT action, coalesce(summary::text, '') AS summary FROM tenant.activity_log
     WHERE tenant_id = $1 AND action LIKE $2 ORDER BY id`,
    [tenantId, `${prefix}%`],
  );
  return rows.rows;
}

describeIfDatabase('ad tracking (LND-15 to LND-17, SEC-10)', () => {
  it('connects a Pixel and a Conversions API token, shows only whether the token is set, and seals it', async () => {
    const shop = await openShop(port, texts, 'ads');
    const saved = await shop.put('/ad-tracking', {
      metaPixelId: '1234567890123',
      conversionsApiToken: TOKEN,
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body).toMatchObject({
      metaPixelId: '1234567890123',
      conversionsApiConnected: true,
    });
    const read = await shop.get('/ad-tracking');
    expect(JSON.stringify(read.envelope)).not.toContain(TOKEN);
    expect(JSON.stringify(saved.envelope)).not.toContain(TOKEN);

    const stored = await admin.query<{ token: Buffer }>(
      'SELECT meta_capi_token_enc AS token FROM tenant.ad_tracking_settings WHERE tenant_id = $1',
      [shop.tenantId],
    );
    const sealed = stored.rows[0]?.token;
    expect(sealed).toBeInstanceOf(Buffer);
    expect(sealed?.toString('latin1')).not.toContain(TOKEN);

    // LND-15: the public API answers with the Pixel, never the token.
    const key = (
      (await shop.post('/api-keys', { name: 'Website', websites: [SITE] })).body as { key: string }
    ).key;
    const shopAnswer = await sendExact(port, 'GET', '/v1/shop', undefined, {
      host: API_HOST,
      authorization: `Bearer ${key}`,
      origin: SITE,
    });
    expect(shopAnswer.body).toMatchObject({ slug: shop.slug, metaPixelId: '1234567890123' });
    expect(JSON.stringify(shopAnswer.envelope)).not.toContain(TOKEN);
  });

  it('logs connecting, changing and removing ad tracking, never the token (LND-17)', async () => {
    const shop = await openShop(port, texts, 'ads-log');
    expect((await shop.put('/ad-tracking', { metaPixelId: '111111' })).status).toBe(200);
    expect((await shop.put('/ad-tracking', { metaPixelId: '111111' })).status).toBe(200);
    await shop.put('/ad-tracking', { metaPixelId: '222222', conversionsApiToken: TOKEN });
    await shop.put('/ad-tracking', { metaPixelId: '222222', conversionsApiToken: null });
    expect((await shop.delete('/ad-tracking')).status).toBe(200);
    expect(await shop.get('/ad-tracking')).toMatchObject({
      body: { metaPixelId: null, conversionsApiConnected: false },
    });

    const entries = await activity(shop.tenantId, 'ad_tracking');
    expect(entries.map((entry) => entry.action)).toEqual([
      'ad_tracking_updated',
      'ad_tracking_updated',
      'ad_tracking_updated',
      'ad_tracking_removed',
    ]);
    expect(entries[1]?.summary).toContain('"conversionsApi": "connected"');
    expect(entries[2]?.summary).toContain('"conversionsApi": "removed"');
    for (const entry of entries) expect(entry.summary).not.toContain(TOKEN);
  });

  it('refuses a Pixel ID that is not digits, and anyone without settings:manage', async () => {
    const shop = await openShop(port, texts, 'ads-perm');
    const refused = await shop.put('/ad-tracking', { metaPixelId: 'pixel-1' });
    expect(refused.status).toBe(400);
    expect(Object.keys(fieldsOf(refused))).toEqual(['metaPixelId']);
    const staff = await staffWith(port, texts, admin, shop, ['products:read']);
    expect((await getJson(port, '/ad-tracking', staff)).status).toBe(403);
    expect((await putJson(port, '/ad-tracking', { metaPixelId: '123456' }, staff)).status).toBe(
      403,
    );
    expect((await getJson(port, '/catalog-feed', staff)).status).toBe(403);
  });
});

describeIfDatabase('the Meta catalog feed (FED-01 to FED-05)', () => {
  it('gives each shop one secret link, found by its hash and kept sealed', async () => {
    const shop = await openShop(port, texts, 'feed-link');
    const url = await feedLink(shop);
    expect(url).toMatch(/^http:\/\/api\.localhost\/v1\/feeds\/meta\/[A-Za-z0-9_-]{43}\.csv$/);
    expect(await feedLink(shop)).toBe(url);
    const token = /meta\/(.+)\.csv$/.exec(url)?.[1] ?? '';
    const row = await admin.query<{ hash: Buffer; sealed: Buffer }>(
      'SELECT token_hash AS hash, token_enc AS sealed FROM control.catalog_feeds WHERE tenant_id = $1',
      [shop.tenantId],
    );
    expect(row.rows[0]?.hash.equals(createHash('sha256').update(token).digest())).toBe(true);
    expect(row.rows[0]?.sealed.toString('latin1')).not.toContain(token);
  });

  it("serves one row per variant on sale, grouped by product, in Meta's columns", async () => {
    const shop = await openShop(port, texts, 'feed-rows');
    const size = await platformId(shop, 'Size');
    const [small, medium, large] = await optionIds(shop, size, ['S', 'M', 'L']);
    const brand = await platformId(shop, 'Brand');
    const [aarong] = await optionIds(shop, brand, ['Aarong']);
    const shirt = await create(shop, {
      name: 'Panjabi',
      basePrice: 1500,
      description: 'Soft cotton, "hand-stitched".\nশীতের জন্য 🌙',
      condition: 'used',
      lowStockThreshold: 1,
      variantAttributes: [{ attributeId: size, optionIds: [small, medium, large] }],
      attributes: [{ attributeId: brand, role: 'informational', optionIds: [aarong] }],
      variants: [
        { optionIds: [small], openingStock: 5 },
        { optionIds: [medium], openingStock: 0, price: 1600 },
        { optionIds: [large], openingStock: 3, active: false },
      ],
    });
    const plain = await create(shop, {
      name: 'Mug',
      basePrice: 250,
      variants: [{ optionIds: [] }],
    });
    const hidden = await create(shop, {
      name: 'Hidden',
      basePrice: 10,
      active: false,
      variants: [{ optionIds: [] }],
    });

    const answer = await fetchFeed(await feedLink(shop));
    expect(answer.status).toBe(200);
    expect(answer.headers['content-type']).toBe('text/csv; charset=utf-8');
    const rows = feedRows(answer.text);
    expect(rows.map((row) => row['item_group_id'])).toEqual([plain.id, shirt.id, shirt.id]);
    expect(rows.some((row) => row['item_group_id'] === hidden.id)).toBe(false);
    const variantOf = (option: string | undefined) =>
      shirt.variants.find((variant) => variant.optionIds[0] === option)?.id ?? '';
    const bySize = new Map(rows.slice(1).map((row) => [row['size'] ?? '', row]));
    expect(bySize.get('S')).toMatchObject({
      id: variantOf(small),
      title: 'Panjabi',
      description: 'Soft cotton, "hand-stitched".\nশীতের জন্য 🌙',
      availability: 'in stock',
      condition: 'used',
      price: '1500.00 BDT',
      link: `http://${shop.slug}.localhost/l/${shirt.slug}?v=${variantOf(small)}`,
      brand: 'Aarong',
    });
    expect(bySize.get('M')).toMatchObject({ price: '1600.00 BDT', availability: 'out of stock' });
    expect(bySize.get('L')).toBeUndefined();
    // Meta requires a description: a product with none gives its name.
    expect(rows[0]).toMatchObject({
      title: 'Mug',
      description: 'Mug',
      condition: 'new',
      brand: '',
    });
  });

  it('shows an edit on the next fetch, and a matching tag gets 304 (FED-04)', async () => {
    const shop = await openShop(port, texts, 'feed-fresh');
    const lamp = await create(shop, {
      name: 'Lamp',
      basePrice: 900,
      variants: [{ optionIds: [] }],
    });
    const url = await feedLink(shop);
    const first = await fetchFeed(url);
    expect(feedRows(first.text)[0]).toMatchObject({ price: '900.00 BDT' });
    const again = await fetchFeed(url, { 'if-none-match': String(first.headers['etag']) });
    expect(again.status).toBe(304);

    expect((await shop.patch(`/products/${lamp.id}`, { basePrice: 950 })).status).toBe(200);
    expect(feedRows((await fetchFeed(url)).text)[0]).toMatchObject({ price: '950.00 BDT' });
    expect((await shop.delete(`/products/${lamp.id}`)).status).toBe(200);
    expect(feedRows((await fetchFeed(url)).text)).toEqual([]);
  });

  it('is not found by a wrong token, after a new link, or while the shop is offline; a new link is logged', async () => {
    const shop = await openShop(port, texts, 'feed-gone');
    await create(shop, { name: 'Kettle', basePrice: 1800, variants: [{ optionIds: [] }] });
    const old = await feedLink(shop);
    expect((await fetchFeed(old)).status).toBe(200);
    const wrong = await fetchFeed(old.replace(/meta\/.{4}/, 'meta/AAAA'));
    expect(wrong.status).toBe(404);
    expect(codeOf(wrong)).toBe('not_found');
    expect((await fetchFeed(old.replace('.csv', ''))).status).toBe(404);

    const replaced = await shop.post('/catalog-feed/regenerate', {});
    expect(replaced.status, JSON.stringify(replaced.body)).toBe(200);
    const next = (replaced.body as { url: string }).url;
    expect(next).not.toBe(old);
    expect((await fetchFeed(old)).status).toBe(404);
    expect((await fetchFeed(next)).status).toBe(200);
    expect((await activity(shop.tenantId, 'catalog_feed')).map((entry) => entry.action)).toEqual([
      'catalog_feed_regenerated',
    ]);

    await admin.query('UPDATE control.tenants SET suspended_at = now() WHERE id = $1', [
      shop.tenantId,
    ]);
    // The shop's lookup is kept up to 5 seconds; a new shop row is read at once by the next check.
    await new Promise((resolve) => setTimeout(resolve, 5_100));
    expect((await fetchFeed(next)).status).toBe(404);
  });

  it("counts every fetch toward the shop's monthly requests (FED-04, RTE-03)", async () => {
    const shop = await openShop(port, texts, 'feed-count');
    await create(shop, { name: 'Tray', basePrice: 400, variants: [{ optionIds: [] }] });
    await app
      .get(PlanLimitOverridesService)
      .set(shop.tenantId, 'requests_monthly', 2, 'feed count test', randomUUID());
    const url = await feedLink(shop);
    expect((await fetchFeed(url)).status).toBe(200);
    expect((await fetchFeed(url)).status).toBe(200);
    const third = await fetchFeed(url);
    expect(third.status).toBe(429);
    expect(codeOf(third)).toBe('quota_exceeded');
  });

  it("deletes a lapsed shop's ad tracking and feed link at day 60 (LIF-19)", async () => {
    const shop = await openShop(port, texts, 'feed-erase');
    await shop.put('/ad-tracking', { metaPixelId: '999999', conversionsApiToken: TOKEN });
    const url = await feedLink(shop);
    await app.get(PublicApiEraser).deleteAllForTenant(shop.tenantId);
    const left = await admin.query(
      `SELECT 1 FROM control.catalog_feeds WHERE tenant_id = $1
       UNION ALL SELECT 1 FROM tenant.ad_tracking_settings WHERE tenant_id = $1`,
      [shop.tenantId],
    );
    expect(left.rowCount).toBe(0);
    expect((await fetchFeed(url)).status).toBe(404);
  });
});

describeIfDatabase("a product's condition (FED-02)", () => {
  it('is new unless set, and the dashboard and the public page show it', async () => {
    const shop = await openShop(port, texts, 'condition');
    const made = await create(shop, {
      name: 'Phone',
      basePrice: 9000,
      variants: [{ optionIds: [] }],
    });
    expect((await shop.get(`/products/${made.id}`)).body).toMatchObject({ condition: 'new' });
    const changed = await shop.patch(`/products/${made.id}`, { condition: 'refurbished' });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body).toMatchObject({ condition: 'refurbished' });
    const refused = await shop.patch(`/products/${made.id}`, { condition: 'broken' });
    expect(Object.keys(fieldsOf(refused))).toEqual(['condition']);

    const key = (
      (await shop.post('/api-keys', { name: 'Website', websites: [SITE] })).body as { key: string }
    ).key;
    const shown = await sendExact(port, 'GET', `/v1/catalogue/products/${made.slug}`, undefined, {
      host: API_HOST,
      authorization: `Bearer ${key}`,
      origin: SITE,
    });
    expect(shown.body).toMatchObject({ condition: 'refurbished' });
  });
});
