import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import type { LimitsDatabase } from '../ports/limits-database';
import { LIMITS_DATABASE } from '../tokens';

// How often a process waiting its turn checks again (inTurn).
const TURN_CHECK_MS = 500;

/** What `hold` gives back: the work's result, or that another process holds the name. */
export type Held<T> = { held: true; value: T } | { held: false };

/**
 * §107, §119, D9-15 (Slice 9.4): a short claim on a name, shared by every API copy and server, for what one process
 * alone used to guard in its memory: a payment's start while a second tap waits, a gateway token while one process
 * fetches it, a once-a-day notice. A lease lapses by itself, so a crashed holder blocks for no longer than it.
 */
@Injectable()
export class Leases {
  /** This process, as a lease's holder. */
  private readonly holder = `${hostname()}:${String(process.pid)}:${randomUUID().slice(0, 8)}`;

  constructor(@Inject(LIMITS_DATABASE) private readonly database: LimitsDatabase) {}

  /** Takes the name for `ms` if it's free or lapsed. True if this process holds it now. */
  acquire(key: string, ms: number, now: Date, tx?: Transaction): Promise<boolean> {
    return this.database.acquireLease(key, this.holder, new Date(now.getTime() + ms), now, tx);
  }

  /**
   * At most once in `ms` across every process: true for the first claim only, never again for the same process until
   * it lapses (a once-a-day notice). In the caller's transaction when given one, so a rollback leaves it unclaimed.
   */
  once(key: string, ms: number, now: Date, tx?: Transaction): Promise<boolean> {
    return this.database.acquireLease(key, randomUUID(), new Date(now.getTime() + ms), now, tx);
  }

  release(key: string): Promise<void> {
    return this.database.releaseLease(key, this.holder);
  }

  /** The nightly purge: leases lapsed before a moment, left by a process that stopped while holding one. */
  purgeLapsed(before: Date): Promise<number> {
    return this.database.purgeLapsedLeases(before);
  }

  /**
   * Runs the work in turn with every other process doing the same under this name: when another holds it, waits for it
   * to give it back (checking every half second) and then runs, up to `waitMs`; `held: false` if the turn never came.
   * A payment's start (§119): the second tap runs after the first, and finds the payment the first one made.
   */
  async inTurn<T>(
    key: string,
    leaseMs: number,
    waitMs: number,
    work: () => Promise<T>,
  ): Promise<Held<T>> {
    const deadline = Date.now() + waitMs;
    for (;;) {
      const turn = await this.hold(key, leaseMs, work);
      if (turn.held || Date.now() >= deadline) return turn;
      await new Promise((resolve) => setTimeout(resolve, TURN_CHECK_MS));
    }
  }

  /** Runs the work while holding the name, then gives it back; `held: false` if another process holds it. */
  async hold<T>(key: string, ms: number, work: () => Promise<T>): Promise<Held<T>> {
    if (!(await this.acquire(key, ms, new Date()))) return { held: false };
    try {
      return { held: true, value: await work() };
    } finally {
      await this.release(key);
    }
  }
}
