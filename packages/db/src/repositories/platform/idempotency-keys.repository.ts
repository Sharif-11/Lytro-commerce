import { eq } from 'drizzle-orm';
import { idempotencyKeys, type SelectIdempotencyKey } from '../../schema';
import type { Executor } from '../../transactions';

// API-11: one row per Idempotency-Key, inserted before the handler runs and completed after. The primary key
// on `key` is what makes a concurrent duplicate request fail fast instead of re-running the handler.
export class IdempotencyKeysRepository {
  async begin(
    tx: Executor,
    key: string,
    path: string,
    requestHash: string,
    expiresAt: Date,
  ): Promise<SelectIdempotencyKey> {
    const [row] = await tx
      .insert(idempotencyKeys)
      .values({ key, path, requestHash, expiresAt })
      .returning();
    if (!row) throw new Error('insert returned no idempotency key row');
    return row;
  }

  async findByKey(tx: Executor, key: string): Promise<SelectIdempotencyKey | null> {
    const rows = await tx
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key))
      .limit(1);
    return rows[0] ?? null;
  }

  async complete(
    tx: Executor,
    key: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void> {
    await tx
      .update(idempotencyKeys)
      .set({ responseStatus, responseBody })
      .where(eq(idempotencyKeys.key, key));
  }

  async delete(tx: Executor, key: string): Promise<void> {
    await tx.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
  }
}
