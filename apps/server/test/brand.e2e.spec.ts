import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LYTRO_APP_COLORS } from '@lytronix/shared-types';
import { BRAND_TEXT_COLORS, DEFAULT_BRAND } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import type { MessageKey } from '../src/common/i18n/message-key';
import { translate } from '../src/common/i18n/messages';
import { PlanLimitOverridesService } from '../src/modules/billing/services/plan-limit-overrides.service';
import { BrandEraser } from '../src/modules/brand/services/brand-eraser';
import { MediaProcessor } from '../src/modules/media/services/media-processor';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getBinary, getJson, sendExact, type HttpResult } from './support/http';
import { MemoryStorage } from './support/memory-storage';
import { errorOf, fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 11.2: the brand identity's backend -- saving it on any plan, switching it on only with the add-on or a
// plan that has it, the contrast check with its nearest passing shades, the square icon, the identity as tokens on
// /me and the public shop read, the installed app taking it, and what a lapse keeps. BRN-01 to BRN-07, TEN-17.
// Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_brand_test';
const API_HOST = 'api.localhost';
const SITE = 'https://myshop.com';

sharp.concurrency(1);
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

interface Editor {
  useBrand: boolean;
  allowed: boolean;
  live: boolean;
  identity: Record<string, unknown> & {
    icon: { id: string } | null;
    darkLogo: { id: string } | null;
  };
  contrast: { passes: boolean; suggestions: Record<string, string> };
  savedAt: string | null;
}

interface LiveBrand {
  version: string;
  colors: Record<string, string>;
  fonts: { heading: { bangla: string; latin: string }; body: { bangla: string; latin: string } };
  icon: { id: string } | null;
}

// A shop's own identity: maroon on cream, Hind Siliguri with Plus Jakarta Sans, round and airy.
const MAROON = {
  mainColor: '#7a1f2b',
  accentColor: '#f2a516',
  backgroundColor: '#fbf7f0',
  headingFont: 'noto_serif_bengali_fraunces',
  bodyFont: 'hind_siliguri_plus_jakarta_sans',
  corners: 'round',
  spacing: 'airy',
  darkLogoId: null,
  iconId: null,
};

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const storage = new MemoryStorage();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'brand-e2e-otp-secret-0123456789abcdefghijklm';
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

/** A flat-coloured PNG of this size. */
function picture(width: number, height: number, r = 122, g = 31, b = 43): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer();
}

