import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ffmpegPath from 'ffmpeg-static';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app/app.module';
import type { MessageKey } from '../src/common/i18n/message-key';
import { translate } from '../src/common/i18n/messages';
import type { MediaFailureNotice, MediaNotifier } from '../src/modules/media/ports/media-notifier';
import { MediaDeleter } from '../src/modules/media/services/media-deleter';
import { MediaProcessor } from '../src/modules/media/services/media-processor';
import { MediaReconciler } from '../src/modules/media/services/media-reconciler';
import type { MediaDeletePayload } from '../src/modules/media/services/media.service';
import { VideoProcessor } from '../src/modules/media/services/video-processor';
import { MEDIA_CLOCK, MEDIA_NOTIFIER, MEDIA_STORAGE } from '../src/modules/media/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { MemoryStorage } from './support/memory-storage';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 6b: videos -- judged by content, compressed to a 720p H.264/AAC MP4 that plays before it has all
// arrived, with a poster, or kept as they are when already small enough -- a product's one video, and the nightly run
// that clears abandoned uploads, refuses stuck items and compares each shop's rows with what R2 holds. STO-05, STO-09,
// PRD-11, MED-04, MED-11. The clips are made by the pinned ffmpeg itself; the 130 MB phone clip runs only with
// MEDIA_SLOW_TESTS=1. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_media_video_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const SLOW = process.env['MEDIA_SLOW_TESTS'] === '1';
const MB = 1024 * 1024;
const HOUR_MS = 60 * 60 * 1000;

/** Keeps every failure notice, in place of the console stand-in. */
class NoticeCapture implements MediaNotifier {
  readonly notices: MediaFailureNotice[] = [];

  mediaFailed(notice: MediaFailureNotice): Promise<void> {
    this.notices.push(notice);
    return Promise.resolve();
  }

  for(tenantId: string): MediaFailureNotice[] {
    return this.notices.filter((notice) => notice.tenantId === tenantId);
  }
}

