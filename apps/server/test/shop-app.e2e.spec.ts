import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LYTRO_APP_COLORS, MONOGRAM_COLORS } from '@lytronix/shared-types';
import { monogramLetter } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { MediaProcessor } from '../src/modules/media/services/media-processor';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { shortNameOf } from '@lytronix/validators';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getBinary, getJson, type HttpResult } from './support/http';
import { MemoryStorage } from './support/memory-storage';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 11.1b: each shop's dashboard installs as its own app (TEN-17) -- a manifest named after the shop and
// scoped to its own path, and icons drawn from its logo (on the logo's own background colour, or white when it is
// transparent) or its monogram (TEN-16: the first letter on the ink tile, a Bangla name in a Bangla letter). No
// session; any shop not deleted. The store is the in-memory stand-in for R2. Runs only when DATABASE_TEST_ADMIN_URL
// is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_shop_app_test';

// Image work on one thread here, so this file leaves the other spec files their share of the machine.
sharp.concurrency(1);
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

interface Manifest {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  lang: string;
  theme_color: string;
  background_color: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
}

type Rgb = [number, number, number];

const INK = hexToRgb(MONOGRAM_COLORS.tile);
const LETTER = hexToRgb(MONOGRAM_COLORS.letter);
const WHITE: Rgb = [255, 255, 255];

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const storage = new MemoryStorage();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'shop-app-e2e-otp-secret-0123456789abcdefghij';
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

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** The shop's manifest as a browser fetches it: no session, no shop header. */
function fetchManifest(slug: string): Promise<HttpResult> {
  return getJson(port, `/shops/${slug}/manifest.webmanifest`, { host: 'localhost' });
}

async function manifestOf(slug: string): Promise<Manifest> {
  const answer = await fetchManifest(slug);
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  return answer.body as Manifest;
}

/** An icon by the link the manifest gives (or a file name), as a browser fetches it. */
function iconAt(src: string): ReturnType<typeof getBinary> {
  return getBinary(port, src.replace(/^\/api\/v1/, ''), { host: 'localhost' });
}

async function iconOf(slug: string, file: string): Promise<Buffer> {
  const icon = await iconAt(`/shops/${slug}/icons/${file}`);
  expect(icon.status, icon.body.toString()).toBe(200);
  return icon.body;
}

/** One pixel's colour. */
async function pixelOf(png: Buffer, x: number, y: number): Promise<Rgb> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return [data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0];
}

/** How many pixels are this colour, give or take what smoothing and compression change. */
async function countOf(png: Buffer, colour: Rgb, tolerance = 40): Promise<number> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let at = 0; at < data.length; at += info.channels) {
    if (colour.every((value, index) => Math.abs((data[at + index] ?? 0) - value) <= tolerance)) {
      count += 1;
    }
  }
  return count;
}

function expectNear(actual: Rgb, expected: Rgb, tolerance = 8): void {
  actual.forEach((value, index) => {
    expect(
      Math.abs(value - (expected[index] ?? 0)),
      `${actual.join()} vs ${expected.join()}`,
    ).toBeLessThanOrEqual(tolerance);
  });
}

