import { and, asc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import {
  paymentEvidence,
  type InsertPaymentEvidence,
  type SelectPaymentEvidence,
} from '../../schema';

/** ADM-14, ADM-17, D8-47: the record of each payment screenshot kept in the private bucket. */
export class PaymentEvidenceRepository {
  async insert(db: Executor, values: InsertPaymentEvidence): Promise<SelectPaymentEvidence> {
    const [row] = await db.insert(paymentEvidence).values(values).returning();
    if (!row) throw new Error('insert returned no payment evidence');
    return row;
  }

  async findById(db: Executor, id: string): Promise<SelectPaymentEvidence | null> {
    const rows = await db.select().from(paymentEvidence).where(eq(paymentEvidence.id, id)).limit(1);
    return rows[0] ?? null;
  }

  /** D8-47: the oldest files past their two years, a batch at a time. */
  dueForRemoval(db: Executor, before: Date, limit: number): Promise<SelectPaymentEvidence[]> {
    return db
      .select()
      .from(paymentEvidence)
      .where(and(isNull(paymentEvidence.removedAt), lt(paymentEvidence.createdAt, before)))
      .orderBy(asc(paymentEvidence.createdAt))
      .limit(limit);
  }

  async markRemoved(db: Executor, ids: readonly string[], at: Date): Promise<void> {
    if (ids.length === 0) return;
    await db
      .update(paymentEvidence)
      .set({ removedAt: at })
      .where(inArray(paymentEvidence.id, [...ids]));
  }
}
