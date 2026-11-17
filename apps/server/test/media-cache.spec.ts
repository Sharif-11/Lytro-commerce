import { describe, expect, it } from 'vitest';
import type { MediaCache } from '../src/modules/media/ports/media-cache';
import { CacheUnavailable } from '../src/modules/media/ports/media-cache';
import type { MediaStorage } from '../src/modules/media/ports/media-storage';
import { CloudflareMediaCache } from '../src/modules/media/providers/cloudflare-media-cache';
import { MediaDeleter } from '../src/modules/media/services/media-deleter';

// D9-31: public media is served from the media bucket behind Cloudflare's cache, so a lapsed shop's files are dropped
// from that cache once they are deleted from the store (LIF-19); purged by folder, which every plan has.

const SHOP = 'tenants/0b9f1c1e-2c84-4c1e-9d55-1f0a2b3c4d5e/';

interface Sent {
  url: string;
  init: RequestInit;
}

function cacheAnswering(response: () => Response): { cache: CloudflareMediaCache; sent: Sent[] } {
  const sent: Sent[] = [];
  const cache = new CloudflareMediaCache(
    { zoneId: 'zone-1', apiToken: 'secret-token', mediaBaseUrl: 'https://media.lytro.app/' },
    (url, init) => {
      sent.push({ url, init });
      return Promise.resolve(response());
    },
  );
  return { cache, sent };
}

describe("Cloudflare's cache in front of the media (D9-31)", () => {
  it("purges a shop's folder by prefix, as host and path with no scheme", async () => {
    const { cache, sent } = cacheAnswering(() => Response.json({ success: true, errors: [] }));
    await cache.purgeFolder(SHOP);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe('https://api.cloudflare.com/client/v4/zones/zone-1/purge_cache');
    expect(sent[0]?.init.method).toBe('POST');
    expect(sent[0]?.init.headers).toMatchObject({ authorization: 'Bearer secret-token' });
    expect(JSON.parse(sent[0]?.init.body as string)).toEqual({
      prefixes: [`media.lytro.app/${SHOP}`],
    });
  });

  it("keeps a media address's own path in the prefix", async () => {
    const sent: Sent[] = [];
    const cache = new CloudflareMediaCache(
      { zoneId: 'z', apiToken: 't', mediaBaseUrl: 'https://cdn.example.com/media' },
      (url, init) => {
        sent.push({ url, init });
        return Promise.resolve(Response.json({ success: true }));
      },
    );
    await cache.purgeFolder(SHOP);
    expect(JSON.parse(sent[0]?.init.body as string)).toEqual({
      prefixes: [`cdn.example.com/media/${SHOP}`],
    });
  });

  it("reports a refusal by its status and Cloudflare's codes, never its words", async () => {
    const { cache } = cacheAnswering(() =>
      Response.json(
        { success: false, errors: [{ code: 1134, message: 'rate limited for secret-token' }] },
        { status: 429 },
      ),
    );
    const refused = cache.purgeFolder(SHOP);
    await expect(refused).rejects.toBeInstanceOf(CacheUnavailable);
    await expect(refused).rejects.toThrow('Cloudflare answered 429 (codes 1134)');
    await expect(refused).rejects.not.toThrow(/secret-token|rate limited/);
  });

  it('treats an answer of 200 that says it failed as a failure', async () => {
    const { cache } = cacheAnswering(() =>
      Response.json({ success: false, errors: [{ code: 7 }] }),
    );
    await expect(cache.purgeFolder(SHOP)).rejects.toThrow('Cloudflare answered 200 (codes 7)');
  });
});

describe("the deletion job and Cloudflare's cache (LIF-19, D9-31)", () => {
  function deleter(purge: MediaCache['purgeFolder'] = () => Promise.resolve()) {
    const steps: string[] = [];
    const storage = {
      listMedia: (prefix: string) =>
        Promise.resolve([{ key: `${prefix}a.webp` }, { key: `${prefix}b.mp4` }]),
      deleteMedia: (keys: string[]) => {
        steps.push(`delete ${String(keys.length)}`);
        return Promise.resolve();
      },
    } as unknown as MediaStorage;
    const cache: MediaCache = {
      purgeFolder: (prefix) => {
        steps.push(`purge ${prefix}`);
        return purge(prefix);
      },
    };
    return { job: new MediaDeleter(storage, cache), steps };
  }

  it("drops a lapsed shop's folder from the cache after deleting its files", async () => {
    const { job, steps } = deleter();
    await job.delete({ prefix: SHOP });
    expect(steps).toEqual(['delete 2', `purge ${SHOP}`]);
  });

  it('leaves the cache alone for single files a seller deleted', async () => {
    const { job, steps } = deleter();
    await job.delete({ keys: [`${SHOP}x/1.webp`] });
    expect(steps).toEqual(['delete 1']);
  });

  it('fails the job when the purge fails, so it runs again', async () => {
    const { job } = deleter(() => Promise.reject(new CacheUnavailable('away')));
    await expect(job.delete({ prefix: SHOP })).rejects.toBeInstanceOf(CacheUnavailable);
  });
});