/** A square logo: a centre square of one colour, half its width, on another colour or on nothing. */
async function logo(centre: Rgb, around: Rgb | null): Promise<Buffer> {
  const [r, g, b] = centre;
  const square = await sharp({
    create: { width: 128, height: 128, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
  const background = around
    ? { r: around[0], g: around[1], b: around[2], alpha: 1 }
    : { r: 0, g: 0, b: 0, alpha: 0 };
  return sharp({ create: { width: 256, height: 256, channels: 4, background } })
    .composite([{ input: square, gravity: 'center' }])
    .png()
    .toBuffer();
}

/** Uploads a logo, has it processed as the worker would, and makes it the shop's. */
async function setLogo(shop: ShopClient, file: Buffer): Promise<void> {
  const started = await shop.post('/media/uploads', {
    kind: 'image',
    contentType: 'image/png',
    bytes: file.length,
    purpose: 'shop_logo',
  });
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  const { media, upload } = started.body as { media: { id: string }; upload: { url: string } };
  expect(storage.send(upload.url, file, 'image/png')).toBe(200);
  expect((await shop.post(`/media/${media.id}/finish`, {})).status).toBe(201);
  await app.get(MediaProcessor).process(shop.tenantId, media.id);
  const saved = await shop.put('/shop-settings/logo', { mediaId: media.id });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
}

/** The version the manifest's icon links carry. */
function versionOf(manifest: Manifest): string {
  return (
    new URL(manifest.icons[0]?.src ?? '', 'https://app.example.test').searchParams.get('v') ?? ''
  );
}

describeIfDatabase("each shop's own installable app (TEN-17)", () => {
  it('gives each shop its own name, path and icons, for any browser, without a session', async () => {
    const first = await openShop(port, texts, 'app');
    const second = await openShop(port, texts, 'app');
    const answer = await fetchManifest(first.slug);
    expect(answer.status).toBe(200);
    expect(String(answer.headers['content-type'])).toMatch(/^application\/manifest\+json/);
    expect(answer.headers['cache-control']).toBe('public, max-age=60');
    const path = `/${first.slug}/`;
    const manifest = answer.body as Manifest;
    expect(manifest).toMatchObject({
      id: path,
      name: `Shop ${first.slug} Admin`,
      short_name: 'Shop Admin',
      start_url: path,
      scope: path,
      display: 'standalone',
      lang: 'bn',
      theme_color: LYTRO_APP_COLORS.theme,
      background_color: LYTRO_APP_COLORS.background,
    });
    expect(manifest.icons.map(({ sizes, type, purpose }) => ({ sizes, type, purpose }))).toEqual([
      { sizes: '192x192', type: 'image/png', purpose: 'any' },
      { sizes: '512x512', type: 'image/png', purpose: 'any' },
      { sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);

    // The other shop is another app: its own path and its own icon links.
    const other = await manifestOf(second.slug);
    expect(other.scope).toBe(`/${second.slug}/`);
    for (const icon of manifest.icons) {
      expect(icon.src).toMatch(
        new RegExp(`^/api/v1/shops/${first.slug}/icons/[a-z0-9-]+\\.png\\?v=[0-9a-f]{12}$`),
      );
      expect(other.icons.map((each) => each.src)).not.toContain(icon.src);
    }

    // Every icon is a PNG of its size; the iPhone's is fetched by its name, the manifest does not list it.
    const sizes = [192, 512, 512];
    for (const [index, icon] of manifest.icons.entries()) {
      const drawn = await iconAt(icon.src);
      expect(drawn.status).toBe(200);
      expect(drawn.headers['content-type']).toBe('image/png');
      expect(drawn.headers['cache-control']).toBe('public, max-age=86400');
      expect(await sharp(drawn.body).metadata()).toMatchObject({
        format: 'png',
        width: sizes[index],
        height: sizes[index],
      });
    }
    expect(await sharp(await iconOf(first.slug, 'apple-180.png')).metadata()).toMatchObject({
      format: 'png',
      width: 180,
      height: 180,
    });
  });

  it('draws the monogram in teal on the ink tile, a Bangla name in its Bangla letter (TEN-16)', async () => {
    const shop = await openShop(port, texts, 'app-letter');
    const latin = await iconOf(shop.slug, 'icon-512.png');
    expectNear(await pixelOf(latin, 4, 4), INK, 2);
    expect(await countOf(latin, LETTER)).toBeGreaterThan(2000);
    const before = versionOf(await manifestOf(shop.slug));

    // A new name is a new letter, behind new icon links.
    await admin.query(`UPDATE control.tenants SET shop_name = $2 WHERE id = $1`, [
      shop.tenantId,
      'আলো ঘর',
    ]);
    const renamed = await manifestOf(shop.slug);
    expect(renamed).toMatchObject({ name: 'আলো ঘর Admin', short_name: 'আলো ঘর Admin' });
    expect(versionOf(renamed)).not.toBe(before);
    const bangla = await iconOf(shop.slug, 'icon-512.png');
    expectNear(await pixelOf(bangla, 4, 4), INK, 2);
    expect(await countOf(bangla, LETTER)).toBeGreaterThan(2000);
    expect(bangla.equals(latin)).toBe(false);

    expect(monogramLetter('আলো ঘর', 'x')).toBe('আ');
    expect(monogramLetter('rahim store', 'x')).toBe('R');
    expect(monogramLetter('  "Bari" ', 'x')).toBe('B');
    expect(monogramLetter('***', 'zed')).toBe('Z');
  });

  it('sets a logo on its own background colour, a see-through one on white, and clears back to the monogram', async () => {
    const shop = await openShop(port, texts, 'app-logo');
    const monogram = versionOf(await manifestOf(shop.slug));
    const blue: Rgb = [20, 90, 200];
    const yellow: Rgb = [250, 210, 40];
    await setLogo(shop, await logo(yellow, blue));
    const withLogo = versionOf(await manifestOf(shop.slug));
    expect(withLogo).not.toBe(monogram);

    // The logo fills 80% of the plain icon and 56% of the maskable one, on its own blue.
    const plain = await iconOf(shop.slug, 'icon-512.png');
    const maskable = await iconOf(shop.slug, 'maskable-512.png');
    expectNear(await pixelOf(plain, 2, 2), blue);
    expectNear(await pixelOf(maskable, 2, 2), blue);
    expectNear(await pixelOf(plain, 256, 256), yellow);
    expectNear(await pixelOf(plain, 171, 256), yellow);
    expectNear(await pixelOf(maskable, 171, 256), blue);

    // A drawn icon is kept: asked again, it is not drawn again, and the logo is not read from storage again.
    const reads = vi.spyOn(storage, 'readMedia');
    expect((await iconOf(shop.slug, 'icon-512.png')).equals(plain)).toBe(true);
    expect(reads).not.toHaveBeenCalled();
    reads.mockRestore();

    // A logo that is see-through around its mark is set on white.
    const red: Rgb = [220, 30, 40];
    await setLogo(shop, await logo(red, null));
    expect(versionOf(await manifestOf(shop.slug))).not.toBe(withLogo);
    const clear = await iconOf(shop.slug, 'icon-192.png');
    expectNear(await pixelOf(clear, 2, 2), WHITE);
    expectNear(await pixelOf(clear, 96, 96), red);

    // No logo: the monogram again, under its own links.
    expect((await shop.put('/shop-settings/logo', { mediaId: null })).status).toBe(200);
    expect(versionOf(await manifestOf(shop.slug))).toBe(monogram);
    expectNear(await pixelOf(await iconOf(shop.slug, 'icon-192.png'), 2, 2), INK, 2);
  });

  it("draws the storefront app's icons plain and the dashboard's with a gear in the corner (SFT-14, Slice 12c)", async () => {
    const shop = await openShop(port, texts, 'app-gear');
    const sized = {
      'store-192.png': 192,
      'store-512.png': 512,
      'store-maskable-512.png': 512,
      'store-apple-180.png': 180,
    };
    for (const [file, size] of Object.entries(sized)) {
      expect(await sharp(await iconOf(shop.slug, file)).metadata()).toMatchObject({
        format: 'png',
        width: size,
        height: size,
      });
    }
    // The same monogram on both; only the dashboard's has the white disc near its corner.
    const store = await iconOf(shop.slug, 'store-512.png');
    const dashboard = await iconOf(shop.slug, 'icon-512.png');
    expectNear(await pixelOf(store, 4, 4), INK, 2);
    expectNear(await pixelOf(dashboard, 4, 4), INK, 2);
    expectNear(await pixelOf(store, 404, 470), INK, 2);
    expectNear(await pixelOf(dashboard, 404, 470), WHITE);
    expect(await countOf(store, WHITE, 20)).toBe(0);
    expect(await countOf(dashboard, WHITE, 20)).toBeGreaterThan(5000);

    // A maskable icon's disc stays inside the middle 80% circle a phone keeps.
    const masked = await iconOf(shop.slug, 'maskable-512.png');
    expect(await countOf(await iconOf(shop.slug, 'store-maskable-512.png'), WHITE, 20)).toBe(0);
    const { data, info } = await sharp(masked)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let inside = 0;
    let outside = 0;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const at = (y * info.width + x) * 3;
        const white = [0, 1, 2].every((channel) => (data[at + channel] ?? 0) > 235);
        if (!white) continue;
        if (Math.hypot(x - 256, y - 256) <= 0.4 * 512) inside += 1;
        else outside += 1;
      }
    }
    expect(inside).toBeGreaterThan(2000);
    expect(outside).toBe(0);
  });

  it('answers no app for a deleted shop, an unknown one, or an icon it does not draw', async () => {
    const shop = await openShop(port, texts, 'app-gone');
    expect((await iconAt(`/shops/${shop.slug}/icons/icon-64.png`)).status).toBe(404);
    expect((await iconAt(`/shops/${shop.slug}/icons/..%2Fmanifest.webmanifest`)).status).toBe(404);
    expect((await fetchManifest('no-such-shop-anywhere')).status).toBe(404);
    expect((await fetchManifest('Not%20A%20Shop')).status).toBe(404);
    expect((await iconAt('/shops/no-such-shop-anywhere/icons/icon-192.png')).status).toBe(404);

    // A lapsed shop's owner still opens its dashboard; a deleted shop has none.
    await admin.query(`UPDATE control.tenants SET state = 'locked' WHERE id = $1`, [shop.tenantId]);
    expect((await fetchManifest(shop.slug)).status).toBe(200);
    await admin.query(
      `UPDATE control.tenants SET state = 'deleted', deleted_at = now() WHERE id = $1`,
      [shop.tenantId],
    );
    const gone = await fetchManifest(shop.slug);
    expect(gone.status).toBe(404);
    expect((gone.body as { error: { code: string } }).error.code).toBe('not_found');
    expect((await iconAt(`/shops/${shop.slug}/icons/icon-192.png`)).status).toBe(404);
  });

  it('cuts a long name for the home screen at a word, up to twelve characters', () => {
    expect(shortNameOf('Bari')).toBe('Bari');
    expect(shortNameOf('  Rahim Store ')).toBe('Rahim Store');
    expect(shortNameOf('Rahim Fashion House')).toBe('Rahim');
    expect(shortNameOf('Supercalifragilistic')).toBe('Supercalifra');
    expect(shortNameOf('আলো ঘর ফ্যাশন হাউস')).toBe('আলো ঘর');
    // Slice 12c: with room left for " Admin".
    expect(shortNameOf('Megh Fashion', 6)).toBe('Megh');
  });
});
