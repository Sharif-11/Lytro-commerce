import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { ApiError } from '../../../common/api-error';
import type { CatalogueTransactions } from '../ports/catalogue-stores';
import { CATALOGUE_TRANSACTIONS, CATALOGUE_WRITE_SETTINGS } from '../tokens';

/** How a shop's catalogue changes take their turns (Slice 9.10). */
export interface CatalogueWriteSettings {
  /** The most of one shop's changes waiting in this process; one more is told the server is busy. */
  mostWaiting: number;
  /** How long a change waits for the shop's catalogue lock once its turn comes (another process's change holds it). */
  lockWaitMs: number;
}

export const CATALOGUE_WRITE_DEFAULTS: CatalogueWriteSettings = {
  mostWaiting: 20,
  lockWaitMs: 2_000,
};

// What a busy answer tells the seller to wait, as a busy pool's does.
const BUSY_RETRY_AFTER_SECONDS = 5;

/** One shop's line: the change last in it, and how many are in it. */
interface Line {
  last: Promise<unknown>;
  waiting: number;
}

/**
 * Slice 9.10 (9.10's shakedown, the owner's yes of 2026-11-17): a seller's change to a shop's catalogue. Every such
 * change moves the shop's one catalogue row (its version, PRD-04's lock), so they go one after another; waiting for that
 * row while holding a pooled connection let one shop's burst take every connection this process shares with every other
 * shop. Here a shop's changes wait their turn in this process's memory, so a shop holds at most one connection here at
 * a time, and once its turn comes a change waits at most `lockWaitMs` for the row (another process's change of the same
 * shop) before it gives up and frees its connection. A shop with too many changes waiting is told the server is busy.
 * Orders never come here: a sell-out's stock state is saved in the order's own transaction (CatalogueVersion).
 */
@Injectable()
export class CatalogueWrites {
  private readonly lines = new Map<string, Line>();

  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(CATALOGUE_WRITE_SETTINGS) private readonly settings: CatalogueWriteSettings,
  ) {}

  /** The change, in its own transaction, once the shop's earlier changes in this process are done. */
  async run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    const line = this.lines.get(tenantId) ?? { last: Promise.resolve(), waiting: 0 };
    if (line.waiting >= this.settings.mostWaiting) {
      throw new ApiError('service_unavailable', 'ServerBusy', {}, BUSY_RETRY_AFTER_SECONDS);
    }
    line.waiting += 1;
    this.lines.set(tenantId, line);
    const turn = line.last.then(() =>
      this.transactions.run(async (tx) => {
        await this.transactions.limitLockWait(tx, this.settings.lockWaitMs);
        return work(tx);
      }),
    );
    // The next change waits for this one to end, however it ends.
    line.last = turn.catch(() => undefined);
    try {
      return await turn;
    } finally {
      line.waiting -= 1;
      if (line.waiting === 0 && this.lines.get(tenantId) === line) this.lines.delete(tenantId);
    }
  }

  /** How many shops have changes waiting or running here, for the tests. */
  get shopsInLine(): number {
    return this.lines.size;
  }
}
