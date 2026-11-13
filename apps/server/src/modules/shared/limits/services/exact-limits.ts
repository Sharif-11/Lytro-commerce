import { Inject, Injectable } from '@nestjs/common';
import type { ExactVerdict, Transaction } from '@lytronix/db';
import type { LimitsDatabase } from '../ports/limits-database';
import { LIMITS_DATABASE } from '../tokens';

/**
 * RED-11, D9-15 (Slice 9.4): the limits that must be exact however many API copies and servers answer -- a shopper's
 * sign-in codes per address, orders, payment sessions, listener pairing -- counted in PostgreSQL under a lock, so two
 * servers together allow exactly the limit. Redis being down never touches them.
 */
@Injectable()
export class ExactLimits {
  constructor(@Inject(LIMITS_DATABASE) private readonly database: LimitsDatabase) {}

  /** Counts a request if it's under the limit; in the caller's transaction when given one. */
  take(
    bucket: string,
    limit: number,
    windowMs: number,
    now: Date,
    tx?: Transaction,
  ): Promise<ExactVerdict> {
    return this.database.exact(bucket, limit, windowMs, now, true, tx);
  }

  /** What `take` would answer, counting nothing (a limit on failures, checked before the attempt). */
  peek(
    bucket: string,
    limit: number,
    windowMs: number,
    now: Date,
    tx?: Transaction,
  ): Promise<ExactVerdict> {
    return this.database.exact(bucket, limit, windowMs, now, false, tx);
  }

  /** The nightly purge: rows older than every exact window (none is longer than a day). */
  purgeBefore(before: Date): Promise<number> {
    return this.database.purgeLimitEvents(before);
  }
}
