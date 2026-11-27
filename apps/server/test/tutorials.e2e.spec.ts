import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import ffmpegPath from 'ffmpeg-static';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TUTORIAL_SERIES, type OperatorTutorialView } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { TutorialFilesTickWorker } from '../src/modules/shared/queue-workers/services/tutorial-files-tick-worker';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { TutorialFileSweep } from '../src/modules/tutorials/services/tutorial-file-sweep';
import { TUTORIAL_CLOCK } from '../src/modules/tutorials/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import {
  cookieFrom,
  deleteJson,
  getJson,
  postJson,
  putJson,
  type HttpResult,
} from './support/http';
import { MemoryStorage } from './support/memory-storage';
import { errorOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// TENANT-DASHBOARD-DESIGN §7.49, §7.49a and OPERATOR-CONSOLE-DESIGN §10h: the tutorial videos over the real stack -- the
// console's upload (checked by ffmpeg, re-wrapped, the cover from the first frame, a new version's name each time),
// remove and playlist; each shop person's watched marks and hidden screens; Home's head; the nightly deletion of old
// files. The store is the in-memory stand-in for R2.

const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_tutorials_test';
const describeIfDatabase = ADMIN_URL && ffmpegPath ? describe : describe.skip;
vi.setConfig({ testTimeout: 90_000, hookTimeout: 300_000 });

const DAY = 24 * 60 * 60 * 1000;
const PRODUCT = '03-add-product';

let app: INestApplication;
let port: number;
let admin: pg.Client;
let operator: Record<string, string> = {};
let work = '';
const texts = new SmsCapture();
const storage = new MemoryStorage();
let now = new Date();

/** A test clip made by the same pinned ffmpeg the server uses. */
function clip(width: number, height: number, audio = true, seconds = 2): Buffer {
  if (ffmpegPath === null) throw new Error('ffmpeg-static has no binary for this platform');
  const out = join(work, `${randomUUID()}.mp4`);
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
      `testsrc2=size=${String(width)}x${String(height)}:rate=15`,
      ...(audio ? ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000'] : []),
      '-t',
      String(seconds),
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      ...(audio ? ['-c:a', 'aac', '-b:a', '96k'] : ['-an']),
      out,
    ],
    { windowsHide: true },
  );
  if (made.status !== 0) throw new Error(`clip not made: ${made.stderr.toString()}`);
  return readFileSync(out);
}

