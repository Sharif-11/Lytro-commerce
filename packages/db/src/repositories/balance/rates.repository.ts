import { desc, eq } from 'drizzle-orm';
import type { RateKey } from '@lytronix/validators';
import { rateHistory, rates, type SelectRate, type SelectRateHistory } from '../../schema';
import type { Executor } from '../../transactions';

// RAT-01..14: control.rates is platform-wide, so none of this touches tenant context or row-level security.
export class RatesRepository {
  async get(db: Executor, key: RateKey): Promise<SelectRate | null> {
    const rows = await db.select().from(rates).where(eq(rates.key, key)).limit(1);
    return rows[0] ?? null;
  }

  async list(db: Executor): Promise<SelectRate[]> {
    return db.select().from(rates);
  }

  /** Inserts the key if it has never been set, used only by the seed migration. */
  async seed(db: Executor, key: RateKey, value: string): Promise<void> {
    await db.insert(rates).values({ key, value }).onConflictDoNothing();
  }

  /** RAT-02/RAT-04: writes the new value and appends the history row in the same transaction. */
  async set(
    db: Executor,
    key: RateKey,
    oldValue: string | null,
    newValue: string,
    changedBy: string | null,
    noticeId: string | null,
  ): Promise<void> {
    await db
      .insert(rates)
      .values({ key, value: newValue })
      .onConflictDoUpdate({
        target: rates.key,
        set: { value: newValue, effectiveFrom: new Date() },
      });
    await db.insert(rateHistory).values({ key, oldValue, newValue, changedBy, noticeId });
  }

  async history(db: Executor, key: RateKey): Promise<SelectRateHistory[]> {
    return db
      .select()
      .from(rateHistory)
      .where(eq(rateHistory.key, key))
      .orderBy(desc(rateHistory.changedAt));
  }
}
