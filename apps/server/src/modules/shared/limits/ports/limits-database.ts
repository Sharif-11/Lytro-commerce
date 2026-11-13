import type { ExactVerdict, Transaction } from '@lytronix/db';

/** The limits' tables (migration 0130): exact windows, leases, and a shared service's outage (Slice 9.4). */
export interface LimitsDatabase {
  /**
   * RED-11: an exact window in PostgreSQL. In the caller's transaction when given one (a payment session counted with
   * its order, so a rolled-back order counts nothing), else in a short one of its own.
   */
  exact(
    bucket: string,
    limit: number,
    windowMs: number,
    now: Date,
    count: boolean,
    tx?: Transaction,
  ): Promise<ExactVerdict>;
  /** Takes a lease if it's free or lapsed; in the caller's transaction when given one, so a rollback frees it. */
  acquireLease(
    key: string,
    holder: string,
    until: Date,
    now: Date,
    tx?: Transaction,
  ): Promise<boolean>;
  releaseLease(key: string, holder: string): Promise<void>;
  purgeLapsedLeases(before: Date): Promise<number>;
  /** The exact windows' rows older than a moment, for buckets nobody checks again. */
  purgeLimitEvents(before: Date): Promise<number>;
  /** RED-05: true only for the call that started the outage. */
  markDown(service: string, now: Date): Promise<boolean>;
  /** RED-05: when the outage began, only for the call that ended it. */
  markUp(service: string, now: Date): Promise<Date | null>;
}
