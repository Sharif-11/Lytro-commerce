import type { Transaction } from '@lytronix/db';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/common/api-error';
import type { CatalogueTransactions } from '../src/modules/catalogue/ports/catalogue-stores';
import { CatalogueWrites } from '../src/modules/catalogue/services/catalogue-writes';

// Slice 9.10 (9.10's shakedown, the owner's yes of 2026-11-17): a shop's catalogue changes wait their turn in memory, one
// connection per shop, each with a short wait for the shop's lock; a shop with too many waiting is told it's busy.

/** Transactions that record what happened, in order. */
function transactions() {
  const events: string[] = [];
  let open = 0;
  let mostOpen = 0;
  const fake: CatalogueTransactions = {
    run: async <T>(work: (tx: Transaction) => Promise<T>): Promise<T> => {
      open += 1;
      mostOpen = Math.max(mostOpen, open);
      try {
        return await work({} as Transaction);
      } finally {
        open -= 1;
      }
    },
    limitLockWait: (_tx: Transaction, milliseconds: number) => {
      events.push(`wait ${String(milliseconds)}`);
      return Promise.resolve();
    },
  };
  return { fake, events, mostOpen: () => mostOpen };
}

/** A change that ends when the test says so. */
function held() {
  let end: () => void = () => undefined;
  const ended = new Promise<void>((resolve) => {
    end = resolve;
  });
  return { ended, end };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('a shop’s catalogue changes (Slice 9.10)', () => {
  it('go one after another in a shop, each limiting its lock wait, and hold one connection at a time', async () => {
    const { fake, events, mostOpen } = transactions();
    const writes = new CatalogueWrites(fake, { mostWaiting: 20, lockWaitMs: 2_000 });
    const first = held();
    const one = writes.run('shop-a', async () => {
      events.push('one starts');
      await first.ended;
      events.push('one ends');
    });
    const two = writes.run('shop-a', () => {
      events.push('two runs');
      return Promise.resolve();
    });
    await tick();
    expect(events).toEqual(['wait 2000', 'one starts']);
    first.end();
    await Promise.all([one, two]);
    expect(events).toEqual(['wait 2000', 'one starts', 'one ends', 'wait 2000', 'two runs']);
    expect(mostOpen()).toBe(1);
    expect(writes.shopsInLine).toBe(0);
  });

  it("never makes another shop's change wait", async () => {
    const { fake, events } = transactions();
    const writes = new CatalogueWrites(fake, { mostWaiting: 20, lockWaitMs: 2_000 });
    const first = held();
    const a = writes.run('shop-a', () => first.ended);
    const b = writes.run('shop-b', () => {
      events.push('b runs');
      return Promise.resolve();
    });
    await b;
    expect(events).toContain('b runs');
    first.end();
    await a;
  });

  it('a change that fails leaves the next to run, and gives its own error back', async () => {
    const { fake } = transactions();
    const writes = new CatalogueWrites(fake, { mostWaiting: 20, lockWaitMs: 2_000 });
    const failing = writes.run('shop-a', () => Promise.reject(new Error('refused')));
    const next = writes.run('shop-a', () => Promise.resolve('saved'));
    await expect(failing).rejects.toThrow('refused');
    await expect(next).resolves.toBe('saved');
    expect(writes.shopsInLine).toBe(0);
  });

  it('tells a shop with too many changes waiting that the server is busy, and takes it again once they end', async () => {
    const { fake } = transactions();
    const writes = new CatalogueWrites(fake, { mostWaiting: 2, lockWaitMs: 2_000 });
    const first = held();
    const waiting = [
      writes.run('shop-a', () => first.ended),
      writes.run('shop-a', () => first.ended),
    ];
    const refused = writes.run('shop-a', () => Promise.resolve());
    await expect(refused).rejects.toBeInstanceOf(ApiError);
    await expect(refused).rejects.toMatchObject({
      code: 'service_unavailable',
      messageKey: 'ServerBusy',
      retryAfterSeconds: 5,
    });
    first.end();
    await Promise.all(waiting);
    await expect(writes.run('shop-a', () => Promise.resolve('saved'))).resolves.toBe('saved');
  });
});
