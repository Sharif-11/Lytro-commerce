import { and, count, eq, gte, inArray, sql } from 'drizzle-orm';
import { PerUsePaidFrom } from '@lytronix/validators';
import { orderExtractions } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

export interface NewOrderExtraction {
  tenantId: string;
  userId: string | null;
  inputChars: number;
  confidence: string;
  paidFrom: PerUsePaidFrom;
  cost: string;
  addonPurchaseId: string | null;
}

// ORD-34, PLN-20 (Phase 7 Slice 7.6): each charged read of delivery details, and the allowance uses they took.
export class OrderExtractionRepository {
  constructor(private readonly transactions: Pick<TransactionRunner, 'setTenantContext'>) {}

  async insert(db: Transaction, values: NewOrderExtraction): Promise<void> {
    await this.transactions.setTenantContext(db, values.tenantId);
    await db.insert(orderExtractions).values(values);
  }

  /** PLN-20: how many reads each of these allowance purchases has paid for. */
  async usesOf(
    db: Transaction,
    tenantId: string,
    purchaseIds: string[],
  ): Promise<Map<string, number>> {
    if (purchaseIds.length === 0) return new Map();
    await this.transactions.setTenantContext(db, tenantId);
    const rows = await db
      .select({ purchaseId: orderExtractions.addonPurchaseId, uses: count() })
      .from(orderExtractions)
      .where(
        and(
          eq(orderExtractions.tenantId, tenantId),
          inArray(orderExtractions.addonPurchaseId, purchaseIds),
        ),
      )
      .groupBy(orderExtractions.addonPurchaseId);
    return new Map(rows.flatMap((row) => (row.purchaseId ? [[row.purchaseId, row.uses]] : [])));
  }

  /** PLN-20 (Slice 7.7): the reads paid from the balance since a moment -- outside any allowance -- and what they cost. */
  async paidFromBalanceSince(
    db: Transaction,
    tenantId: string,
    since: Date,
  ): Promise<{ count: number; cost: string }> {
    await this.transactions.setTenantContext(db, tenantId);
    const [row] = await db
      .select({
        count: count(),
        cost: sql<string>`coalesce(sum(${orderExtractions.cost}), 0)::numeric(12, 2)::text`,
      })
      .from(orderExtractions)
      .where(
        and(
          eq(orderExtractions.tenantId, tenantId),
          eq(orderExtractions.paidFrom, PerUsePaidFrom.Balance),
          gte(orderExtractions.createdAt, since),
        ),
      );
    return { count: row?.count ?? 0, cost: row?.cost ?? '0.00' };
  }
}
