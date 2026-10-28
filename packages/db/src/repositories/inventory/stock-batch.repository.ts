import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';
import {
  productVariants,
  products,
  stockBatches,
  stockLevels,
  type SelectProduct,
  type SelectStockBatch,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

/** A batch with the product and variant it belongs to, for lists and notices. */
export interface StockBatchListRow extends SelectStockBatch {
  productId: string;
  productName: string;
  combinationKey: string;
  isStockHolder: boolean;
  /** UOM-01: the unit its quantity counts in. */
  stockUnit: SelectProduct['stockUnit'];
  /** INV-10: its variant's average cost; null is unknown. */
  avgCost: string | null;
}

/** A new batch: a lot code and an expiry date, both optional, or the variant's one "no expiry" batch. */
export interface NewStockBatch {
  variantId: string;
  batchCode: string | null;
  expiresOn: string | null;
  isDefault: boolean;
}

// The picking order (INV-12): earliest expiry first, no expiry last, the oldest received first among equals.
const PICKING_ORDER = [
  sql`${stockBatches.expiresOn} ASC NULLS LAST`,
  asc(stockBatches.receivedAt),
  asc(stockBatches.id),
];

// INV-12, INV-13: a shop's stock batches. Every method sets the shop's tenant context. A batch's quantity is only ever
// moved by a stock movement (the database refuses anything else), so nothing here writes one.
export class StockBatchRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async findBatches(
    tx: Transaction,
    tenantId: string,
    batchIds: string[],
  ): Promise<SelectStockBatch[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (batchIds.length === 0) return [];
    return tx
      .select()
      .from(stockBatches)
      .where(and(eq(stockBatches.tenantId, tenantId), inArray(stockBatches.id, batchIds)));
  }

  /**
   * A variant's open batches in the picking order, locked until the transaction ends. Lock the variant's level first
   * (as the movement trigger does), so writers always take the level, then its batches.
   */
  async lockOpenBatches(
    tx: Transaction,
    tenantId: string,
    variantId: string,
  ): Promise<SelectStockBatch[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(stockBatches)
      .where(
        and(
          eq(stockBatches.tenantId, tenantId),
          eq(stockBatches.variantId, variantId),
          isNull(stockBatches.closedAt),
        ),
      )
      .orderBy(...PICKING_ORDER)
      .for('update');
  }

  /** Opens an empty batch; the movement that follows puts the stock in it. */
  async insertBatch(
    tx: Transaction,
    tenantId: string,
    batch: NewStockBatch,
  ): Promise<SelectStockBatch> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(stockBatches)
      .values({ tenantId, ...batch })
      .returning();
    if (!row) throw new Error('insert returned no batch row');
    return row;
  }

  /** The open batches of a product's variants, its stock holder's included, in the picking order. */
  async listProductBatches(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<StockBatchListRow[]> {
    return this.listWhere(tx, tenantId, eq(productVariants.productId, productId), {
      offset: 0,
      limit: null,
    });
  }

  /**
   * INV-13: the shop's open batches still holding stock that expire on or before `until` (and, given `from`, on or
   * after it), soonest first.
   */
  async listShopBatches(
    tx: Transaction,
    tenantId: string,
    range: { from: string | null; until: string },
    page: { offset: number; limit: number },
  ): Promise<{ rows: StockBatchListRow[]; total: number }> {
    const which = and(
      isNotNull(stockBatches.expiresOn),
      lte(stockBatches.expiresOn, range.until),
      range.from !== null ? gte(stockBatches.expiresOn, range.from) : undefined,
      sql`${stockBatches.quantity} > 0`,
    );
    const rows = await this.listWhere(tx, tenantId, which, page);
    // Counted as the rows are listed: an archived product's batches are left out of both.
    const totals = await tx
      .select({ total: count() })
      .from(stockBatches)
      .innerJoin(
        productVariants,
        and(
          eq(productVariants.tenantId, stockBatches.tenantId),
          eq(productVariants.id, stockBatches.variantId),
        ),
      )
      .innerJoin(
        products,
        and(
          eq(products.tenantId, productVariants.tenantId),
          eq(products.id, productVariants.productId),
        ),
      )
      .where(
        and(
          eq(stockBatches.tenantId, tenantId),
          isNull(stockBatches.closedAt),
          isNull(products.deletedAt),
          which,
        ),
      );
    return { rows, total: totals[0]?.total ?? 0 };
  }

  /** INV-13: batches with stock expiring between `from` and `until` that have not had their notice yet. */
  async listUnnotified(
    tx: Transaction,
    tenantId: string,
    range: { from: string; until: string },
  ): Promise<StockBatchListRow[]> {
    return this.listWhere(
      tx,
      tenantId,
      and(
        isNull(stockBatches.expiryNotifiedAt),
        gte(stockBatches.expiresOn, range.from),
        lte(stockBatches.expiresOn, range.until),
        sql`${stockBatches.quantity} > 0`,
      ),
      { offset: 0, limit: null },
    );
  }

  async markNotified(tx: Transaction, tenantId: string, batchIds: string[]): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (batchIds.length === 0) return;
    await tx
      .update(stockBatches)
      .set({ expiryNotifiedAt: new Date() })
      .where(and(eq(stockBatches.tenantId, tenantId), inArray(stockBatches.id, batchIds)));
  }

  /**
   * INV-13: works out again, under each level's lock, the unsellable stock of every variant with an expired batch or
   * with stock already set aside; returns the variants whose figure changed. Their products are locked first, in id
   * order, as every stock writer locks, along with those of levels marked short (INV-15) that the pass may reset.
   */
  async refreshUnsellable(tx: Transaction, tenantId: string): Promise<string[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const candidates = sql`
      SELECT b.variant_id FROM ${stockBatches} b
      WHERE b.tenant_id = ${tenantId} AND b.closed_at IS NULL AND b.quantity > 0
        AND b.expires_on < tenant.dhaka_today()
      UNION
      SELECT l.variant_id FROM ${stockLevels} l
      WHERE l.tenant_id = ${tenantId} AND (l.unsellable <> 0 OR l.short_notified)`;
    await tx.execute(sql`
      SELECT p.id FROM ${products} p
      WHERE p.tenant_id = ${tenantId} AND p.id IN (
        SELECT v.product_id FROM ${productVariants} v
        WHERE v.tenant_id = ${tenantId} AND v.id IN (${candidates})
      )
      ORDER BY p.id
      FOR NO KEY UPDATE`);
    const rows = await tx.execute<{ variant_id: string }>(sql`
      SELECT c.variant_id FROM (${candidates}) c
      WHERE tenant.refresh_unsellable(${tenantId}, c.variant_id)`);
    return rows.rows.map((row) => row.variant_id);
  }

  private async listWhere(
    tx: Transaction,
    tenantId: string,
    which: SQL | undefined,
    page: { offset: number; limit: number | null },
  ): Promise<StockBatchListRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const query = tx
      .select({
        batch: stockBatches,
        productId: productVariants.productId,
        productName: products.name,
        combinationKey: productVariants.combinationKey,
        isStockHolder: productVariants.isStockHolder,
        stockUnit: products.stockUnit,
        avgCost: productVariants.avgCost,
      })
      .from(stockBatches)
      .innerJoin(
        productVariants,
        and(
          eq(productVariants.tenantId, stockBatches.tenantId),
          eq(productVariants.id, stockBatches.variantId),
        ),
      )
      .innerJoin(
        products,
        and(
          eq(products.tenantId, productVariants.tenantId),
          eq(products.id, productVariants.productId),
        ),
      )
      .where(
        and(
          eq(stockBatches.tenantId, tenantId),
          isNull(stockBatches.closedAt),
          isNull(products.deletedAt),
          which,
        ),
      )
      .orderBy(...PICKING_ORDER)
      .offset(page.offset);
    const rows = page.limit === null ? await query : await query.limit(page.limit);
    return rows.map((row) => ({
      ...row.batch,
      productId: row.productId,
      productName: row.productName,
      combinationKey: row.combinationKey,
      isStockHolder: row.isStockHolder,
      stockUnit: row.stockUnit,
      avgCost: row.avgCost,
    }));
  }
}
