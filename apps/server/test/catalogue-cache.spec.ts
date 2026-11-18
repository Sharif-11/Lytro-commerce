import { PublicProductSort } from '@lytronix/validators';
import { describe, expect, it } from 'vitest';
import { CatalogueCache } from '../src/modules/public-api/services/catalogue-cache';
import {
  cursorOf,
  listRequestOf,
  positionOf,
} from '../src/modules/public-api/services/catalogue-query';

// CCH-03, CCH-05, CCH-06, CCH-11: the public catalogue's memory cache and how its list requests and cursors are read.
const KB = 1024;

function cacheOf(maxBytes: number): CatalogueCache {
  return new CatalogueCache({ maxBytes, maxEntryBytes: maxBytes, versionMs: 1 });
}

describe('the catalogue memory cache (CCH-05, CCH-06)', () => {
  it('never holds more than its cap, and lets the least recently used go first', async () => {
    const cache = cacheOf(10 * KB);
    const answer = { text: 'x'.repeat(KB) };
    await cache.get('first', 30_000, () => Promise.resolve(answer));
    for (let index = 0; index < 20; index += 1) {
      await cache.get(`entry-${String(index)}`, 30_000, () => Promise.resolve(answer));
      // Keeps the first one recently used, so it outlasts every other.
      await cache.get('first', 30_000, () => Promise.reject(new Error('should be kept')));
    }
    const { entries, bytes } = cache.size();
    expect(bytes).toBeLessThanOrEqual(10 * KB);
    expect(entries).toBeLessThan(21);
    let rebuilt = false;
    await cache.get('entry-0', 30_000, () => {
      rebuilt = true;
      return Promise.resolve(answer);
    });
    expect(rebuilt).toBe(true);
  });

  it('builds once for requests that miss together, and keeps no failed build', async () => {
    const cache = cacheOf(100 * KB);
    let builds = 0;
    const build = async () => {
      builds += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { builds };
    };
    const answers = await Promise.all(
      Array.from({ length: 50 }, () => cache.get('same', 30_000, build)),
    );
    expect(builds).toBe(1);
    expect(new Set(answers.map((answer) => answer.builds))).toEqual(new Set([1]));

    await expect(
      cache.get('failing', 30_000, () => Promise.reject(new Error('not found'))),
    ).rejects.toThrow('not found');
    expect(await cache.get('failing', 30_000, () => Promise.resolve('built'))).toBe('built');
  });

  it('answers with, but never keeps, one answer over the largest kept (a big feed, FED-04)', async () => {
    const cache = new CatalogueCache({ maxBytes: 100 * KB, maxEntryBytes: 2 * KB, versionMs: 1 });
    let builds = 0;
    const build = () => {
      builds += 1;
      return Promise.resolve('x'.repeat(5 * KB));
    };
    expect(await cache.get('feed', 30_000, build)).toHaveLength(5 * KB);
    expect(await cache.get('feed', 30_000, build)).toHaveLength(5 * KB);
    expect(builds).toBe(2);
    expect(cache.size().entries).toBe(0);
  });

  it('keeps an answer no longer than its lifetime', async () => {
    const cache = cacheOf(100 * KB);
    await cache.get('short', 10, () => Promise.resolve('old'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(await cache.get('short', 10, () => Promise.resolve('new'))).toBe('new');
  });
});

describe('public list requests (CCH-03, CCH-11)', () => {
  it('names the same request the same way, however it was written', () => {
    expect(listRequestOf({ search: '  Cotton   PANJABI ', limit: 24 })).toEqual({
      category: null,
      search: 'cotton panjabi',
      sort: PublicProductSort.Relevance,
      inStock: false,
      onSale: false,
      designs: false,
      ids: null,
      cursor: null,
      limit: 24,
    });
    // DC-1: design cards only when asked.
    expect(listRequestOf({ designs: true, limit: 24 }).designs).toBe(true);
    expect(listRequestOf({ inStock: true, limit: 24 }).inStock).toBe(true);
    // SB-9: a picked row is one page of exactly its products, whatever cursor or limit came with it.
    const picked = ['0b9f6a3e-6f3c-4f7e-9d2a-1c2b3d4e5f60', '1c2b3d4e-5f60-4718-8293-a4b5c6d7e8f9'];
    expect(listRequestOf({ productIds: picked, cursor: 'x', limit: 24 })).toMatchObject({
      ids: picked,
      cursor: null,
      limit: 2,
    });
    expect(listRequestOf({ limit: 24, v: '3.1' }).sort).toBe(PublicProductSort.Featured);
    expect(listRequestOf({ sort: PublicProductSort.Relevance, limit: 24 }).sort).toBe(
      PublicProductSort.Featured,
    );
    expect(listRequestOf({ category: 'Shirts', limit: 5 }).category).toBe('shirts');
  });

  it("reads a cursor back only for its own order and with each position's form", () => {
    const id = '0b9f6a3e-6f3c-4f7e-9d2a-1c2b3d4e5f60';
    const time = '2026-10-21 10:00:00.123456+00';
    // DC-7: featured starts with whether the card is placed and where; DC-1: every order ends with the design's number.
    const featured = ['0', '-3', time, id, '-2'];
    const cursor = cursorOf(PublicProductSort.Featured, featured);
    expect(positionOf(PublicProductSort.Featured, cursor)).toEqual(featured);
    expect(positionOf(PublicProductSort.Newest, cursor)).toBeNull();
    // A cursor from before design cards (no design number) starts over rather than being misread.
    expect(
      positionOf(PublicProductSort.Featured, cursorOf(PublicProductSort.Featured, ['0', time, id])),
    ).toBeNull();
    expect(
      positionOf(
        PublicProductSort.PriceLow,
        cursorOf(PublicProductSort.PriceLow, ['150.00', id, '1']),
      ),
    ).toEqual(['150.00', id, '1']);
    expect(
      positionOf(
        PublicProductSort.Relevance,
        cursorOf(PublicProductSort.Relevance, ['1.2e-05', id, '0']),
      ),
    ).toEqual(['1.2e-05', id, '0']);
    expect(
      positionOf(
        PublicProductSort.Newest,
        cursorOf(PublicProductSort.Newest, ["'; DROP", id, '0']),
      ),
    ).toBeNull();
    expect(positionOf(PublicProductSort.Newest, 'not-a-cursor')).toBeNull();
  });
});
