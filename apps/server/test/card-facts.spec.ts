import type { Transaction } from '@lytronix/db';
import { STOREFRONT_BEST_SELLER_BADGES, STOREFRONT_BEST_SELLER_DAYS } from '@lytronix/validators';
import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../src/common/time';
import type { CardFactsStore } from '../src/modules/public-api/ports/card-facts-store';
import { CardFacts } from '../src/modules/public-api/services/card-facts';

// SB-10 (the owner, 2026-11-20): the minute pass over the shops' kept card facts, without a database. The SQL that
// decides a shop is due, and works its facts out, is proven against a real database in card-facts.e2e.spec.ts.

const NOW = new Date('2026-11-20T06:00:00Z');
const TX = {} as Transaction;

class FakeStore implements CardFactsStore {
  readonly refreshed: { tenantId: string; since: Date; top: number }[] = [];
  constructor(
    private readonly shops: string[],
    private readonly dueShops: Set<string>,
    private readonly failing: Set<string> = new Set(),
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return work(TX);
  }

  listShopIds(): Promise<string[]> {
    return Promise.resolve(this.shops);
  }

  due(_tx: Transaction, tenantId: string): Promise<boolean> {
    return Promise.resolve(this.dueShops.has(tenantId));
  }

  refresh(_tx: Transaction, tenantId: string, since: Date, top: number): Promise<number> {
    if (this.failing.has(tenantId)) return Promise.reject(new Error('lost the connection'));
    this.refreshed.push({ tenantId, since, top });
    return Promise.resolve(3);
  }
}

describe('the card facts pass (SB-10)', () => {
  it('works out only the shops that are due, over the best sellers window and number', async () => {
    const store = new FakeStore(['a', 'b', 'c'], new Set(['a', 'c']));
    const result = await new CardFacts(store).runTick(NOW);
    expect(result).toEqual({ shops: 3, refreshed: 2, failed: 0 });
    expect(store.refreshed).toEqual([
      {
        tenantId: 'a',
        since: new Date(NOW.getTime() - STOREFRONT_BEST_SELLER_DAYS * DAY_MS),
        top: STOREFRONT_BEST_SELLER_BADGES,
      },
      {
        tenantId: 'c',
        since: new Date(NOW.getTime() - STOREFRONT_BEST_SELLER_DAYS * DAY_MS),
        top: STOREFRONT_BEST_SELLER_BADGES,
      },
    ]);
  });

  it("goes on past one shop's failure, and counts it", async () => {
    const store = new FakeStore(['a', 'b', 'c'], new Set(['a', 'b', 'c']), new Set(['b']));
    const result = await new CardFacts(store).runTick(NOW);
    expect(result).toEqual({ shops: 3, refreshed: 2, failed: 1 });
    expect(store.refreshed.map((run) => run.tenantId)).toEqual(['a', 'c']);
  });

  it('does nothing when no shop is due', async () => {
    const store = new FakeStore(['a', 'b'], new Set());
    expect(await new CardFacts(store).runTick(NOW)).toEqual({
      shops: 2,
      refreshed: 0,
      failed: 0,
    });
    expect(store.refreshed).toEqual([]);
  });
});