interface MediaView {
  id: string;
  kind: string;
  status: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  bytes: number;
  urls: { main: string; thumbnail: string } | null;
  failure: string | null;
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const storage = new MemoryStorage();
const notices = new NoticeCapture();
// The nightly run's clock: the tests move it on instead of waiting a day.
let clockOffsetMs = 0;
const work = mkdtempSync(join(tmpdir(), 'lytro-video-test-'));

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'media-video-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['MEDIA_PUBLIC_BASE_URL'] = 'https://media.example.test';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(MEDIA_STORAGE)
    .useValue(storage)
    .overrideProvider(MEDIA_NOTIFIER)
    .useValue(notices)
    .overrideProvider(MEDIA_CLOCK)
    .useValue(() => new Date(Date.now() + clockOffsetMs))
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  rmSync(work, { recursive: true, force: true });
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

/** What the dashboard is told, in the default language (Bangla). */
function said(key: MessageKey, params: Record<string, string | number> = {}): string {
  return translate(key, 'bn', params);
}

interface ClipSpec {
  width: number;
  height: number;
  seconds: number;
  container: 'mp4' | 'webm';
  /** H.264 at this bitrate (or this constant quality), or VP8 for a WebM. */
  bitrate?: string;
  crf?: string;
  audio: boolean;
}

/** A test clip, made by the same pinned ffmpeg the server uses. */
function clip(spec: ClipSpec): Buffer {
  if (ffmpegPath === null) throw new Error('ffmpeg-static has no binary for this platform');
  const out = join(work, `${randomUUID()}.${spec.container}`);
  const video =
    spec.container === 'webm'
      ? ['-c:v', 'libvpx', '-b:v', spec.bitrate ?? '1M']
      : [
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          ...(spec.crf ? ['-crf', spec.crf] : ['-b:v', spec.bitrate ?? '4M']),
          '-pix_fmt',
          'yuv420p',
        ];
  const audio = spec.audio
    ? spec.container === 'webm'
      ? ['-c:a', 'libopus', '-b:a', '96k']
      : ['-c:a', 'aac', '-b:a', '160k']
    : ['-an'];
  const made = spawnSync(
    ffmpegPath,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=${String(spec.width)}x${String(spec.height)}:rate=30`,
      ...(spec.audio ? ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000'] : []),
      '-t',
      String(spec.seconds),
      ...video,
      ...audio,
      out,
    ],
    { windowsHide: true },
  );
  if (made.status !== 0) throw new Error(`clip not made: ${made.stderr.toString()}`);
  return readFileSync(out);
}

/** A stored file, written out so ffmpeg can read it. */
function onDisk(body: Buffer, name: string): string {
  const path = join(work, `${randomUUID()}-${name}`);
  writeFileSync(path, body);
  return path;
}

/** MED-08's fast start: the index sits before the media, so playback begins while the rest arrives. */
function startsFast(mp4: Buffer): boolean {
  const index = mp4.indexOf('moov');
  const data = mp4.indexOf('mdat');
  return index !== -1 && data !== -1 && index < data;
}

/** Starts, sends and finishes an upload, then runs the processing job, as the video worker would. */
async function upload(
  shop: ShopClient,
  file: Buffer,
  contentType = 'video/mp4',
  body: Record<string, unknown> = {},
): Promise<MediaView> {
  const started = await shop.post('/media/uploads', {
    kind: 'video',
    contentType,
    bytes: file.length,
    purpose: 'product_video',
    ...body,
  });
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  const { media, upload: link } = started.body as {
    media: MediaView;
    upload: { url: string };
  };
  expect(storage.send(link.url, file, contentType)).toBe(200);
  expect((await shop.post(`/media/${media.id}/finish`, {})).status).toBe(201);
  const queued = await admin.query<{ queue_name: string }>(
    "SELECT queue_name FROM control.job_outbox WHERE payload->>'mediaId' = $1",
    [media.id],
  );
  expect(queued.rows.map((row) => row.queue_name)).toEqual(['media_process_video']);
  await app.get(MediaProcessor).process(shop.tenantId, media.id);
  return (await shop.get(`/media/${media.id}`)).body as MediaView;
}

function storedFile(view: MediaView, which: 'main' | 'thumbnail'): Buffer {
  const url = view.urls?.[which];
  const body = url ? storage.media.get(url.replace('https://media.example.test/', '')) : undefined;
  if (!body) throw new Error(`no stored ${which} for ${view.id}`);
  return body;
}

async function usedBytes(shop: ShopClient): Promise<number> {
  return ((await shop.get('/media/usage')).body as { usedBytes: number }).usedBytes;
}

async function runDeletions(): Promise<void> {
  const rows = await admin.query<{ id: string; payload: MediaDeletePayload }>(
    "SELECT id, payload FROM control.job_outbox WHERE queue_name = 'media_delete' AND status = 'pending'",
  );
  for (const row of rows.rows) {
    await app.get(MediaDeleter).delete(row.payload);
    await admin.query("UPDATE control.job_outbox SET status = 'sent' WHERE id = $1", [row.id]);
  }
}

describeIfDatabase('processing a video (STO-05, STO-09)', () => {
  it('compresses a 1080p clip to a 720p H.264/AAC MP4 that starts fast, with a poster, counting only those', async () => {
    const shop = await openShop(port, texts, 'video');
    const file = clip({
      width: 1920,
      height: 1080,
      seconds: 3,
      container: 'mp4',
      bitrate: '8M',
      audio: true,
    });
    const ready = await upload(shop, file);
    expect(ready).toMatchObject({ status: 'ready', kind: 'video', width: 1280, height: 720 });
    expect(ready.durationMs).toBeGreaterThan(2900);
    expect(ready.durationMs).toBeLessThan(3200);
    const stem = `https://media.example.test/tenants/${shop.tenantId}/${ready.id}/`;
    expect(ready.urls?.main).toMatch(
      new RegExp(`^${stem.replace(/\./g, '\\.')}[0-9a-f]{32}\\.mp4$`),
    );
    expect(ready.urls?.thumbnail).toBe(ready.urls?.main.replace('.mp4', '.poster.webp'));

    const mp4 = storedFile(ready, 'main');
    const poster = storedFile(ready, 'thumbnail');
    const facts = await app.get(VideoProcessor).probe(onDisk(mp4, 'stored.mp4'));
    expect(facts).toMatchObject({
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      width: 1280,
      height: 720,
    });
    expect(startsFast(mp4)).toBe(true);
    expect(await sharp(poster).metadata()).toMatchObject({
      format: 'webp',
      width: 1280,
      height: 720,
    });
    // STO-01, STO-09: only the MP4 and its poster are stored and counted; the upload is gone.
    expect(ready.bytes).toBe(mp4.length + poster.length);
    expect(mp4.length).toBeLessThan(file.length);
    expect(await usedBytes(shop)).toBe(ready.bytes);
    expect(storage.uploads.has(`${shop.tenantId}/${ready.id}`)).toBe(false);
  });

