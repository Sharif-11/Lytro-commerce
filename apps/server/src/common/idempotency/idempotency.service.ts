import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  IdempotencyKeysRepository,
  type Executor,
  type IdempotencyScope,
  type Transaction,
} from '@lytronix/db';
import { ApiError } from '../api-error';
import { DatabaseService } from '../../database/database.service';

const TTL_MS = 24 * 60 * 60 * 1000; // API-11: 24 hours

export type IdempotencyBeginResult =
  { replay: false } | { replay: true; status: number; body: unknown };

/** D4-8: one request's key, scoped to its shop and caller, with where it went and the fingerprint of what it sent. */
export interface IdempotencyClaim {
  scope: IdempotencyScope;
  key: string;
  path: string;
  requestHash: string;
}

/** D4-8: who sent a dashboard request -- a staff member, or the owner in their own session. */
export function dashboardCaller(userId: string | null): string {
  return userId === null ? 'owner' : `user:${userId}`;
}

/** API-11: the fingerprint of a request's body, so the same key with other data is told apart. */
export function requestHashOf(body: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(body ?? {}))
    .digest('hex');
}

/**
 * API-11, D4-8: a write with a cost or side effect runs once per key. A key belongs to one shop and one caller. Two
 * ways to use it:
 * - around a route (`begin`, then `complete` or `release`), for the billing routes: a request still running with the
 *   same key is refused outright (`conflict`) rather than waited for, and one that fails gives its key back;
 * - inside the work's own transaction (`claimWithin`, `completeWithin`), for order creation: the reply is stored with
 *   the order, a request with the same key waits for the first and then replays it, and a failed request rolls its key
 *   back with everything else, so a retry runs again.
 * The same key sent with a different body, or to a different route, is `idempotency_conflict`.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(IdempotencyKeysRepository) private readonly repo: IdempotencyKeysRepository,
  ) {}

  begin(claim: IdempotencyClaim, now = new Date()): Promise<IdempotencyBeginResult> {
    return this.claimOn(this.database.handle.db, claim, now);
  }

  async complete(claim: IdempotencyClaim, status: number, body: unknown): Promise<void> {
    await this.repo.complete(this.database.handle.db, claim.scope, claim.key, status, body);
  }

  /** D4-8: the request failed, so its key is given back and a retry runs again. */
  async release(claim: IdempotencyClaim): Promise<void> {
    await this.repo.release(this.database.handle.db, claim.scope, claim.key);
  }

  claimWithin(
    tx: Transaction,
    claim: IdempotencyClaim,
    now = new Date(),
  ): Promise<IdempotencyBeginResult> {
    return this.claimOn(tx, claim, now);
  }

  async completeWithin(
    tx: Transaction,
    claim: IdempotencyClaim,
    status: number,
    body: unknown,
  ): Promise<void> {
    await this.repo.complete(tx, claim.scope, claim.key, status, body);
  }

  private async claimOn(
    executor: Executor,
    claim: IdempotencyClaim,
    now: Date,
  ): Promise<IdempotencyBeginResult> {
    const { scope, key, path, requestHash } = claim;
    await this.repo.deleteExpired(executor, scope, key, now);
    const expiresAt = new Date(now.getTime() + TTL_MS);
    if (await this.repo.claim(executor, scope, key, path, requestHash, expiresAt)) {
      return { replay: false };
    }
    const existing = await this.repo.find(executor, scope, key);
    if (!existing || existing.responseStatus === null) {
      throw new ApiError('conflict', 'IdempotencyRequestInProgress', {});
    }
    if (existing.requestHash !== requestHash || existing.path !== path) {
      throw new ApiError('idempotency_conflict', 'IdempotencyKeyConflict', {});
    }
    return { replay: true, status: existing.responseStatus, body: existing.responseBody };
  }
}
