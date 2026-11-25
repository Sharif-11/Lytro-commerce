import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AnnouncementItemKind,
  HeroDesign,
  ProductRowLayout,
  ProductRowSource,
  StorefrontFill,
  StorefrontLinkKind,
  StorefrontSectionKind,
  StorefrontThemeKey,
  STARTING_ANNOUNCEMENT_ITEMS,
  STARTING_HERO_TILES,
  startingDesign,
  type StorefrontDesign,
} from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import type { MessageKey } from '../src/common/i18n/message-key';
import { translate } from '../src/common/i18n/messages';
import { MediaProcessor } from '../src/modules/media/services/media-processor';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { CATALOGUE_CACHE_SETTINGS } from '../src/modules/public-api/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { CardFactsTickWorker } from '../src/modules/shared/queue-workers/services/card-facts-tick-worker';
import { StorefrontDesignEraser } from '../src/modules/storefront-design/services/storefront-design-eraser';
import { StorefrontPreviewLinks } from '../src/modules/storefront-design/services/storefront-preview-links';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson, postJson, sendExact, type HttpResult } from './support/http';
import { MemoryStorage } from './support/memory-storage';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// STOREFRONT-BUILDER-PLAN (the owner, 2026-11-18): the storefront builder's server -- a shop's design as a draft,
// published, put back and previewed through a signed link (SB-12, SB-13); where a shop starts (SB-11); what a design may
// name (SB-15, SB-16); the shop's own icon on every plan (SB-5); and the regular price, the savings, the new orders and
// the badges' facts the storefront's sections fill themselves from (SB-9, SB-10, SB-21). Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_storefront_design_test';
const API_HOST = 'api.localhost';
const SITE = 'https://myshop.com';
// Each test makes products, uploads photos or hands over orders: longer than the default limit on a busy machine.
const SLOW = 60_000;

sharp.concurrency(1);
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

interface Editor {
  design: StorefrontDesign;
  live: StorefrontDesign;
  startingTheme: StorefrontThemeKey;
  hasDraft: boolean;
  isPublished: boolean;
  canGoBack: boolean;
  draftSavedAt: string | null;
  publishedAt: string | null;
  images: Record<string, { id: string }>;
  categories: { id: string; slug: string; shown: boolean }[];
  products: { id: string; slug: string; shown: boolean }[];
  broken: string[];
}

interface PublicShop {
  icon: { id: string } | null;
  design: {
    theme: StorefrontThemeKey;
    palette: number;
    sections: { id: string; kind: StorefrontSectionKind }[];
    images: Record<string, { id: string }>;
    categories: { id: string; slug: string; name: string }[];
    products: { id: string; slug: string; name: string }[];
    preview: boolean;
  };
  sale: { products: number; bestDiscount: number };
  productCount: number;
}

interface Card {
  id: string;
  minPrice: string | null;
  minRegularPrice: string | null;
  bestDiscount: number;
  left: number | null;
  ordered: number;
  bestSeller: boolean;
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
  process.env['OTP_SECRET'] = 'storefront-design-e2e-otp-secret-0123456789abc';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['MEDIA_PUBLIC_BASE_URL'] = 'https://media.example.test';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(MEDIA_STORAGE)
    .useValue(storage)
    // The version is read again on every request here, so an edit shows at once instead of within two seconds.
    .overrideProvider(CATALOGUE_CACHE_SETTINGS)
    .useValue({ maxBytes: 100 * 1024 * 1024, maxEntryBytes: 10 * 1024 * 1024, versionMs: 1 })
    // SB-10: no minute pass keeping the cards' facts, so a card's badges here are worked out from the orders just made
    // (kept ones may trail them by 5 minutes; card-facts.e2e.spec.ts proves those).
    .overrideProvider(CardFactsTickWorker)
    .useValue({ onModuleInit: () => Promise.resolve() })
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

/** A flat-coloured PNG of this size. */
function picture(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 30, g: 90, b: 60 } } })
    .png()
    .toBuffer();
}

/** Uploads an image of the shop's and has it processed, as the worker would. Its id. */
async function upload(shop: ShopClient, width: number, height: number): Promise<string> {
  const file = await picture(width, height);
  const started = await shop.post('/media/uploads', {
    kind: 'image',
    contentType: 'image/png',
    bytes: file.length,
    purpose: 'shop_logo',
  });
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  const { media, upload: link } = started.body as {
    media: { id: string };
    upload: { url: string };
  };
  expect(storage.send(link.url, file, 'image/png')).toBe(200);
  expect((await shop.post(`/media/${media.id}/finish`, {})).status).toBe(201);
  await app.get(MediaProcessor).process(shop.tenantId, media.id);
  return media.id;
}

