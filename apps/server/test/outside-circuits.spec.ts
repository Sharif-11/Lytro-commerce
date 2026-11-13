import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '../src/common/api-error';
import { BREAKER_FAILURES } from '../src/common/circuit-breaker';
import { StorageUnavailable } from '../src/common/errors/media-refused';
import { R2UsageUnavailable } from '../src/modules/media-costs/ports/r2-usage';
import { CloudflareR2Usage } from '../src/modules/media-costs/providers/cloudflare-r2-usage';
import { EdgeUnavailable } from '../src/modules/media/ports/media-edge';
import { CloudflareMediaEdge } from '../src/modules/media/providers/cloudflare-media-edge';
import { S3MediaStorage } from '../src/modules/media/providers/s3-media-storage';
import { OauthCalls } from '../src/modules/identity/providers/oauth-calls';

// PRF-05, D9-17 (Phase 9 Slice 9.5): the outside calls that had no breaker -- R2, Cloudflare's API, Google and Facebook
// sign-in -- each go through one now. An answer the provider meant (a file not there, a code already used) never opens
// it; five failures in a row do, and then no call goes out.
describe('the new circuits (PRF-05, D9-17)', () => {
  describe('sign-in with Google or Facebook', () => {
    function counting(answer: () => Promise<Response>) {
      let calls = 0;
      const oauth = new OauthCalls('google', undefined, () => {
        calls += 1;
        return answer();
      });
      return { oauth, calls: () => calls };
    }

    it("passes the provider's own answer on, however often, without opening the circuit", async () => {
      const { oauth, calls } = counting(() => Promise.resolve(new Response('{}', { status: 400 })));
      for (let index = 0; index <= BREAKER_FAILURES; index += 1) {
        expect((await oauth.send('https://oauth2.googleapis.com/token')).status).toBe(400);
      }
      expect(calls()).toBe(BREAKER_FAILURES + 1);
    });

    it('refuses with "use your phone" when it fails, and stops calling after five', async () => {
      const { oauth, calls } = counting(() => Promise.resolve(new Response('', { status: 503 })));
      for (let index = 0; index <= BREAKER_FAILURES; index += 1) {
        const refused = await oauth
          .send('https://oauth2.googleapis.com/token')
          .catch((e: unknown) => e);
        expect(refused).toBeInstanceOf(ApiError);
        expect(refused).toMatchObject({ messageKey: 'SignInProviderNotAnswering' });
      }
      expect(calls()).toBe(BREAKER_FAILURES);
    });

    it('counts a lost connection as a failure too, and names the provider that is away', async () => {
      const { oauth } = counting(() => Promise.reject(new TypeError('fetch failed')));
      await expect(oauth.send('https://oauth2.googleapis.com/token')).rejects.toMatchObject({
        messageKey: 'SignInProviderNotAnswering',
      });
      const facebook = new OauthCalls('facebook', undefined, () =>
        Promise.reject(new TypeError('fetch failed')),
      );
      const refused = await facebook
        .send('https://graph.facebook.com/v19.0/me')
        .catch((e: unknown) => e);
      expect((refused as Error).message).toContain('Facebook');
    });
  });

  describe("Cloudflare's API", () => {
    const failing = () => {
      let calls = 0;
      const fetcher = () => {
        calls += 1;
        return Promise.resolve(new Response('busy', { status: 502 }));
      };
      return { fetcher, calls: () => calls };
    };

    it('the edge stops calling after five failures, still answering as Cloudflare being away', async () => {
      const { fetcher, calls } = failing();
      const edge = new CloudflareMediaEdge(
        { accountId: 'a', apiToken: 't', kvNamespaceId: 'k', dataset: 'd' },
        fetcher,
      );
      const write = () => edge.write({ origins: [{ tenantId: 's', origins: [] }] });
      for (let index = 0; index < BREAKER_FAILURES; index += 1) {
        await expect(write()).rejects.toBeInstanceOf(EdgeUnavailable);
      }
      await expect(write()).rejects.toBeInstanceOf(EdgeUnavailable);
      expect(calls()).toBe(BREAKER_FAILURES);
    });

    it("R2's usage stops calling after five failures too", async () => {
      const { fetcher, calls } = failing();
      const usage = new CloudflareR2Usage({ accountId: 'a', apiToken: 't' }, fetcher);
      for (let index = 0; index <= BREAKER_FAILURES; index += 1) {
        await expect(usage.days(['2026-11-12'])).rejects.toBeInstanceOf(R2UsageUnavailable);
      }
      expect(calls()).toBe(BREAKER_FAILURES);
    });
  });

  describe('R2, through the S3 API', () => {
    let server: Server;
    let hits = 0;
    let storage: S3MediaStorage;
    const key = { accessKeyId: 'test', secretAccessKey: 'test' };

    beforeAll(async () => {
      server = createServer((request, response) => {
        hits += 1;
        if ((request.url ?? '').includes('missing')) {
          response.writeHead(404, { 'content-type': 'application/xml' });
          response.end('<Error><Code>NoSuchKey</Code><Message>gone</Message></Error>');
          return;
        }
        response.writeHead(500, { 'content-type': 'application/xml' });
        response.end('<Error><Code>InternalError</Code><Message>down</Message></Error>');
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      storage = new S3MediaStorage({
        endpoint: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
        region: 'auto',
        pathStyle: true,
        uploadsBucket: 'uploads',
        mediaBucket: 'media',
        evidenceBucket: 'evidence',
        signer: key,
        processor: key,
        deleter: key,
      });
    });

    afterAll(async () => {
      await new Promise((resolve) => server.close(resolve));
    });

    it('a file that is not there is an answer: the circuit never opens for it', async () => {
      for (let index = 0; index <= BREAKER_FAILURES; index += 1) {
        expect(await storage.readUpload('missing-photo')).toBeNull();
      }
    });

    it("the store failing five times stops that bucket's calls, not the others'", async () => {
      for (let index = 0; index < BREAKER_FAILURES; index += 1) {
        await expect(storage.readMedia('broken')).rejects.toBeInstanceOf(StorageUnavailable);
      }
      const before = hits;
      await expect(storage.readMedia('broken')).rejects.toBeInstanceOf(StorageUnavailable);
      expect(hits).toBe(before);
      // The uploads bucket has its own circuit, still closed.
      expect(await storage.readUpload('missing-photo')).toBeNull();
      expect(hits).toBeGreaterThan(before);
    }, 60_000);
  });
});
