import { randomUUID } from 'node:crypto';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { beforeAll, describe, expect, it } from 'vitest';
import { S3MediaStorage, type StorageKey } from '../src/modules/media/providers/s3-media-storage';

// Phase 3 Slice 6a: the media store over the S3 API (D3-4), against a real S3-compatible store: a signed upload takes
// exactly the file it was signed for (MED-03), and processed media goes under the shop's prefix (MED-01). Runs only
// when MEDIA_TEST_STORAGE_URL (and its key, MEDIA_TEST_STORAGE_KEY / _SECRET) names a store.
const ENDPOINT = process.env['MEDIA_TEST_STORAGE_URL'];
const describeIfStorage = ENDPOINT ? describe : describe.skip;
const KEY: StorageKey = {
  accessKeyId: process.env['MEDIA_TEST_STORAGE_KEY'] ?? '',
  secretAccessKey: process.env['MEDIA_TEST_STORAGE_SECRET'] ?? '',
};
// Fresh buckets per run, so runs never see each other's objects.
const RUN = randomUUID().slice(0, 8);
const UPLOADS = `test-uploads-${RUN}`;
const MEDIA = `test-media-${RUN}`;

let storage: S3MediaStorage;

beforeAll(async () => {
  if (!ENDPOINT) return;
  const admin = new S3Client({
    endpoint: ENDPOINT,
    region: 'auto',
    forcePathStyle: true,
    credentials: KEY,
  });
  for (const bucket of [UPLOADS, MEDIA])
    await admin.send(new CreateBucketCommand({ Bucket: bucket }));
  storage = new S3MediaStorage({
    endpoint: ENDPOINT,
    region: 'auto',
    pathStyle: true,
    uploadsBucket: UPLOADS,
    mediaBucket: MEDIA,
    publicBaseUrl: 'https://media.example.test/',
    signer: KEY,
    processor: KEY,
    deleter: KEY,
  });
});

function put(url: string, body: Buffer, type: string): Promise<number> {
  return fetch(url, { method: 'PUT', body, headers: { 'content-type': type } }).then(
    (response) => response.status,
  );
}

describeIfStorage('the media store (D3-4, MED-01, MED-03)', () => {
  it('takes exactly the file a signed upload was made for, and refuses any other', async () => {
    const key = `uploads/${randomUUID()}`;
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
    const prefix = `tenants/${randomUUID()}/`;
    await storage.putMedia(`${prefix}a.webp`, Buffer.alloc(300, 2), 'image/webp');
    await storage.putMedia(`${prefix}a.thumb.webp`, Buffer.alloc(40, 3), 'image/webp');
    await storage.putMedia(`tenants/${randomUUID()}/other.webp`, Buffer.alloc(10, 4), 'image/webp');
    const listed = await storage.listMedia(prefix);
    expect(listed.sort((x, y) => x.key.localeCompare(y.key))).toEqual([
      { key: `${prefix}a.thumb.webp`, bytes: 40 },
      { key: `${prefix}a.webp`, bytes: 300 },
    ]);
    await storage.deleteMedia(listed.map((object) => object.key));
    expect(await storage.listMedia(prefix)).toEqual([]);
    expect(storage.publicUrl(`${prefix}a.webp`)).toBe(`https://media.example.test/${prefix}a.webp`);
  });
});
