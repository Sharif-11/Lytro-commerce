import { and, count, eq, inArray } from 'drizzle-orm';
import type { PerUsePaidFrom } from '@lytronix/validators';
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
}
