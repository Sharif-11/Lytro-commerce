import { and, eq, lt } from 'drizzle-orm';
import { idempotencyKeys, type SelectIdempotencyKey } from '../../schema';
import type { Executor } from '../../transactions';

/** D4-8: whose key it is -- one shop, and one caller in it (`user:<id>` or `key:<id>`). */
export interface IdempotencyScope {
  tenantId: string;
  caller: string;
}

function byKey(scope: IdempotencyScope, key: string) {
  return and(
    eq(idempotencyKeys.tenantId, scope.tenantId),
    eq(idempotencyKeys.caller, scope.caller),
    eq(idempotencyKeys.key, key),
  );
}

// API-11, D4-8: one row per Idempotency-Key, claimed before the work runs and completed with its reply. The primary key
// is what makes a concurrent duplicate wait or fail fast instead of running the work twice. Each method runs on the
// executor given: the caller's own transaction when the reply is stored with the work, or the pool when it is not.
export class IdempotencyKeysRepository {
  /**
   * Claims the key for this request: true when it did; false when the key is already held. Inside a transaction, a
   * claim another request holds but has not yet committed makes this wait until that one ends -- false once it
   * committed, a claim of its own once it rolled back.
   */
  async claim(
    tx: Executor,
    scope: IdempotencyScope,
    key: string,
    path: string,
    requestHash: string,
    expiresAt: Date,
  ): Promise<boolean> {
    const rows = await tx
      .insert(idempotencyKeys)
      .values({ ...scope, key, path, requestHash, expiresAt })
      .onConflictDoNothing()
      .returning({ key: idempotencyKeys.key });
    return rows.length > 0;
  }

  async find(
    tx: Executor,
    scope: IdempotencyScope,
    key: string,
  ): Promise<SelectIdempotencyKey | null> {
    const rows = await tx.select().from(idempotencyKeys).where(byKey(scope, key)).limit(1);
    return rows[0] ?? null;
  }

  async complete(
    tx: Executor,
    scope: IdempotencyScope,
    key: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void> {
    await tx.update(idempotencyKeys).set({ responseStatus, responseBody }).where(byKey(scope, key));
  }

  /** Gives the key back: its request failed, so a retry runs again. */
  async release(tx: Executor, scope: IdempotencyScope, key: string): Promise<void> {
    await tx.delete(idempotencyKeys).where(byKey(scope, key));
  }

  /** The key, once its 24 hours have run out, so the same value starts afresh. */
  async deleteExpired(
    tx: Executor,
    scope: IdempotencyScope,
    key: string,
    now: Date,
  ): Promise<void> {
    await tx
      .delete(idempotencyKeys)
      .where(and(byKey(scope, key), lt(idempotencyKeys.expiresAt, now)));
  }
}