  it('serves a WebM upload as an MP4', async () => {
    const shop = await openShop(port, texts, 'video');
    const ready = await upload(
      shop,
      clip({ width: 640, height: 360, seconds: 2, container: 'webm', audio: true }),
      'video/webm',
    );
    expect(ready).toMatchObject({ status: 'ready', width: 640, height: 360 });
    const facts = await app
      .get(VideoProcessor)
      .probe(onDisk(storedFile(ready, 'main'), 'stored.mp4'));
    expect(facts).toMatchObject({ container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' });
  });

  it('keeps an already-compressed small H.264 MP4 as it is, only made to start fast', async () => {
    const shop = await openShop(port, texts, 'video');
    const file = clip({
      width: 640,
      height: 360,
      seconds: 2,
      container: 'mp4',
      crf: '40',
      audio: true,
    });
    const ready = await upload(shop, file);
    const mp4 = storedFile(ready, 'main');
    // Its own streams, re-wrapped: within a few bytes of the original, and smaller than a compressed copy would be.
    expect(Math.abs(mp4.length - file.length)).toBeLessThan(file.length * 0.05);
    expect(startsFast(mp4)).toBe(true);
    expect(ready).toMatchObject({ status: 'ready', width: 640, height: 360 });
  });

  it('refuses a file that is not a video by its content, storing nothing and telling the shop', async () => {
    const shop = await openShop(port, texts, 'video');
    const jpeg = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    const refused = await upload(shop, jpeg);
    expect(refused).toMatchObject({
      status: 'failed',
      failure: 'not_supported',
      bytes: 0,
      urls: null,
    });
    expect(await storage.listMedia(`tenants/${shop.tenantId}/`)).toEqual([]);
    expect(notices.for(shop.tenantId)).toEqual([
      {
        tenantId: shop.tenantId,
        mediaId: refused.id,
        kind: 'video',
        purpose: 'product_video',
        failure: 'not_supported',
      },
    ]);
  });

  it('refuses a video over 150 MB before any file is sent', async () => {
    const shop = await openShop(port, texts, 'video');
    const started = await shop.post('/media/uploads', {
      kind: 'video',
      contentType: 'video/mp4',
      bytes: 151 * MB,
      purpose: 'product_video',
    });
    expect(started.status).toBe(400);
    expect(fieldsOf(started)).toEqual({ bytes: 'too_large' });
    expect(errorOf(started).message).toBe(said('VideoTooLarge', { mb: 150 }));
    // A 130 MB phone clip may start (STO-05, amended).
    const fits = await shop.post('/media/uploads', {
      kind: 'video',
      contentType: 'video/mp4',
      bytes: 130 * MB,
      purpose: 'product_video',
    });
    expect(fits.status).toBe(201);
  });

  (SLOW ? it : it.skip)(
    'stores a 1-minute 1080p phone clip of about 130 MB as a 720p MP4 within 5 minutes (STO-09)',
    async () => {
      const shop = await openShop(port, texts, 'video');
      const file = clip({
        width: 1920,
        height: 1080,
        seconds: 60,
        container: 'mp4',
        bitrate: '17M',
        audio: true,
      });
      expect(file.length).toBeGreaterThan(100 * MB);
      const started = Date.now();
      const ready = await upload(shop, file);
      expect(Date.now() - started).toBeLessThan(5 * 60 * 1000);
      expect(ready).toMatchObject({ status: 'ready', width: 1280, height: 720 });
      expect(ready.bytes).toBeLessThan(file.length / 4);
    },
    10 * 60 * 1000,
  );
});

describeIfDatabase("a product's video (PRD-11)", () => {
  it('shows one ready video on a product, copies it with the product, and clears it when deleted', async () => {
    const shop = await openShop(port, texts, 'video');
    const made = await shop.post('/products', { name: 'Saree', basePrice: 900 });
    const productId = (made.body as { id: string }).id;
    const video = await upload(
      shop,
      clip({ width: 640, height: 360, seconds: 2, container: 'mp4', bitrate: '1M', audio: false }),
    );
    const saved = await shop.put(`/products/${productId}/video`, { mediaId: video.id });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    // STO-01, STO-09: with the bytes and the length /media gives it, for the media sheet's "0:02 · 1 MB".
    expect(video.bytes).toBeGreaterThan(0);
    expect(video.durationMs).toBeGreaterThan(0);
    expect(saved.body).toMatchObject({
      video: {
        id: video.id,
        urls: { video: video.urls?.main, poster: video.urls?.thumbnail },
        bytes: video.bytes,
        durationMs: video.durationMs,
      },
    });
    const copy = (await shop.post(`/products/${productId}/duplicate`, {})).body as {
      video: { id: string } | null;
    };
    expect(copy.video?.id).toBe(video.id);
    expect(
      ((await shop.get(`/media/${video.id}`)).body as { uses: { videos: number } }).uses.videos,
    ).toBe(2);

    expect((await shop.delete(`/media/${video.id}`)).status).toBe(200);
    expect(
      ((await shop.get(`/products/${productId}`)).body as { video: unknown }).video,
    ).toBeNull();
    await runDeletions();
    expect(await storage.listMedia(`tenants/${shop.tenantId}/${video.id}/`)).toEqual([]);
  });

  it('takes only a ready video of the shop, and never a video as a photo', async () => {
    const shop = await openShop(port, texts, 'video');
    const other = await openShop(port, texts, 'video');
    const productId = (
      (await shop.post('/products', { name: 'Lamp', basePrice: 50 })).body as { id: string }
    ).id;
    const small = clip({
      width: 320,
      height: 240,
      seconds: 1,
      container: 'mp4',
      bitrate: '500k',
      audio: false,
    });
    const theirs = await upload(other, small);
    const mine = await upload(shop, small);
    const image = await shop.post('/media/uploads', {
      kind: 'image',
      contentType: 'image/jpeg',
      bytes: 100,
      purpose: 'product_image',
    });
    const pendingImage = (image.body as { media: { id: string } }).media.id;
    for (const mediaId of [theirs.id, pendingImage, randomUUID()]) {
      const refused = await shop.put(`/products/${productId}/video`, { mediaId });
      expect(refused.status).toBe(400);
      expect(fieldsOf(refused)).toEqual({ mediaId: 'not_found' });
      expect(errorOf(refused).message).toBe(said('MediaNotAttachable'));
    }
    const asPhoto = await shop.put(`/products/${productId}/images`, { mediaIds: [mine.id] });
    expect(fieldsOf(asPhoto)).toEqual({ mediaIds: 'not_found' });
    expect((await other.put(`/products/${productId}/video`, { mediaId: theirs.id })).status).toBe(
      404,
    );
    expect((await shop.put(`/products/${productId}/video`, { mediaId: null })).status).toBe(200);
  });
});

// The nightly run visits every shop, so these tests come last and assert per shop.
describeIfDatabase('the nightly run (MED-04, STO-09)', () => {
  async function findings(tenantId: string) {
    return (
      await admin.query<{
        recorded_bytes: string;
        stored_bytes: string;
        missing_files: number;
        stray_files: number;
        strays_deleted: number;
        mismatch_percent: string;
      }>('SELECT * FROM control.media_reconciliations WHERE tenant_id = $1', [tenantId])
    ).rows;
  }

  it('reports a recorded file R2 no longer holds, as an operator alert above 0.5%', async () => {
    const shop = await openShop(port, texts, 'nightly');
    const video = await upload(
      shop,
      clip({
        width: 320,
        height: 240,
        seconds: 1,
        container: 'mp4',
        bitrate: '500k',
        audio: false,
      }),
    );
    const posterKey = video.urls?.thumbnail.replace('https://media.example.test/', '') ?? '';
    storage.media.delete(posterKey);
    const alerts = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      await app.get(MediaReconciler).runNightly();
      expect(
        alerts.mock.calls
          .map((call) => String(call[0]))
          .some((line) => line.includes(shop.tenantId)),
      ).toBe(true);
    } finally {
      alerts.mockRestore();
    }
    const [found] = await findings(shop.tenantId);
    expect(found).toMatchObject({ missing_files: 1, stray_files: 0, strays_deleted: 0 });
    expect(Number(found?.mismatch_percent)).toBeGreaterThan(0.5);
    // Never dropped from the rows: the shop's usage still counts it.
    expect(await usedBytes(shop)).toBe(video.bytes);
  });

  it('deletes stray files over a day old, keeps recent ones, and records nothing for a shop that matches', async () => {
    const shop = await openShop(port, texts, 'nightly');
    const clean = await openShop(port, texts, 'nightly');
    await upload(
      clean,
      clip({
        width: 320,
        height: 240,
        seconds: 1,
        container: 'mp4',
        bitrate: '500k',
        audio: false,
      }),
    );
    const old = `tenants/${shop.tenantId}/lost/old.mp4`;
    const recent = `tenants/${shop.tenantId}/lost/recent.mp4`;
    storage.place(old, Buffer.alloc(2000, 1), 2 * 24 * HOUR_MS);
    storage.place(recent, Buffer.alloc(2000, 2), 2 * HOUR_MS);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      await app.get(MediaReconciler).runNightly();
    } finally {
      vi.restoreAllMocks();
    }
    expect(await findings(shop.tenantId)).toEqual([
      expect.objectContaining({ missing_files: 0, stray_files: 2, strays_deleted: 1 }),
    ]);
    expect(await findings(clean.tenantId)).toEqual([]);
    await runDeletions();
    expect(storage.media.has(old)).toBe(false);
    expect(storage.media.has(recent)).toBe(true);
  });

