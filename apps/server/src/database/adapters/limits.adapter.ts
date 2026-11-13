import { Inject, Injectable } from '@nestjs/common';
import {
  LeaseRepository,
  LimitEventRepository,
  ServiceStateRepository,
  TransactionRunner,
  type ExactVerdict,
  type Transaction,
} from '@lytronix/db';
import type { LimitsDatabase } from '../../modules/shared/limits/ports/limits-database';
import { DatabaseService } from '../database.service';

/** RED-05, RED-11, D9-15 (Slice 9.4): Lytro's own tables (migration 0130), outside any shop's row-level security. */
@Injectable()
export class DrizzleLimitsDatabase implements LimitsDatabase {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(LimitEventRepository) private readonly events: LimitEventRepository,
    @Inject(LeaseRepository) private readonly leases: LeaseRepository,
    @Inject(ServiceStateRepository) private readonly states: ServiceStateRepository,
  ) {}

  private get db() {
    return this.database.handle.db;
  }

  exact(
    bucket: string,
    limit: number,
    windowMs: number,
    now: Date,
    count: boolean,
    tx?: Transaction,
  ): Promise<ExactVerdict> {
    if (tx) return this.events.take(tx, bucket, limit, windowMs, now, count);
    return this.transactions.run(this.db, (own) =>
      this.events.take(own, bucket, limit, windowMs, now, count),
    );
  }

  acquireLease(
    key: string,
    holder: string,
    until: Date,
    now: Date,
    tx?: Transaction,
  ): Promise<boolean> {
    return this.leases.acquire(tx ?? this.db, key, holder, until, now);
  }

  releaseLease(key: string, holder: string): Promise<void> {
    return this.leases.release(this.db, key, holder);
  }

  purgeLapsedLeases(before: Date): Promise<number> {
    return this.leases.purgeLapsed(this.db, before);
  }

  purgeLimitEvents(before: Date): Promise<number> {
    return this.events.purgeBefore(this.db, before);
  }

  markDown(service: string, now: Date): Promise<boolean> {
    return this.transactions.run(this.db, (tx) => this.states.markDown(tx, service, now));
  }

  markUp(service: string, now: Date): Promise<Date | null> {
    return this.transactions.run(this.db, (tx) => this.states.markUp(tx, service, now));
  }
}
