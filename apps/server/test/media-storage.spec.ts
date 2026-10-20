import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { S3MediaStorage, type StorageKey } from '../src/modules/media/providers/s3-media-storage';

// Phase 3 Slice 6a: the media store over the S3 API (D3-4), against the real store the server is set up with -- the R2
// dev buckets in development and CI: a signed upload takes exactly the file it was signed for (MED-03), and processed
// media goes under its prefix (MED-01). Uses the server's own MEDIA_* settings; runs only when MEDIA_STORAGE_ENDPOINT
// is set. Everything it writes is under one run's folder, removed afterwards.
const env = process.env;
const ENDPOINT = env['MEDIA_STORAGE_ENDPOINT'];
const describeIfStorage = ENDPOINT ? describe : describe.skip;

function keyOf(job: 'SIGNER' | 'PROCESSOR' | 'DELETER'): StorageKey {
  return {
    accessKeyId: env[`MEDIA_${job}_ACCESS_KEY`] ?? '',
    secretAccessKey: env[`MEDIA_${job}_SECRET_KEY`] ?? '',
  };
}

const RUN = `test-runs/${randomUUID()}`;
let storage: S3MediaStorage;

beforeAll(() => {
  if (!ENDPOINT) return;
  storage = new S3MediaStorage({
    endpoint: ENDPOINT,
    region: env['MEDIA_STORAGE_REGION'] ?? 'auto',
    pathStyle: (env['MEDIA_STORAGE_PATH_STYLE'] ?? 'true') === 'true',
    uploadsBucket: env['MEDIA_UPLOADS_BUCKET'] ?? 'lytro-uploads',
    mediaBucket: env['MEDIA_BUCKET'] ?? 'lytro-media',
    signer: keyOf('SIGNER'),
    processor: keyOf('PROCESSOR'),
    deleter: keyOf('DELETER'),
  });
});

afterAll(async () => {
  if (!ENDPOINT) return;
  const left = await storage.listMedia(`${RUN}/`);
  await storage.deleteMedia(left.map((object) => object.key));
});

function put(url: string, body: Buffer, type: string): Promise<number> {
  return fetch(url, { method: 'PUT', body, headers: { 'content-type': type } }).then(
    (response) => response.status,
  );
}

describeIfStorage('the media store (D3-4, MED-01, MED-03)', () => {
  it('takes exactly the file a signed upload was made for, and refuses any other', async () => {
    const key = `${RUN}/${randomUUID()}`;
    const file = Buffer.alloc(1000, 1);
    const signed = await storage.signUpload(key, 'image/jpeg', file.length, 900);
    expect(signed).toMatchObject({ method: 'PUT', headers: { 'content-type': 'image/jpeg' } });
    expect(signed.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(await put(signed.url, Buffer.alloc(1001, 1), 'image/jpeg')).toBe(403);
    expect(await put(signed.url, file, 'text/html')).toBe(403);
    expect(await put(signed.url, file, 'image/jpeg')).toBe(200);
    expect((await storage.readUpload(key))?.equals(file)).toBe(true);
    await storage.removeUpload(key);
    expect(await storage.readUpload(key)).toBeNull();
  });

  it('keeps processed media under its prefix, lists it with its size, and deletes it', async () => {
    const prefix = `${RUN}/tenants/${randomUUID()}/`;
    await storage.putMedia(`${prefix}a.webp`, Buffer.alloc(300, 2), 'image/webp');
    await storage.putMedia(`${prefix}a.thumb.webp`, Buffer.alloc(40, 3), 'image/webp');
    await storage.putMedia(
      `${RUN}/tenants/${randomUUID()}/other.webp`,
      Buffer.alloc(10, 4),
      'image/webp',
    );
    const listed = await storage.listMedia(prefix);
    expect(listed.sort((x, y) => x.key.localeCompare(y.key))).toEqual([
      { key: `${prefix}a.thumb.webp`, bytes: 40 },
      { key: `${prefix}a.webp`, bytes: 300 },
    ]);
    await storage.deleteMedia(listed.map((object) => object.key));
    expect(await storage.listMedia(prefix)).toEqual([]);
  });
});
