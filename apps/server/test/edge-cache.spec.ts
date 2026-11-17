import { describe, expect, it } from 'vitest';
import type { Transaction } from '@lytronix/db';
import { QueueName } from '@lytronix/validators';
import type { MediaStorage } from '../src/modules/media/ports/media-storage';
import { MediaDeleter } from '../src/modules/media/services/media-deleter';
import {
  CacheUnavailable,
  type EdgeCache,
} from '../src/modules/shared/edge-cache/ports/edge-cache';
import { CloudflareEdgeCache } from '../src/modules/shared/edge-cache/providers/cloudflare-edge-cache';
import {
  EdgePurgeRunner,
  PURGE_SETTLE_MS,
  PURGE_SPACING_MS,
  type PurgeTiming,
} from '../src/modules/shared/edge-cache/services/edge-purge-runner';
import { EdgePurges } from '../src/modules/shared/edge-cache/services/edge-purges';
import type { EdgePurgeJob } from '../src/modules/shared/edge-cache/types/edge-purge-job';
import type { JobQueue } from '../src/modules/shared/queue/ports/job-queue';

// D9-31: public media is served from the media bucket behind Cloudflare's cache, so a lapsed shop's files are dropped
// from that cache once they are deleted from the store (LIF-19); purged by folder, which every plan has.
// D9-32: shops' pages are kept there too, under tags, and dropped by them when what they show changes -- queued in the
// change's own transaction, sent in batches within the Free plan's 5 purges a minute.

const SHOP = 'tenants/0b9f1c1e-2c84-4c1e-9d55-1f0a2b3c4d5e/';
const TX = {} as Transaction;

interface Sent {
  url: string;
  init: RequestInit;
}

function cacheAnswering(
  response: () => Response,
  mediaBaseUrl: string | null = 'https://media.lytro.app/',
): { cache: CloudflareEdgeCache; sent: Sent[] } {
  const sent: Sent[] = [];
  const cache = new CloudflareEdgeCache(
    { zoneId: 'zone-1', apiToken: 'secret-token', mediaBaseUrl },
    (url, init) => {
      sent.push({ url, init });
      return Promise.resolve(response());
    },
  );
  return { cache, sent };
}

const ok = () => Response.json({ success: true, errors: [] });

