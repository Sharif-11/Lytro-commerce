import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { sizeCharts, type SelectSizeChart } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

/** A size chart belongs to one product or one category (PRD-17). */
export type SizeChartOwner = { productId: string } | { categoryId: string };

/** PRD-17, MED-03: what a chart shows: a table of short text, or an image of the shop's. */
export type SizeChartContent = { rows: string[][] } | { imageId: string };

// PRD-17: a shop's size charts, one per product or per category. Every method sets the shop's tenant context.
export class SizeChartRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  private ownedBy(tenantId: string, owner: SizeChartOwner) {
    return and(
      eq(sizeCharts.tenantId, tenantId),
      'productId' in owner
        ? eq(sizeCharts.productId, owner.productId)
        : eq(sizeCharts.categoryId, owner.categoryId),
    );
  }

  async findChart(
    tx: Transaction,
    tenantId: string,
    owner: SizeChartOwner,
  ): Promise<SelectSizeChart | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx.select().from(sizeCharts).where(this.ownedBy(tenantId, owner));
    return rows[0] ?? null;
  }

  /** Every one of the shop's category charts. */
  async listCategoryCharts(tx: Transaction, tenantId: string): Promise<SelectSizeChart[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(sizeCharts)
      .where(and(eq(sizeCharts.tenantId, tenantId), isNotNull(sizeCharts.categoryId)));
  }

  /** Sets the owner's chart, replacing the one it had. */
  async putChart(
    tx: Transaction,
    tenantId: string,
    owner: SizeChartOwner,
    content: SizeChartContent,
  ): Promise<SelectSizeChart> {
    await this.transactions.setTenantContext(tx, tenantId);
    const byProduct = 'productId' in owner;
    const shown =
      'rows' in content
        ? { tableRows: content.rows, imageId: null }
        : { tableRows: null, imageId: content.imageId };
    const rows = await tx
      .insert(sizeCharts)
      .values({ tenantId, ...owner, ...shown })
      .onConflictDoUpdate({
        target: byProduct
          ? [sizeCharts.tenantId, sizeCharts.productId]
          : [sizeCharts.tenantId, sizeCharts.categoryId],
        targetWhere: byProduct
          ? sql`${sizeCharts.productId} IS NOT NULL`
          : sql`${sizeCharts.categoryId} IS NOT NULL`,
        set: { ...shown, updatedAt: new Date() },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('upsert returned no size chart row');
    return row;
  }

  /** Removes the owner's chart; false when it had none. */
  async deleteChart(tx: Transaction, tenantId: string, owner: SizeChartOwner): Promise<boolean> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .delete(sizeCharts)
      .where(this.ownedBy(tenantId, owner))
      .returning({ id: sizeCharts.id });
    return rows.length > 0;
  }
}