/** Uploads an image for the shop's identity and has it processed, as the worker would. Its id. */
async function upload(shop: ShopClient, file: Buffer): Promise<string> {
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

async function editorOf(shop: ShopClient): Promise<Editor> {
  const read = await shop.get('/brand');
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return read.body as Editor;
}

async function meBrandOf(shop: ShopClient): Promise<LiveBrand | null> {
  return ((await shop.get('/me')).body as { tenant: { brand: LiveBrand | null } }).tenant.brand;
}

/** BRN-05: the add-on held now, as a paid purchase would leave it. */
async function holdAddon(shop: ShopClient): Promise<void> {
  await admin.query(
    `INSERT INTO control.addon_purchases (tenant_id, addon_id, kind, price, status, paid_from, starts_at, expires_at)
     SELECT $1, id, 'feature', 149, 'active', 'balance', now() - interval '1 day', now() + interval '30 days'
     FROM control.addons WHERE key = 'brand_identity'`,
    [shop.tenantId],
  );
}

async function lapseAddon(shop: ShopClient): Promise<void> {
  await admin.query(`UPDATE control.addon_purchases SET status = 'lapsed' WHERE tenant_id = $1`, [
    shop.tenantId,
  ]);
}

async function actionsOf(shop: ShopClient): Promise<string[]> {
  return ((await shop.get('/activity')).body as { entries: { action: string }[] }).entries.map(
    (entry) => entry.action,
  );
}

describeIfDatabase("a shop's own brand identity (BRN-01 to BRN-07)", () => {
  it("starts from Lytro's default, and any shop may design and save its own", async () => {
    const shop = await openShop(port, texts, 'brand');
    expect(await editorOf(shop)).toMatchObject({
      useBrand: false,
      allowed: false,
      live: false,
      identity: { ...DEFAULT_BRAND, darkLogo: null, icon: null },
      contrast: { passes: true, suggestions: {} },
      savedAt: null,
    });
    // On the trial: saved, never shown.
    const saved = await shop.put('/brand', { ...MAROON, mainColor: '#7A1F2B' });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body).toMatchObject({
      useBrand: false,
      live: false,
      identity: { mainColor: '#7a1f2b', bodyFont: 'hind_siliguri_plus_jakarta_sans' },
    });
    expect((saved.body as Editor).savedAt).not.toBeNull();
    expect(await meBrandOf(shop)).toBeNull();
    expect(await actionsOf(shop)).toContain('brand_saved');
  });

  it('switches on only with the add-on or a plan that has it, and a lapse keeps the switch (BRN-05)', async () => {
    const shop = await openShop(port, texts, 'brand-switch');
    expect((await shop.put('/brand', MAROON)).status).toBe(200);
    for (const refused of [
      await shop.put('/brand/switch', { useBrand: true }),
      await shop.put('/brand', { ...MAROON, useBrand: true }),
    ]) {
      expect(refused.status).toBe(402);
      expect(errorOf(refused)).toMatchObject({
        code: 'plan_feature_unavailable',
        message: said('BrandNeedsAddon'),
      });
    }
    expect((await editorOf(shop)).useBrand).toBe(false);

    await holdAddon(shop);
    const on = await shop.put('/brand/switch', { useBrand: true });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    expect(on.body).toMatchObject({ useBrand: true, allowed: true, live: true });
    const brand = await meBrandOf(shop);
    expect(brand).toMatchObject({
      colors: {
        main: '#7a1f2b',
        accent: '#f2a516',
        background: '#fbf7f0',
        onMain: BRAND_TEXT_COLORS.white,
        onAccent: BRAND_TEXT_COLORS.ink,
        text: BRAND_TEXT_COLORS.ink,
        mainText: '#7a1f2b',
      },
      fonts: {
        heading: { bangla: 'Noto Serif Bengali', latin: 'Fraunces' },
        body: { bangla: 'Hind Siliguri' },
      },
      corners: 'round',
      spacing: 'airy',
      icon: null,
    });
    expect(await actionsOf(shop)).toContain('brand_switched_on');

    // The add-on lapses: the default shows at once, the identity and the switch are kept, and holding it again brings
    // the identity back without another tap.
    await lapseAddon(shop);
    expect(await editorOf(shop)).toMatchObject({ useBrand: true, allowed: false, live: false });
    expect(await meBrandOf(shop)).toBeNull();
    await holdAddon(shop);
    expect((await meBrandOf(shop))?.version).toBe(brand?.version);

    // A plan that includes it lets it show as well (BRN-05, amended 2026-10-22).
    await lapseAddon(shop);
    await admin.query(
      `UPDATE control.tenants SET feature_snapshot = '{"brand_identity": true}' WHERE id = $1`,
      [shop.tenantId],
    );
    expect((await editorOf(shop)).live).toBe(true);

    const off = await shop.put('/brand/switch', { useBrand: false });
    expect(off.body).toMatchObject({
      useBrand: false,
      live: false,
      identity: { mainColor: '#7a1f2b' },
    });
    expect(await meBrandOf(shop)).toBeNull();
    expect(await actionsOf(shop)).toContain('brand_switched_off');
  });

  it('refuses colours that do not reach AA while it shows, with the nearest shade that does (BRN-03)', async () => {
    const shop = await openShop(port, texts, 'brand-contrast');
    await holdAddon(shop);
    // Off, a pale yellow main colour may be saved and previewed; its check says so.
    const pale = { ...MAROON, mainColor: '#f8e58c' };
    const draft = await shop.put('/brand', pale);
    expect(draft.status).toBe(200);
    const suggestion = (draft.body as Editor).contrast.suggestions['mainColor'] ?? '';
    expect(draft.body).toMatchObject({ contrast: { passes: false } });

    for (const refused of [
      await shop.put('/brand/switch', { useBrand: true }),
      await shop.put('/brand', { ...pale, useBrand: true }),
    ]) {
      expect(refused.status).toBe(400);
      expect(fieldsOf(refused)).toEqual({ mainColor: 'low_contrast' });
      expect(errorOf(refused).details['contrast']).toMatchObject({
        suggestions: { mainColor: suggestion },
      });
      expect(errorOf(refused).message).toContain(suggestion);
    }

    const fixed = await shop.put('/brand', { ...pale, mainColor: suggestion, useBrand: true });
    expect(fixed.status, JSON.stringify(fixed.body)).toBe(200);
    expect(fixed.body).toMatchObject({ live: true, contrast: { passes: true } });

    // While it shows, a failing change is refused and the identity stays as it was.
    const muddy = await shop.put('/brand', {
      ...pale,
      mainColor: suggestion,
      accentColor: '#d9534f',
    });
    expect(fieldsOf(muddy)).toEqual({ accentColor: 'low_contrast' });
    expect((await editorOf(shop)).identity['accentColor']).toBe('#f2a516');
    // A background the status colours cannot be read on names the background, and here the main colour with it.
    const sand = await shop.put('/brand', {
      ...pale,
      mainColor: suggestion,
      backgroundColor: '#eae4d0',
    });
    expect(fieldsOf(sand)).toMatchObject({ backgroundColor: 'low_contrast' });
  });

  it("holds the icon to a square of 512 px or more, and each image to the shop's own ready ones", async () => {
    const shop = await openShop(port, texts, 'brand-images');
    const other = await openShop(port, texts, 'brand-images');
    const small = await upload(shop, await picture(300, 300));
    const wide = await upload(shop, await picture(800, 600));
    const theirs = await upload(other, await picture(600, 600));
    for (const iconId of [small, wide]) {
      const refused = await shop.put('/brand', { ...MAROON, iconId });
      expect(fieldsOf(refused)).toEqual({ iconId: 'out_of_range' });
      expect(errorOf(refused).message).toBe(said('BrandIconNotSquare', { min: 512 }));
    }
    const unready = await shop.put('/brand', {
      ...MAROON,
      darkLogoId: theirs,
      iconId: randomUUID(),
    });
    expect(fieldsOf(unready)).toEqual({ darkLogoId: 'not_found', iconId: 'not_found' });

    const icon = await upload(shop, await picture(600, 600));
    const darkLogo = await upload(shop, await picture(400, 120, 255, 255, 255));
    const saved = await shop.put('/brand', { ...MAROON, iconId: icon, darkLogoId: darkLogo });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body).toMatchObject({
      identity: { icon: { id: icon }, darkLogo: { id: darkLogo } },
    });

    // Deleting an image clears it from the identity, and keeps the rest.
    expect((await shop.delete(`/media/${icon}`)).status).toBe(200);
    expect((await editorOf(shop)).identity).toMatchObject({
      icon: null,
      darkLogo: { id: darkLogo },
    });
  });

  it('never sets body text in a typeface for headings only, and only settings managers edit it', async () => {
    const shop = await openShop(port, texts, 'brand-rules');
    const display = await shop.put('/brand', { ...MAROON, bodyFont: 'galada_playfair_display' });
    expect(fieldsOf(display)).toEqual({ bodyFont: 'not_allowed' });
    // Room for two staff members.
    await app
      .get(PlanLimitOverridesService)
      .set(shop.tenantId, 'staff', null, 'brand permissions test', randomUUID());
    const settings = await staffWith(port, texts, admin, shop, ['settings:manage']);
    const reader = await staffWith(port, texts, admin, shop, ['products:read']);
    expect((await getJson(port, '/brand', settings)).status).toBe(200);
    expect((await getJson(port, '/brand', reader)).status).toBe(403);
  });

  it('gives the shop app and the public read the identity while it shows (TEN-17, BRN-07)', async () => {
    const shop = await openShop(port, texts, 'brand-app');
    const manifest = async () =>
      (await getJson(port, `/shops/${shop.slug}/manifest.webmanifest`, { host: 'localhost' }))
        .body as {
        theme_color: string;
        background_color: string;
        icons: { src: string }[];
      };
    const before = await manifest();
    expect(before).toMatchObject({
      theme_color: LYTRO_APP_COLORS.theme,
      background_color: LYTRO_APP_COLORS.background,
    });

    await holdAddon(shop);
    // A square icon in two colours: a navy tile with a gold square in its middle.
    const gold = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 240, g: 190, b: 40 } },
    })
      .png()
      .toBuffer();
    const tile = await sharp({
      create: { width: 600, height: 600, channels: 3, background: { r: 20, g: 30, b: 90 } },
    })
      .composite([{ input: gold, gravity: 'center' }])
      .png()
      .toBuffer();
    const icon = await upload(shop, tile);
    expect((await shop.put('/brand', { ...MAROON, iconId: icon, useBrand: true })).status).toBe(
      200,
    );

    const after = await manifest();
    expect(after).toMatchObject({ theme_color: '#7a1f2b', background_color: '#fbf7f0' });
    expect(after.icons[0]?.src).not.toBe(before.icons[0]?.src);
    // Edge to edge: the icon's own navy reaches the corner.
    const drawn = await getBinary(port, (after.icons[1]?.src ?? '').replace(/^\/api\/v1/, ''), {
      host: 'localhost',
    });
    const { data } = await sharp(drawn.body)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    [20, 30, 90].forEach((navy, index) => {
      expect(Math.abs((data[index] ?? 0) - navy)).toBeLessThanOrEqual(8);
    });

    // The public read carries the same tokens, for the storefront and the shop's own site.
    const made = await shop.post('/api-keys', { name: 'Website', websites: [SITE] });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const key = (made.body as { key: string }).key;
    const read = async (): Promise<HttpResult> =>
      sendExact(port, 'GET', '/v1/shop', undefined, {
        host: API_HOST,
        authorization: `Bearer ${key}`,
        origin: SITE,
      });
    const publicBrand = ((await read()).body as { brand: LiveBrand | null }).brand;
    expect(publicBrand).toEqual(await meBrandOf(shop));
    expect(publicBrand?.icon?.id).toBe(icon);

    expect((await shop.put('/brand/switch', { useBrand: false })).status).toBe(200);
    expect(((await read()).body as { brand: LiveBrand | null }).brand).toBeNull();
    expect(await manifest()).toMatchObject({ theme_color: LYTRO_APP_COLORS.theme });
  });

  it('goes with the rest of the shop at day 60 (LIF-19)', async () => {
    const shop = await openShop(port, texts, 'brand-gone');
    expect((await shop.put('/brand', MAROON)).status).toBe(200);
    await app.get(BrandEraser).deleteAllForTenant(shop.tenantId);
    await app.get(BrandEraser).deleteAllForTenant(shop.tenantId);
    expect(await editorOf(shop)).toMatchObject({ savedAt: null, identity: DEFAULT_BRAND });
  });
});