describe("Cloudflare's cache in front of the media (D9-31)", () => {
  it("purges a shop's folder by prefix, as host and path with no scheme", async () => {
    const { cache, sent } = cacheAnswering(ok);
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
    const { cache, sent } = cacheAnswering(ok, 'https://cdn.example.com/media');
    await cache.purgeFolder(SHOP);
    expect(JSON.parse(sent[0]?.init.body as string)).toEqual({
      prefixes: [`cdn.example.com/media/${SHOP}`],
    });
  });

  it('purges no folder when no media is served through Cloudflare', async () => {
    const { cache, sent } = cacheAnswering(ok, null);
    await cache.purgeFolder(SHOP);
    expect(sent).toHaveLength(0);
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

describe("Cloudflare's cache in front of shops' pages (D9-32)", () => {
  it('purges by tag, the tags as given', async () => {
    const { cache, sent } = cacheAnswering(ok);
    await cache.purgeTags(['s:faiza', 'p:1']);
    expect(sent[0]?.url).toBe('https://api.cloudflare.com/client/v4/zones/zone-1/purge_cache');
    expect(JSON.parse(sent[0]?.init.body as string)).toEqual({ tags: ['s:faiza', 'p:1'] });
  });

  it('sends nothing for no tags, and refuses more than Cloudflare takes at once', async () => {
    const { cache, sent } = cacheAnswering(ok);
    await cache.purgeTags([]);
    expect(sent).toHaveLength(0);
    const many = Array.from({ length: 101 }, (_, index) => `p:${String(index)}`);
    await expect(cache.purgeTags(many)).rejects.toThrow('at most 100 tags');
    expect(sent).toHaveLength(0);
  });

  it("reports a refused tag purge by its status and codes, as Cloudflare's purge rate refuses it", async () => {
    const { cache } = cacheAnswering(() =>
      Response.json({ success: false, errors: [{ code: 1134 }] }, { status: 429 }),
    );
    await expect(cache.purgeTags(['s:faiza'])).rejects.toThrow(
      'Cloudflare answered 429 (codes 1134)',
    );
  });
});

describe("the deletion job and Cloudflare's cache (LIF-19, D9-31)", () => {
  function deleter(purge: EdgeCache['purgeFolder'] = () => Promise.resolve()) {
    const steps: string[] = [];
    const storage = {
      listMedia: (prefix: string) =>
        Promise.resolve([{ key: `${prefix}a.webp` }, { key: `${prefix}b.mp4` }]),
      deleteMedia: (keys: string[]) => {
        steps.push(`delete ${String(keys.length)}`);
        return Promise.resolve();
      },
    } as unknown as MediaStorage;
    const cache: Pick<EdgeCache, 'purgeFolder'> = {
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

describe('a batch of queued purges (D9-32)', () => {
  function runner(
    now: number,
    purge: (tags: readonly string[]) => Promise<void> = () => Promise.resolve(),
  ) {
    const steps: string[] = [];
    let clock = now;
    const timing: PurgeTiming = {
      now: () => clock,
      sleep: (ms) => {
        steps.push(`wait ${String(ms)}`);
        clock += ms;
        return Promise.resolve();
      },
    };
    const cache = {
      purgeTags: (tags: readonly string[]) => {
        steps.push(`purge ${String(tags.length)}: ${tags.slice(0, 3).join(' ')}`);
        return purge(tags);
      },
    };
    return { run: new EdgePurgeRunner(cache, timing), steps };
  }

  const job = (at: number, ...tags: string[]): EdgePurgeJob => ({ tags, at });

  it('waits until the newest change has settled, then sends each tag once', async () => {
    const { run, steps } = runner(10_000);
    await run.run([job(9_000, 's:a', 'p:1'), job(10_000, 'p:1', 'l:a')]);
    expect(steps).toEqual([`wait ${String(PURGE_SETTLE_MS)}`, 'purge 3: s:a p:1 l:a']);
  });

  it('does not wait for changes settled already', async () => {
    const { run, steps } = runner(100_000);
    await run.run([job(1_000, 's:a')]);
    expect(steps).toEqual(['purge 1: s:a']);
  });

  it('sends at most 100 tags a request, 12 seconds apart, within the purge rate', async () => {
    const { run, steps } = runner(100_000);
    const tags = Array.from({ length: 230 }, (_, index) => `p:${String(index)}`);
    await run.run([job(1_000, ...tags.slice(0, 120)), job(1_000, ...tags.slice(100))]);
    expect(steps).toEqual([
      'purge 100: p:0 p:1 p:2',
      `wait ${String(PURGE_SPACING_MS)}`,
      'purge 100: p:100 p:101 p:102',
      `wait ${String(PURGE_SPACING_MS)}`,
      'purge 30: p:200 p:201 p:202',
    ]);
  });

  it('fails the batch when Cloudflare refuses, so it is tried again', async () => {
    const { run } = runner(100_000, () => Promise.reject(new CacheUnavailable('429')));
    await expect(run.run([job(1_000, 's:a')])).rejects.toBeInstanceOf(CacheUnavailable);
  });

  it('does nothing for no jobs', async () => {
    const { run, steps } = runner(100_000);
    await run.run([]);
    expect(steps).toEqual([]);
  });
});

describe("queuing a purge in the change's own transaction (D9-32)", () => {
  function purges(slug: string | null = 'faiza') {
    const queued: { tx: Transaction; name: QueueName; job: EdgePurgeJob }[] = [];
    const jobs: JobQueue = {
      enqueue: (tx, name, payload) => {
        queued.push({ tx, name, job: payload as EdgePurgeJob });
        return Promise.resolve();
      },
    };
    const store = {
      run: <T>(work: (tx: Transaction) => Promise<T>) => work(TX),
      slugOf: () => Promise.resolve(slug),
    };
    return { edge: new EdgePurges(jobs, store), queued };
  }

  it("names one product's pages by its id", async () => {
    const { edge, queued } = purges();
    await edge.products(TX, 'shop-1', ['prod-1', 'prod-1', 'prod-2']);
    expect(queued).toHaveLength(1);
    expect(queued[0]?.tx).toBe(TX);
    expect(queued[0]?.name).toBe(QueueName.EdgePurge);
    expect(queued[0]?.job.tags).toEqual(['p:prod-1', 'p:prod-2']);
    expect(typeof queued[0]?.job.at).toBe('number');
  });

  it("names a shop's lists by its slug, with the products moved", async () => {
    const { edge, queued } = purges();
    await edge.listing(TX, 'shop-1', ['prod-1']);
    expect(queued[0]?.job.tags).toEqual(['l:faiza', 'p:prod-1']);
  });

  it("names a shop's every page by its slug, and every shop's by one tag", async () => {
    const { edge, queued } = purges();
    await edge.shop(TX, 'shop-1');
    await edge.everything(TX);
    expect(queued.map((each) => each.job.tags)).toEqual([['s:faiza'], ['lytro']]);
  });

  it('queues nothing for no products, or a shop not found', async () => {
    const { edge, queued } = purges(null);
    await edge.products(TX, 'shop-1', []);
    await edge.shop(TX, 'shop-1');
    expect(queued).toHaveLength(0);
  });

  it("queues a committed change's purge in a transaction of its own, never failing the change", async () => {
    const { edge, queued } = purges();
    await edge.shopLater('shop-1');
    expect(queued[0]?.job.tags).toEqual(['s:faiza']);

    const failing = new EdgePurges(
      { enqueue: () => Promise.reject(new Error('database away')) },
      { run: (work) => work(TX), slugOf: () => Promise.resolve('faiza') },
    );
    await expect(failing.shopLater('shop-1')).resolves.toBeUndefined();
  });
});
