import { describe, expect, it } from 'vitest';
import { ProductListBatch } from '../src/lib/api/product-list-batch';
import type { ProductPage, ProductQuery } from '../src/lib/api/storefront-api';

const pageOf = (name: string): ProductPage => ({ products: [], nextCursor: name });

/** A stand-in for the server: answers each list with a page named by its order, and records every call. */
function server(answer?: (queries: ProductQuery[]) => Promise<(ProductPage | null)[]>) {
  const calls: ProductQuery[][] = [];
  const ask = (queries: ProductQuery[]): Promise<(ProductPage | null)[]> => {
    calls.push(queries);
    return answer
      ? answer(queries)
      : Promise.resolve(queries.map((query) => pageOf(query.sort ?? query.category ?? '')));
  };
  return { calls, ask };
}

describe('ProductListBatch (load fix 3)', () => {
  it("asks for a designed home's rows, heroes and tiles in one call: nine lists, one request", async () => {
    const fake = server();
    const lists = new ProductListBatch(fake.ask);
    // Before load fix 3 each of these was its own request to the server.
    const asked: ProductQuery[] = [
      { sort: 'best_selling', inStock: true },
      { sort: 'newest', inStock: true },
      { sort: 'discount', onSale: true, inStock: true },
      { category: 'panjabi', inStock: true },
      { category: 'saree', inStock: true },
      { category: 'perfume', inStock: true },
      { sort: 'featured', limit: 1 },
      { category: 'new-in' },
      { category: 'offers' },
    ];
    const pages = await Promise.all(asked.map((query) => lists.read(query)));
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toEqual(asked);
    expect(pages.map((page) => page?.nextCursor)).toEqual([
      'best_selling',
      'newest',
      'discount',
      'panjabi',
      'saree',
      'perfume',
      'featured',
      'new-in',
      'offers',
    ]);
  });

  it('asks for the same list once, however many sections draw it', async () => {
    const fake = server();
    const lists = new ProductListBatch(fake.ask);
    const [a, b] = await Promise.all([
      lists.read({ sort: 'newest', limit: 4 }),
      lists.read({ limit: 4, sort: 'newest' }),
    ]);
    expect(a).toBe(b);
    expect(fake.calls).toEqual([[{ sort: 'newest', limit: 4 }]]);
  });

  it('joins a list asked a few steps later in the same turn, and sends what is asked after an answer in a second call', async () => {
    const fake = server();
    const lists = new ProductListBatch(fake.ask);
    const later = (async () => {
      await Promise.resolve();
      await Promise.resolve();
      return lists.read({ category: 'late' });
    })();
    const first = await lists.read({ sort: 'newest' });
    await later;
    expect(fake.calls).toEqual([[{ sort: 'newest' }, { category: 'late' }]]);
    // An empty hero's newest, asked once its own list has answered.
    await lists.read(first === null ? { sort: 'featured' } : { sort: 'featured', limit: 1 });
    expect(fake.calls).toHaveLength(2);
  });

  it('passes a hidden category on as null, and a refusal on to every list of its call', async () => {
    const hidden = new ProductListBatch(
      server((queries) => Promise.resolve(queries.map(() => null))).ask,
    );
    expect(await hidden.read({ category: 'gone' })).toBeNull();

    const busy = new Error('busy');
    const refused = new ProductListBatch(server(() => Promise.reject(busy)).ask);
    const both = [refused.read({ sort: 'newest' }), refused.read({ sort: 'discount' })];
    await expect(both[0]).rejects.toBe(busy);
    await expect(both[1]).rejects.toBe(busy);
  });
});
