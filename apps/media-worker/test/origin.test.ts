import { describe, expect, it } from 'vitest';
import { S3Origin, StoreUnavailable } from '../src/origin';
import { SHOP } from './fakes';

const SETTINGS = {
  endpoint: 'https://account.r2.example.test/',
  bucket: 'lytro-media',
  accessKeyId: 'read-only-key',
  secretAccessKey: 'read-only-secret',
};
const KEY = `tenants/${SHOP}/m1/abc.webp`;

/** Answers every read with this response, keeping what was asked. */
function answering(response: () => Response): {
  asked: Request[];
  fetcher: (r: Request) => Promise<Response>;
} {
  const asked: Request[] = [];
  return {
    asked,
    fetcher: (request) => {
      asked.push(request);
      return Promise.resolve(response());
    },
  };
}

// MED-02, MED-07: R2 read through its S3 API with a read-only key.
describe('reading the store (MED-07)', () => {
  it('signs each read with the read-only key, asking for a range as such, and passes on only what is needed', async () => {
    const store = answering(
      () =>
        new Response('part', {
          status: 206,
          headers: {
            'content-type': 'image/webp',
            'content-length': '4',
            'content-range': 'bytes 0-3/100',
            etag: '"e"',
            'x-amz-request-id': 'r',
          },
        }),
    );
    const file = await new S3Origin(SETTINGS, store.fetcher).get(KEY, 'bytes=0-3');
    const [request] = store.asked;
    expect(request?.url).toBe(`https://account.r2.example.test/lytro-media/${KEY}`);
    expect(request?.method).toBe('GET');
    expect(request?.headers.get('range')).toBe('bytes=0-3');
    expect(request?.headers.get('authorization')).toMatch(
      /^AWS4-HMAC-SHA256 Credential=read-only-key\/\d{8}\/auto\/s3\/aws4_request/,
    );
    expect(file?.status).toBe(206);
    expect(Object.fromEntries(file?.headers ?? [])).toEqual({
      'accept-ranges': 'bytes',
      'content-type': 'image/webp',
      'content-length': '4',
      'content-range': 'bytes 0-3/100',
      etag: '"e"',
    });
    expect(await file?.text()).toBe('part');
  });

  it('answers no file for a missing object, and the store unavailable for anything else', async () => {
    expect(
      await new S3Origin(
        SETTINGS,
        answering(() => new Response(null, { status: 404 })).fetcher,
      ).get(KEY, null),
    ).toBeNull();
    await expect(
      new S3Origin(SETTINGS, answering(() => new Response(null, { status: 500 })).fetcher).get(
        KEY,
        null,
      ),
    ).rejects.toBeInstanceOf(StoreUnavailable);
    await expect(
      new S3Origin(SETTINGS, () => Promise.reject(new Error('no route'))).get(KEY, null),
    ).rejects.toBeInstanceOf(StoreUnavailable);
  });
});