async function operatorHeaders(): Promise<Record<string, string>> {
  const password = 'tutorial-operator-9';
  const email = `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
  await admin.query(
    'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2)',
    [email, await hash(password, 12)],
  );
  const signedIn = await postJson(port, '/auth/operator/signin', { email, password });
  const code = await generate({ secret: (signedIn.body as { secret: string }).secret });
  const enrolled = await postJson(port, '/auth/operator/enroll', { email, password, code });
  return {
    cookie: cookieFrom(enrolled),
    'x-csrf-token': (enrolled.body as { csrfToken: string }).csrfToken,
  };
}

/** The console's upload: start, PUT to the signed link, then publish; the publish's answer. */
async function upload(key: string, file: Buffer): Promise<HttpResult> {
  const started = await postJson(
    port,
    `/operator/tutorials/${key}/uploads`,
    { contentType: 'video/mp4', bytes: file.length },
    operator,
  );
  expect(started.status, JSON.stringify(started.body)).toBe(201);
  const { uploadKey, upload: link } = started.body as {
    uploadKey: string;
    upload: { url: string };
  };
  expect(storage.send(link.url, file, 'video/mp4')).toBe(200);
  return putJson(port, `/operator/tutorials/${key}`, { uploadKey }, operator);
}

interface TutorialsAnswer {
  parts: {
    key: string;
    video: { url: string; durationSeconds: number } | null;
    watched: boolean;
  }[];
  dismissed: string[];
  playlistUrl: string | null;
}

async function tutorialsOf(get: () => Promise<{ status: number; body: unknown }>) {
  const answer = await get();
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  return answer.body as TutorialsAnswer;
}

const partOf = (view: TutorialsAnswer, key: string) => view.parts.find((each) => each.key === key);

/** MED-08's fast start: the index before the media, so playback begins while the rest arrives. */
function startsFast(mp4: Buffer): boolean {
  const index = mp4.indexOf('moov');
  const data = mp4.indexOf('mdat');
  return index !== -1 && data !== -1 && index < data;
}

describeIfDatabase('the in-app tutorial videos (§7.49, §10h)', () => {
  let shop: ShopClient;
  let other: ShopClient;
  let staff: Record<string, string>;

  beforeAll(async () => {
    if (!ADMIN_URL) return;
    work = mkdtempSync(join(tmpdir(), 'lytro-tutorial-test-'));
    const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
    process.env['DATABASE_URL'] = urls.appDbUrl;
    process.env['OTP_SECRET'] = 'tutorial-e2e-otp-secret-0123456789abcdef';
    process.env['PLATFORM_DOMAIN'] = 'localhost';
    process.env['MEDIA_PUBLIC_BASE_URL'] = 'https://media.test';
    admin = new pg.Client({ connectionString: urls.adminDbUrl });
    await admin.connect();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SMS_PROVIDER)
      .useValue(texts.provider)
      .overrideProvider(MEDIA_STORAGE)
      .useValue(storage)
      .overrideProvider(TUTORIAL_CLOCK)
      .useValue(() => now)
      .overrideProvider(TutorialFilesTickWorker)
      .useValue({})
      .compile();
    ({ app, port } = await listenOn(moduleRef));
    operator = await operatorHeaders();
    shop = await openShop(port, texts, 'tutor');
    other = await openShop(port, texts, 'tutor');
    staff = await staffWith(port, texts, admin, shop, ['orders:read']);
  });

  afterAll(async () => {
    if (!ADMIN_URL) return;
    await app.close();
    await admin.end();
    rmSync(work, { recursive: true, force: true });
  });

  it('lists the whole series in order with no files yet: no rows anywhere, no playlist', async () => {
    const view = await tutorialsOf(() => shop.get('/tutorials'));
    expect(view.parts.map((each) => each.key)).toEqual(TUTORIAL_SERIES.map((part) => part.key));
    expect(view.parts).toHaveLength(14);
    expect(view.parts.every((each) => each.video === null && !each.watched)).toBe(true);
    expect(view).toMatchObject({ dismissed: [], playlistUrl: null });
    const console = await getJson(port, '/operator/tutorials', operator);
    expect(console.status).toBe(200);
    const rows = (console.body as { parts: OperatorTutorialView[] }).parts;
    expect(rows.find((each) => each.key === PRODUCT)).toMatchObject({
      video: null,
      nextFile: 'platform/tutorials/03-add-product-v1.mp4',
    });
  });

  it("the console's routes are Lytro's alone: a shop's session is refused", async () => {
    expect((await getJson(port, '/operator/tutorials', shop.headers())).status).toBe(401);
  });

  it('refuses a landscape file, and one without AAC sound; nothing is stored', async () => {
    const landscape = await upload(PRODUCT, clip(480, 270));
    expect(landscape.status).toBe(400);
    expect(errorOf(landscape).message).toContain('480 × 270');
    const silent = await upload(PRODUCT, clip(270, 480, false));
    expect(silent.status).toBe(400);
    expect(errorOf(silent).message).toContain('AAC');
    expect([...storage.media.keys()].some((key) => key.startsWith('platform/'))).toBe(false);
  });

  it('makes a 9:16 MP4 live as v1, its length read from the file, re-wrapped to play at once', async () => {
    const answer = await upload(PRODUCT, clip(270, 480, true, 3));
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    const row = answer.body as OperatorTutorialView;
    expect(row.video).toMatchObject({
      file: 'platform/tutorials/03-add-product-v1.mp4',
      url: 'https://media.test/platform/tutorials/03-add-product-v1.mp4',
      coverUrl: 'https://media.test/platform/tutorials/03-add-product-v1.jpg',
      durationSeconds: 3,
      width: 270,
      height: 480,
      version: 1,
    });
    expect(row.nextFile).toBe('platform/tutorials/03-add-product-v2.mp4');
    const stored = storage.media.get('platform/tutorials/03-add-product-v1.mp4');
    expect(stored && startsFast(stored)).toBe(true);
    const cover = storage.media.get('platform/tutorials/03-add-product-v1.jpg');
    expect(cover?.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    const audit = await admin.query<{ summary: Record<string, unknown> }>(
      "SELECT summary FROM control.platform_audit_log WHERE action = 'tutorial_uploaded'",
    );
    expect(audit.rows[0]?.summary).toMatchObject({ tutorialKey: PRODUCT, version: 1 });
  });

  it("every person in the shop sees the file; each one's watched mark is their own", async () => {
    const owner = await tutorialsOf(() => shop.get('/tutorials'));
    expect(partOf(owner, PRODUCT)?.video).toMatchObject({ durationSeconds: 3 });
    expect((await shop.post(`/tutorials/${PRODUCT}/watched`, {})).status).toBe(200);
    // Watching again changes nothing.
    expect((await shop.post(`/tutorials/${PRODUCT}/watched`, {})).status).toBe(200);
    expect(partOf(await tutorialsOf(() => shop.get('/tutorials')), PRODUCT)?.watched).toBe(true);
    const theirs = await tutorialsOf(() => getJson(port, '/tutorials', staff));
    expect(partOf(theirs, PRODUCT)).toMatchObject({ watched: false });
    expect(partOf(await tutorialsOf(() => other.get('/tutorials')), PRODUCT)?.watched).toBe(false);
    expect((await shop.post('/tutorials/99-nothing/watched', {})).status).toBe(404);
  });

  it('hides a screen for one person only; the in-card places have no dismiss', async () => {
    expect((await shop.post('/tutorials/dismissals', { screen: 'products' })).status).toBe(200);
    expect((await tutorialsOf(() => shop.get('/tutorials'))).dismissed).toEqual(['products']);
    expect((await tutorialsOf(() => getJson(port, '/tutorials', staff))).dismissed).toEqual([]);
    expect((await tutorialsOf(() => other.get('/tutorials'))).dismissed).toEqual([]);
    expect((await shop.post('/tutorials/dismissals', { screen: 'share_sheet' })).status).toBe(400);
    expect((await shop.post('/tutorials/dismissals', { screen: 'nowhere' })).status).toBe(400);
  });

  it('replaces with the next version; the old file stays, and the watched mark is kept', async () => {
    const answer = await upload(PRODUCT, clip(540, 960, true, 2));
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect((answer.body as OperatorTutorialView).video).toMatchObject({
      file: 'platform/tutorials/03-add-product-v2.mp4',
      durationSeconds: 2,
    });
    expect(storage.media.has('platform/tutorials/03-add-product-v1.mp4')).toBe(true);
    const view = await tutorialsOf(() => shop.get('/tutorials'));
    expect(partOf(view, PRODUCT)).toMatchObject({
      watched: true,
      video: { url: 'https://media.test/platform/tutorials/03-add-product-v2.mp4' },
    });
    const audit = await admin.query<{ summary: Record<string, unknown> }>(
      "SELECT summary FROM control.platform_audit_log WHERE action = 'tutorial_replaced'",
    );
    expect(audit.rows[0]?.summary).toMatchObject({
      version: 2,
      was: 'platform/tutorials/03-add-product-v1.mp4',
    });
  });

  it("an upload for one part can't be published as another", async () => {
    const started = await postJson(
      port,
      `/operator/tutorials/${PRODUCT}/uploads`,
      { contentType: 'video/mp4', bytes: 10 },
      operator,
    );
    const { uploadKey } = started.body as { uploadKey: string };
    const crossed = await putJson(
      port,
      '/operator/tutorials/01-shop-setup',
      { uploadKey },
      operator,
    );
    expect(crossed.status).toBe(400);
  });

  it("Home's head: the owner's while the card is open and no order came; small once all are watched", async () => {
    const headOf = async (get: Promise<{ body: unknown }>) =>
      ((await get).body as { tutorialsHead: string | null }).tutorialsHead;
    // Part 3 is the one of the four with a file: watched by this owner, not by the other shop's.
    expect(await headOf(shop.get('/home'))).toBe('small');
    expect(await headOf(other.get('/home'))).toBe('full');
    const shopSetup = await upload('01-shop-setup', clip(270, 480, true, 1));
    expect(shopSetup.status).toBe(200);
    expect(await headOf(shop.get('/home'))).toBe('full');
    // Staff never see the head.
    expect(await headOf(getJson(port, '/home', staff))).toBe(null);
    expect((await shop.post('/tutorials/dismissals', { screen: 'home' })).status).toBe(200);
    expect(await headOf(shop.get('/home'))).toBe(null);
  });

  it('removes a part: no video anywhere, and the next upload still moves the name on', async () => {
    const removed = await deleteJson(port, `/operator/tutorials/${PRODUCT}`, operator);
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect(removed.body).toMatchObject({
      video: null,
      nextFile: 'platform/tutorials/03-add-product-v3.mp4',
    });
    expect(partOf(await tutorialsOf(() => shop.get('/tutorials')), PRODUCT)?.video).toBe(null);
    expect((await deleteJson(port, `/operator/tutorials/${PRODUCT}`, operator)).status).toBe(409);
    const again = await upload(PRODUCT, clip(270, 480, true, 1));
    expect((again.body as OperatorTutorialView).video?.file).toBe(
      'platform/tutorials/03-add-product-v3.mp4',
    );
  });

  it("deletes the old versions' files 7 days after they were retired, never a live one", async () => {
    const sweep = app.get(TutorialFileSweep);
    expect(await sweep.run()).toBe(0);
    now = new Date(Date.now() + 8 * DAY);
    expect(await sweep.run()).toBe(2);
    for (const version of [1, 2]) {
      expect(storage.media.has(`platform/tutorials/03-add-product-v${String(version)}.mp4`)).toBe(
        false,
      );
      expect(storage.media.has(`platform/tutorials/03-add-product-v${String(version)}.jpg`)).toBe(
        false,
      );
    }
    expect(storage.media.has('platform/tutorials/03-add-product-v3.mp4')).toBe(true);
    expect(storage.media.has('platform/tutorials/01-shop-setup-v1.mp4')).toBe(true);
    expect(await sweep.run()).toBe(0);
  });

  it('sets and clears the YouTube playlist link, refusing any other address', async () => {
    const wrong = await putJson(
      port,
      '/operator/tutorials/playlist',
      { playlistUrl: 'https://example.com/list' },
      operator,
    );
    expect(wrong.status).toBe(400);
    const link = 'https://www.youtube.com/playlist?list=PLtest';
    const set = await putJson(
      port,
      '/operator/tutorials/playlist',
      { playlistUrl: link },
      operator,
    );
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect((await tutorialsOf(() => shop.get('/tutorials'))).playlistUrl).toBe(link);
    const audit = await admin.query<{ summary: Record<string, unknown> }>(
      "SELECT summary FROM control.platform_audit_log WHERE action = 'settings_changed' ORDER BY id DESC LIMIT 1",
    );
    expect(audit.rows[0]?.summary).toMatchObject({ key: 'tutorials_playlist_url', newValue: link });
    await putJson(port, '/operator/tutorials/playlist', { playlistUrl: null }, operator);
    expect((await tutorialsOf(() => shop.get('/tutorials'))).playlistUrl).toBe(null);
  });
});
