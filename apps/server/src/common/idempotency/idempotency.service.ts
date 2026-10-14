import { Inject, Injectable } from '@nestjs/common';
import { IdempotencyKeysRepository, TransactionRunner } from '@lytronix/db';
import { ApiError } from '../api-error';
import { DatabaseService } from '../../database/database.service';

const TTL_MS = 24 * 60 * 60 * 1000; // API-11: 24 hours
const CONSTRAINT_FRAGMENT = 'idempotency_keys_pkey';

export type IdempotencyBeginResult =
  { replay: false } | { replay: true; status: number; body: unknown };

/**
 * API-11: every write with a cost or side effect accepts an `Idempotency-Key` header. A plain unique insert on
 * `key` is what makes two simultaneous requests with the same key execute the handler exactly once -- the
 * second insert attempt loses the race with a 23505 and is refused outright (`conflict`) rather than making it
 * wait for or poll the first one's result; the first caller's eventual response is what a retried request with
 * the same key replays afterward.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(IdempotencyKeysRepository) private readonly repo: IdempotencyKeysRepository,
  ) {}

  async begin(key: string, path: string, requestHash: string): Promise<IdempotencyBeginResult> {
    const db = this.database.handle.db;
    const existing = await this.repo.findByKey(db, key);
    if (existing) {
      if (existing.expiresAt.getTime() < Date.now()) {
        await this.repo.delete(db, key);
      } else if (existing.requestHash !== requestHash) {
        throw new ApiError('idempotency_conflict', 'IdempotencyKeyConflict', {});
      } else if (existing.responseStatus === null) {
        throw new ApiError('conflict', 'IdempotencyRequestInProgress', {});
      } else {
        return { replay: true, status: existing.responseStatus, body: existing.responseBody };
      }
    }
    try {
      await this.repo.begin(db, key, path, requestHash, new Date(Date.now() + TTL_MS));
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, CONSTRAINT_FRAGMENT)) {
        throw new ApiError('conflict', 'IdempotencyRequestInProgress', {});
      }
      throw error;
    }
    return { replay: false };
  }

  async complete(key: string, status: number, body: unknown): Promise<void> {
    await this.repo.complete(this.database.handle.db, key, status, body);
  }
}