  it('clears uploads never finished after a day, and refuses items stuck processing, telling the shop', async () => {
    const shop = await openShop(port, texts, 'nightly');
    const start = (purpose: string) =>
      shop.post('/media/uploads', {
        kind: 'video',
        contentType: 'video/mp4',
        bytes: 5000,
        purpose,
      });
    const abandoned = ((await start('product_video')).body as { media: { id: string } }).media.id;
    const stuck = ((await start('product_video')).body as { media: { id: string } }).media.id;
    await shop.post(`/media/${stuck}/finish`, {});

    // An hour on, the processing one is stuck, the other is not yet abandoned.
    clockOffsetMs = 2 * HOUR_MS;
    try {
      await app.get(MediaReconciler).runNightly();
      expect((await shop.get(`/media/${stuck}`)).body).toMatchObject({
        status: 'failed',
        failure: 'processing_failed',
      });
      expect(notices.for(shop.tenantId).map((notice) => notice.mediaId)).toEqual([stuck]);
      expect((await shop.get(`/media/${abandoned}`)).status).toBe(200);

      // A day on, the never-finished upload is gone.
      clockOffsetMs = 26 * HOUR_MS;
      await app.get(MediaReconciler).runNightly();
      expect((await shop.get(`/media/${abandoned}`)).status).toBe(404);
      expect((await shop.get(`/media/${stuck}`)).status).toBe(200);
    } finally {
      clockOffsetMs = 0;
    }
  });
});