/** A section as the release before saved it: without the fields this one added. */
function without(section: object, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(section).filter(([key]) => !keys.includes(key)));
}

async function editorOf(shop: ShopClient): Promise<Editor> {
  const read = await shop.get('/storefront/design');
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return read.body as Editor;
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

async function publicShop(key: string, preview?: string): Promise<PublicShop> {
  const read = await callApi(
    preview === undefined ? '/v1/shop' : `/v1/shop?preview=${encodeURIComponent(preview)}`,
    key,
  );
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return read.body as PublicShop;
}

async function cards(key: string, query: string): Promise<Card[]> {
  const read = await callApi(`/v1/catalogue/products?${query}`, key);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return (read.body as { products: Card[] }).products;
}

async function actionsOf(shop: ShopClient): Promise<string[]> {
  return ((await shop.get('/activity')).body as { entries: { action: string }[] }).entries.map(
    (entry) => entry.action,
  );
}

/** The edge purges queued so far, as the tags each names. */
async function purges(): Promise<string[][]> {
  const { rows } = await admin.query<{ tags: string[] }>(
    `SELECT payload->'tags' AS tags FROM control.job_outbox WHERE queue_name = 'edge_purge' ORDER BY id`,
  );
  return rows.map((row) => row.tags);
}

async function product(
  shop: ShopClient,
  name: string,
  body: Record<string, unknown> = {},
): Promise<{ id: string; variantId: string }> {
  const made = await shop.post('/products', {
    name,
    basePrice: 1000,
    variants: [{ optionIds: [], openingStock: 20 }],
    ...body,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const created = made.body as { id: string; variants: { id: string }[] };
  return { id: created.id, variantId: created.variants[0]?.id ?? '' };
}

/** A takeaway order handed over: delivered, so the sales figures count it (Slice 4.7). */
async function sold(shop: ShopClient, variantId: string, quantity: number): Promise<void> {
  const placed = await postJson(
    port,
    '/orders',
    {
      customerName: 'Rahima Akter',
      phone: `017${String(10_000_000 + Math.floor(Math.random() * 89_999_999))}`,
      fulfilmentType: 'takeaway',
      items: [{ variantId, quantity }],
    },
    shop.headers({ 'idempotency-key': randomUUID() }),
  );
  expect(placed.status, JSON.stringify(placed.body)).toBe(201);
  const handed = await shop.post(`/orders/${(placed.body as { id: string }).id}/hand-over`, {});
  expect(handed.status, JSON.stringify(handed.body)).toBe(200);
}

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A page of the seller's own: a hero slide, a row of picked products and a wide banner to a category. */
function ownDesign(photo: string, picked: string[], categoryId: string): StorefrontDesign {
  return {
    theme: StorefrontThemeKey.Royal,
    palette: 1,
    sections: [
      {
        id: id(1),
        visible: true,
        kind: StorefrontSectionKind.Announcement,
        items: [
          ...STARTING_ANNOUNCEMENT_ITEMS,
          { kind: AnnouncementItemKind.Own, text: 'ঈদে ২০% ছাড়' },
        ],
      },
      {
        id: id(2),
        visible: true,
        kind: StorefrontSectionKind.Hero,
        fill: StorefrontFill.Own,
        source: ProductRowSource.OnSale,
        design: HeroDesign.Overlay,
        tiles: [...STARTING_HERO_TILES],
        slides: [
          {
            photo: { mediaId: photo, focusX: 50, focusY: 40 },
            kicker: null,
            headline: 'নতুন কালেকশন',
            description: null,
            button: 'দেখুন',
            link: { kind: StorefrontLinkKind.OnSale },
          },
        ],
      },
      {
        id: id(3),
        visible: true,
        kind: StorefrontSectionKind.Products,
        source: ProductRowSource.Picked,
        categoryId: null,
        productIds: picked,
        title: 'আমাদের পছন্দ',
        layout: ProductRowLayout.Carousel,
        count: 6,
      },
      {
        id: id(4),
        visible: true,
        kind: StorefrontSectionKind.WideBanner,
        banner: {
          photo: { mediaId: photo, focusX: 50, focusY: 50 },
          kicker: null,
          headline: 'শীতের অফার',
          description: null,
          button: 'কিনুন',
          link: { kind: StorefrontLinkKind.Category, categoryId },
        },
      },
      { id: id(5), visible: false, kind: StorefrontSectionKind.Trust },
    ],
  };
}

async function category(shop: ShopClient, name: string): Promise<{ id: string; slug: string }> {
  const made = await shop.post('/categories', { name });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as { id: string; slug: string };
}

describeIfDatabase("a shop's storefront design (SB-11 to SB-16)", () => {
  it(
    "starts on its shop type's theme with every section on auto, and shoppers see that (SB-11)",
    async () => {
      const shop = await openShop(port, texts, 'sf-start');
      await admin.query(`UPDATE control.tenants SET business_type = 'cosmetics' WHERE id = $1`, [
        shop.tenantId,
      ]);
      const editor = await editorOf(shop);
      expect(editor).toMatchObject({
        startingTheme: StorefrontThemeKey.Soft,
        hasDraft: false,
        isPublished: false,
        canGoBack: false,
        draftSavedAt: null,
        publishedAt: null,
        broken: [],
      });
      expect(editor.design).toEqual(startingDesign(StorefrontThemeKey.Soft));
      expect(editor.live).toEqual(startingDesign(StorefrontThemeKey.Soft));

      const key = await keyFor(shop);
      const shown = await publicShop(key);
      expect(shown.design).toMatchObject({
        theme: StorefrontThemeKey.Soft,
        palette: 0,
        preview: false,
        images: {},
      });
      expect(shown.design.sections.map((section) => section.id)).toEqual(
        startingDesign(StorefrontThemeKey.Soft).sections.map((section) => section.id),
      );
      expect(shown.icon).toBeNull();
      expect(shown.sale).toEqual({ products: 0, bestDiscount: 0 });
      expect(shown.productCount).toBe(0);
    },
    SLOW,
  );

  it(
    'starts with a row for each of its first three categories that can fill one, sold out too, until it publishes its own page (SB-30, SB-32)',
    async () => {
      const shop = await openShop(port, texts, 'sf-cat-rows');
      const made = async (name: string, body: Record<string, unknown>) => {
        const created = await shop.post('/categories', { name, ...body });
        expect(created.status, JSON.stringify(created.body)).toBe(201);
        return created.body as { id: string; slug: string };
      };
      // SB-32 (2026-11-26): a category's row needs a grid's four products to show, so a category counts with four.
      const products = async (name: string, categoryId: string, count: number) => {
        for (let at = 1; at <= count; at += 1) {
          await product(shop, `${name} ${String(at)}`, { categoryIds: [categoryId] });
        }
      };
      // In the shop's order: one with nothing in it, one hidden and one with three (all left out); one whose products
      // include a sold-out one, which counts since 2026-11-25 (the owner: "the storefront must be populated even if
      // there is no stock"); then two with four, the second through its sub-category; and one more, left out past the
      // first three.
      await made('Empty', { sortOrder: 1 });
      const hidden = await made('Hidden', { sortOrder: 2, visible: false });
      const small = await made('Small', { sortOrder: 3 });
      const soldOut = await made('Sold out', { sortOrder: 4 });
      const kurti = await made('Kurti', { sortOrder: 5 });
      const women = await made('Women', { sortOrder: 6 });
      const saree = await made('Saree', { sortOrder: 1, parentId: women.id });
      const shoes = await made('Shoes', { sortOrder: 7 });
      await products('Hidden kurti', hidden.id, 4);
      await products('Small', small.id, 3);
      const gone = await product(shop, 'Gone', {
        categoryIds: [soldOut.id],
        variants: [{ optionIds: [], openingStock: 0 }],
      });
      expect((await shop.get(`/products/${gone.id}`)).body).toMatchObject({ stockState: 'out' });
      await products('Kept', soldOut.id, 3);
      await products('Kurti', kurti.id, 4);
      await products('Saree', saree.id, 4);
      await products('Sneaker', shoes.id, 4);

      const editor = await editorOf(shop);
      const start = startingDesign(editor.startingTheme, [soldOut.id, kurti.id, women.id]);
      expect(editor.design).toEqual(start);
      expect(editor.live).toEqual(start);
      expect(editor.broken).toEqual([]);

      const key = await keyFor(shop);
      const shown = await publicShop(key);
      expect(shown.design.sections.map((section) => section.id)).toEqual(
        start.sections.map((section) => section.id),
      );
      expect(shown.design.categories.map((category) => category.id).sort()).toEqual(
        [soldOut.id, kurti.id, women.id].sort(),
      );
      // SB-32: "সব প্রোডাক্ট · Nটি" counts every active product, a hidden category's and a sold-out one included.
      expect(shown.productCount).toBe(4 + 3 + 4 + 4 + 4 + 4);

      // A page the shop published is its own: categories never add rows to it.
      const own = startingDesign(editor.startingTheme);
      expect((await shop.put('/storefront/design', { design: own })).status).toBe(200);
      expect((await shop.post('/storefront/design/publish', {})).status).toBe(200);
      expect((await publicShop(key)).design.sections.map((section) => section.id)).toEqual(
        own.sections.map((section) => section.id),
      );
    },
    SLOW,
  );

  it(
    'saves a draft shoppers never see, publishes it within a minute, and goes back and forth (SB-12, SB-13)',
    async () => {
      const shop = await openShop(port, texts, 'sf-publish');
      const key = await keyFor(shop);
      const photo = await upload(shop, 1400, 700);
      const shawl = await product(shop, 'Shawl');
      const scarf = await product(shop, 'Scarf');
      const winter = await category(shop, 'Winter');
      const first = ownDesign(photo, [scarf.id, shawl.id], winter.id);

      const saved = await shop.put('/storefront/design', { design: first });
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
      expect(saved.body).toMatchObject({ hasDraft: true, isPublished: false, design: first });
      // What shoppers see is still the starting design, so Publish can say what changes.
      expect((saved.body as Editor).live.theme).not.toBe(StorefrontThemeKey.Royal);
      expect((saved.body as Editor).draftSavedAt).not.toBeNull();
      // Not live: shoppers still see the starting design.
      expect((await publicShop(key)).design.theme).not.toBe(StorefrontThemeKey.Royal);

      const before = (await purges()).length;
      const published = await shop.post('/storefront/design/publish', {});
      expect(published.status, JSON.stringify(published.body)).toBe(200);
      expect(published.body).toMatchObject({
        hasDraft: false,
        isPublished: true,
        canGoBack: false,
      });
      // D9-32: every page of the shop leaves the edge.
      expect((await purges()).slice(before)).toContainEqual([`s:${shop.slug}`]);
      expect(await actionsOf(shop)).toContain('storefront_published');

      const live = await publicShop(key);
      expect(live.design).toMatchObject({
        theme: StorefrontThemeKey.Royal,
        palette: 1,
        preview: false,
      });
      // The hidden trust strip is left out; the rest keep their order.
      expect(live.design.sections.map((section) => section.id)).toEqual([
        id(1),
        id(2),
        id(3),
        id(4),
      ]);
      expect(Object.keys(live.design.images)).toEqual([photo]);
      expect(live.design.categories).toEqual([
        { id: winter.id, slug: winter.slug, name: 'Winter' },
      ]);
      expect(live.design.products.map((row) => row.id).sort()).toEqual([shawl.id, scarf.id].sort());

      // Nothing new to publish.
      const again = await shop.post('/storefront/design/publish', {});
      expect(again.status).toBe(409);
      expect(errorOf(again).message).toBe(said('StorefrontNothingToPublish'));

      // A second design, published; then back to the first, and back again.
      const second: StorefrontDesign = { ...first, theme: StorefrontThemeKey.Fresh, palette: 2 };
      expect((await shop.put('/storefront/design', { design: second })).status).toBe(200);
      expect((await shop.post('/storefront/design/publish', {})).status).toBe(200);
      expect((await publicShop(key)).design.theme).toBe(StorefrontThemeKey.Fresh);
      expect((await editorOf(shop)).canGoBack).toBe(true);

      const back = await shop.post('/storefront/design/back', {});
      expect(back.status, JSON.stringify(back.body)).toBe(200);
      expect((await publicShop(key)).design.theme).toBe(StorefrontThemeKey.Royal);
      expect(await actionsOf(shop)).toContain('storefront_went_back');
      expect((await shop.post('/storefront/design/back', {})).status).toBe(200);
      expect((await publicShop(key)).design.theme).toBe(StorefrontThemeKey.Fresh);

      // A draft dropped leaves the live design in the editor.
      expect(
        (await shop.put('/storefront/design', { design: { ...second, palette: 0 } })).status,
      ).toBe(200);
      const dropped = await shop.delete('/storefront/design/draft');
      expect(dropped.status, JSON.stringify(dropped.body)).toBe(200);
      expect(dropped.body).toMatchObject({ hasDraft: false, design: { palette: 2 } });
    },
    SLOW,
  );

  it(
    'shows the draft only through a live, signed link for this shop, never cached (SB-12)',
    async () => {
      const shop = await openShop(port, texts, 'sf-preview');
      const other = await openShop(port, texts, 'sf-preview');
      const key = await keyFor(shop);
      const photo = await upload(shop, 1400, 700);
      const kept = await product(shop, 'Kept');
      const winter = await category(shop, 'Winter');
      const draft = ownDesign(photo, [kept.id], winter.id);
      expect((await shop.put('/storefront/design', { design: draft })).status).toBe(200);

      const made = await shop.post('/storefront/design/preview', {});
      expect(made.status, JSON.stringify(made.body)).toBe(200);
      const { token, expiresAt } = made.body as { token: string; expiresAt: string };
      expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan(25 * 60_000);

      const read = await callApi(`/v1/shop?preview=${encodeURIComponent(token)}`, key);
      expect(read.status, JSON.stringify(read.body)).toBe(200);
      expect(read.headers['cache-control']).toBe('no-store');
      expect((read.body as PublicShop).design).toMatchObject({
        theme: StorefrontThemeKey.Royal,
        preview: true,
      });
      // Without the link, the live (here the starting) design.
      expect((await publicShop(key)).design.preview).toBe(false);
      expect((await publicShop(key)).design.theme).not.toBe(StorefrontThemeKey.Royal);

      // Another shop's link, a link changed by hand and an ended one open nothing.
      const links = app.get(StorefrontPreviewLinks);
      const theirs = links.make(other.tenantId).token;
      const changed = `${token.slice(0, -2)}${token.endsWith('AA') ? 'BB' : 'AA'}`;
      const ended = links.make(shop.tenantId, new Date(Date.now() - 31 * 60_000)).token;
      for (const refused of [theirs, changed, ended]) {
        const answer = await callApi(`/v1/shop?preview=${encodeURIComponent(refused)}`, key);
        expect(answer.status).toBe(404);
        expect(errorOf(answer).message).toBe(said('StorefrontPreviewEnded'));
      }
    },
    SLOW,
  );

  it(
    "holds each photo to the shop's own, a slide's to 1200 px wide, and each target to one it has (SB-15, SB-16)",
    async () => {
      const shop = await openShop(port, texts, 'sf-refuse');
      const other = await openShop(port, texts, 'sf-refuse');
      const narrow = await upload(shop, 800, 600);
      const theirs = await upload(other, 1400, 700);
      const wide = await upload(shop, 1400, 700);
      const kept = await product(shop, 'Kept');
      const winter = await category(shop, 'Winter');

      const narrowSlide = ownDesign(narrow, [kept.id], winter.id);
      const refused = await shop.put('/storefront/design', { design: narrowSlide });
      expect(fieldsOf(refused)).toEqual({
        'design.sections.1.slides.0.photo.mediaId': 'out_of_range',
        'design.sections.3.banner.photo.mediaId': 'out_of_range',
      });
      const worded = errorOf(refused).details['fields'] as { message: string }[];
      expect(worded.map((field) => field.message)).toEqual([
        said('StorefrontPhotoTooNarrow', { min: 1200 }),
        said('StorefrontPhotoTooNarrow', { min: 1200 }),
      ]);

      const foreign = await shop.put('/storefront/design', {
        design: ownDesign(theirs, [randomUUID()], randomUUID()),
      });
      expect(fieldsOf(foreign)).toEqual({
        'design.sections.1.slides.0.photo.mediaId': 'not_found',
        'design.sections.2.productIds.0': 'not_found',
        'design.sections.3.banner.photo.mediaId': 'not_found',
        'design.sections.3.banner.link.categoryId': 'not_found',
      });

      // The schema's own rules: an own hero with no slide, a fourth slide.
      const empty = ownDesign(wide, [kept.id], winter.id);
      const hero = empty.sections[1];
      if (hero?.kind !== StorefrontSectionKind.Hero) throw new Error('the hero is second');
      expect(
        fieldsOf(
          await shop.put('/storefront/design', {
            design: { ...empty, sections: [{ ...hero, slides: [] }] },
          }),
        ),
      ).toEqual({ 'design.sections.0.slides': 'not_allowed' });
      expect((await editorOf(shop)).hasDraft).toBe(false);
    },
    SLOW,
  );

  it(
    "names the design among a photo's uses; one deleted leaves the page and its section is marked (SB-14, SB-16)",
    async () => {
      const shop = await openShop(port, texts, 'sf-gone');
      const key = await keyFor(shop);
      const photo = await upload(shop, 1400, 700);
      const kept = await product(shop, 'Kept');
      const going = await product(shop, 'Going');
      const winter = await category(shop, 'Winter');
      expect(
        (
          await shop.put('/storefront/design', {
            design: ownDesign(photo, [kept.id, going.id], winter.id),
          })
        ).status,
      ).toBe(200);
      expect((await shop.post('/storefront/design/publish', {})).status).toBe(200);
      const usesOf = async (mediaId: string) =>
        ((await shop.get(`/media/${mediaId}`)).body as { uses: Record<string, unknown> }).uses;
      expect(await usesOf(photo)).toMatchObject({ storefront: true, icon: false });

      const before = (await purges()).length;
      expect((await shop.delete(`/media/${photo}`)).status).toBe(200);
      expect((await purges()).slice(before)).toContainEqual([`s:${shop.slug}`]);
      expect((await shop.delete(`/products/${going.id}`)).status).toBe(200);

      const live = await publicShop(key);
      expect(live.design.images).toEqual({});
      expect(live.design.products.map((row) => row.id)).toEqual([kept.id]);
      expect((await editorOf(shop)).broken.sort()).toEqual([id(2), id(3), id(4)].sort());
    },
    SLOW,
  );

  it(
    'is edited by settings managers only, and goes with the rest of the shop at day 60 (SB-13, LIF-19)',
    async () => {
      const shop = await openShop(port, texts, 'sf-erase');
      const photo = await upload(shop, 1400, 700);
      const kept = await product(shop, 'Kept');
      const winter = await category(shop, 'Winter');
      expect(
        (await shop.put('/storefront/design', { design: ownDesign(photo, [kept.id], winter.id) }))
          .status,
      ).toBe(200);
      expect((await getJson(port, '/storefront/design', { host: 'localhost' })).status).toBe(401);
      await app.get(StorefrontDesignEraser).deleteAllForTenant(shop.tenantId);
      await app.get(StorefrontDesignEraser).deleteAllForTenant(shop.tenantId);
      expect(await editorOf(shop)).toMatchObject({ hasDraft: false, isPublished: false });
    },
    SLOW,
  );
  it(
    'reads a draft and a live design saved before the banner layouts as they looked (BL-18)',
    async () => {
      const shop = await openShop(port, texts, 'sf-upgrade');
      const start = startingDesign(StorefrontThemeKey.Studio);
      expect((await shop.put('/storefront/design', { design: start })).status).toBe(200);
      expect((await shop.post('/storefront/design/publish', {})).status).toBe(200);
      // Saved by the release before: the bar's one line, a hero and banners without their new fields.
      const old = {
        ...start,
        sections: start.sections.map((section) => {
          switch (section.kind) {
            case StorefrontSectionKind.Announcement:
              return {
                id: section.id,
                visible: true,
                kind: section.kind,
                text: 'ঈদে সব শাড়িতে ছাড়',
              };
            case StorefrontSectionKind.Hero:
              return without(section, ['source', 'tiles']);
            case StorefrontSectionKind.OfferBanners:
              return without(section, ['layout', 'collections']);
            default:
              return section;
          }
        }),
      };
      await admin.query(
        `UPDATE tenant.storefront_designs SET draft = $2, published = $2 WHERE tenant_id = $1`,
        [shop.tenantId, JSON.stringify(old)],
      );
      const editor = await editorOf(shop);
      const bar = editor.design.sections.find(
        (section) => section.kind === StorefrontSectionKind.Announcement,
      );
      expect(bar).toMatchObject({
        items: [
          { kind: AnnouncementItemKind.CashOnDelivery, visible: false },
          { kind: AnnouncementItemKind.Delivery, visible: false },
          { kind: AnnouncementItemKind.Offers, visible: false },
          { kind: AnnouncementItemKind.Own, text: 'ঈদে সব শাড়িতে ছাড়' },
        ],
      });
      expect(
        editor.design.sections.find((section) => section.kind === StorefrontSectionKind.Hero),
      ).toMatchObject({
        source: ProductRowSource.OnSale,
        tiles: STARTING_HERO_TILES,
      });
      // Shoppers see it too: the live copy is not swapped for the starting design.
      const shown = await publicShop(await keyFor(shop));
      expect(
        shown.design.sections.find(
          (section) => section.kind === StorefrontSectionKind.Announcement,
        ),
      ).toMatchObject({
        items: expect.arrayContaining([
          { kind: AnnouncementItemKind.Own, text: 'ঈদে সব শাড়িতে ছাড়' },
        ]) as unknown,
      });
    },
    SLOW,
  );
});

describeIfDatabase("the shop's own icon, on every plan (SB-5)", () => {
  it(
    'is set on the trial, square and 512 px or more, and every surface shows it',
    async () => {
      const shop = await openShop(port, texts, 'sf-icon');
      const key = await keyFor(shop);
      const small = await upload(shop, 300, 300);
      const oblong = await upload(shop, 800, 600);
      for (const mediaId of [small, oblong]) {
        const refused = await shop.put('/shop-settings/icon', { mediaId });
        expect(fieldsOf(refused)).toEqual({ mediaId: 'out_of_range' });
        expect(errorOf(refused).message).toBe(said('BrandIconNotSquare', { min: 512 }));
      }
      expect(fieldsOf(await shop.put('/shop-settings/icon', { mediaId: randomUUID() }))).toEqual({
        mediaId: 'not_found',
      });

      const manifest = async () =>
        (await getJson(port, `/shops/${shop.slug}/manifest.webmanifest`, { host: 'localhost' }))
          .body as { icons: { src: string }[] };
      const before = await manifest();
      const icon = await upload(shop, 600, 600);
      const set = await shop.put('/shop-settings/icon', { mediaId: icon });
      expect(set.status, JSON.stringify(set.body)).toBe(200);
      expect(set.body).toMatchObject({ icon: { id: icon } });
      expect(await actionsOf(shop)).toContain('shop_icon_saved');

      expect(
        ((await shop.get('/me')).body as { tenant: { icon: { id: string } } }).tenant.icon.id,
      ).toBe(icon);
      expect((await publicShop(key)).icon?.id).toBe(icon);
      expect((await manifest()).icons[0]?.src).not.toBe(before.icons[0]?.src);
      expect(
        ((await shop.get(`/media/${icon}`)).body as { uses: Record<string, unknown> }).uses,
      ).toMatchObject({ icon: true });

      // The brand editor shows the same icon, and saving it keeps it.
      const brand = (await shop.get('/brand')).body as {
        identity: { icon: { id: string } | null };
      };
      expect(brand.identity.icon?.id).toBe(icon);

      expect((await shop.put('/shop-settings/icon', { mediaId: null })).status).toBe(200);
      expect((await publicShop(key)).icon).toBeNull();
    },
    SLOW,
  );
});

describeIfDatabase('the regular price, the savings and the badges (SB-9, SB-10, SB-21)', () => {
  it(
    'keeps a regular price at or above the price, and the biggest saving and the struck price with the product',
    async () => {
      const shop = await openShop(port, texts, 'sf-price');
      const below = await shop.post('/products', {
        name: 'Below',
        basePrice: 1000,
        regularPrice: 900,
        variants: [{ optionIds: [], openingStock: 5 }],
      });
      expect(fieldsOf(below)).toEqual({ regularPrice: 'too_small' });

      const shawl = await product(shop, 'Shawl', { regularPrice: 1250 });
      const detail = (await shop.get(`/products/${shawl.id}`)).body as Record<string, unknown>;
      expect(detail).toMatchObject({
        basePrice: '1000.00',
        regularPrice: '1250.00',
        minRegularPrice: '1250.00',
        bestDiscount: 20,
      });

      // An edit sending the regular price alone is held to the stored price; raising the price past it ends the sale.
      const low = await shop.patch(`/products/${shawl.id}`, { regularPrice: 999 });
      expect(fieldsOf(low)).toEqual({ regularPrice: 'too_small' });
      expect(errorOf(low).message).toBe(said('RegularPriceBelowPrice', { min: '1000.00' }));
      expect((await shop.patch(`/products/${shawl.id}`, { basePrice: 1300 })).status).toBe(200);
      expect((await shop.get(`/products/${shawl.id}`)).body).toMatchObject({
        minRegularPrice: null,
        bestDiscount: 0,
      });
      expect((await shop.patch(`/products/${shawl.id}`, { basePrice: 999 })).status).toBe(200);
      // floor(251 / 1250 * 100) = 20: a saving is never rounded up.
      expect((await shop.get(`/products/${shawl.id}`)).body).toMatchObject({ bestDiscount: 20 });

      // A variant's own regular price is held to its own price, and its saving counts.
      const sizes = await shop.post('/products', {
        name: 'Sizes',
        basePrice: 500,
        regularPrice: 500,
        variants: [{ optionIds: [], openingStock: 5, price: 400, regularPrice: 380 }],
      });
      expect(fieldsOf(sizes)).toEqual({ 'variants.0.regularPrice': 'too_small' });
    },
    SLOW,
  );

  it(
    'lists by biggest saving and by best selling, filters what is on sale or picked, and gives each card its badges',
    async () => {
      const shop = await openShop(port, texts, 'sf-lists');
      const key = await keyFor(shop);
      const half = await product(shop, 'Half', { regularPrice: 2000 });
      const fifth = await product(shop, 'Fifth', { regularPrice: 1250 });
      const plain = await product(shop, 'Plain');
      const low = await product(shop, 'Low', {
        lowStockThreshold: 5,
        variants: [{ optionIds: [], openingStock: 3 }],
      });
      await sold(shop, plain.variantId, 4);
      await sold(shop, plain.variantId, 1);
      await sold(shop, fifth.variantId, 2);

      const sale = (await publicShop(key)).sale;
      expect(sale).toEqual({ products: 2, bestDiscount: 50 });

      const bySaving = await cards(key, 'sort=discount&onSale=true');
      expect(bySaving.map((card) => card.id)).toEqual([half.id, fifth.id]);
      expect(bySaving[0]).toMatchObject({ minRegularPrice: '2000.00', bestDiscount: 50 });

      const bySales = await cards(key, 'sort=best_selling');
      expect(bySales.slice(0, 2).map((card) => card.id)).toEqual([plain.id, fifth.id]);
      const plainCard = bySales.find((card) => card.id === plain.id);
      expect(plainCard).toMatchObject({ ordered: 2, bestSeller: true, left: null });
      expect(bySales.find((card) => card.id === half.id)).toMatchObject({
        ordered: 0,
        bestSeller: false,
      });
      expect(bySales.find((card) => card.id === low.id)).toMatchObject({ left: 3 });

      // A picked row: exactly those, in the seller's order, one page.
      const picked = await callApi(`/v1/catalogue/products?productIds=${low.id},${half.id}`, key);
      expect(picked.status, JSON.stringify(picked.body)).toBe(200);
      expect(picked.body).toMatchObject({ nextCursor: null });
      expect((picked.body as { products: Card[] }).products.map((card) => card.id)).toEqual([
        low.id,
        half.id,
      ]);
      // The next page of the saving order starts where the first ended.
      const first = await callApi('/v1/catalogue/products?sort=discount&limit=1', key);
      const cursor = (first.body as { nextCursor: string }).nextCursor;
      const next = await cards(key, `sort=discount&limit=1&cursor=${cursor}`);
      expect(next.map((card) => card.id)).toEqual([fifth.id]);

      // The product page strikes each variant's regular price through while it is on sale.
      const slug = ((await shop.get(`/products/${half.id}`)).body as { slug: string }).slug;
      const page = await callApi(`/v1/catalogue/products/${slug}`, key);
      expect(page.body).toMatchObject({
        minRegularPrice: '2000.00',
        bestDiscount: 50,
        variants: [{ price: '1000.00', regularPrice: '2000.00' }],
      });
    },
    SLOW,
  );

  it(
    'covers a category without a picture with its first product photo (SB-9)',
    async () => {
      const shop = await openShop(port, texts, 'sf-covers');
      const key = await keyFor(shop);
      const winter = await category(shop, 'Winter');
      const shawl = await product(shop, 'Shawl', { categoryIds: [winter.id] });
      const photo = await upload(shop, 600, 600);
      expect((await shop.put(`/products/${shawl.id}/images`, { mediaIds: [photo] })).status).toBe(
        200,
      );
      const read = await callApi('/v1/catalogue/categories', key);
      expect(read.status, JSON.stringify(read.body)).toBe(200);
      const categories = (
        read.body as {
          categories: { id: string; image: unknown; cover: { id: string } | null }[];
        }
      ).categories;
      expect(categories.map((row) => [row.id, row.image, row.cover?.id])).toEqual([
        [winter.id, null, photo],
      ]);
    },
    SLOW,
  );
});
