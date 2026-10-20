import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import {
  productVariants,
  products,
  stockBatches,
  stockCheckLines,
  stockChecks,
  users,
  type InsertStockCheckLine,
  type SelectStockCheck,
  type SelectStockCheckLine,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

/** A stock check with who made it. */
export interface StockCheckRow extends SelectStockCheck {
  actorName: string | null;
}

/** A check as its list shows it: how much was counted and changed, and the value each way (INV-07). */
export interface StockCheckSummaryRow extends StockCheckRow {
  lines: number;
  changed: number;
  /** Rounded to the paisa line by line, summed; lines whose cost is unknown add nothing. */
  valueGained: string;
  valueLost: string;
  unknownCost: number;
}

/** One counted line, with the names it is shown by; null where the product has since been deleted for good. */
export interface StockCheckLineRow extends SelectStockCheckLine {
  productName: string | null;
  combinationKey: string | null;
  /** INV-12: the counted batch's code and expiry, when a batch was counted. */
  batchCode: string | null;
  expiresOn: string | null;
}

// A line's difference valued at its cost, rounded to the paisa the way each line is shown.
const lineValue = sql`round((${stockCheckLines.counted} - ${stockCheckLines.expected}) * ${stockCheckLines.unitCost}, 2)`;

// INV-07: a shop's stock checks and the lines each counted. Every method sets the shop's tenant context. A check is
// only ever inserted; the recount movements it records go through the stock ledger, not through here.
export class StockCheckRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async insertCheck(
    tx: Transaction,
    values: { tenantId: string; actorUserId: string | null; note: string | null },
  ): Promise<SelectStockCheck> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const [row] = await tx.insert(stockChecks).values(values).returning();
    if (!row) throw new Error('insert returned no stock check row');
    return row;
  }

  async insertLines(
    tx: Transaction,
    tenantId: string,
    rows: InsertStockCheckLine[],
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (rows.length === 0) return;
    await tx.insert(stockCheckLines).values(rows);
  }

  async findCheck(tx: Transaction, tenantId: string, id: string): Promise<StockCheckRow | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ check: stockChecks, actorName: users.name })
      .from(stockChecks)
      .leftJoin(
        users,
        and(eq(users.tenantId, stockChecks.tenantId), eq(users.id, stockChecks.actorUserId)),
      )
      .where(and(eq(stockChecks.tenantId, tenantId), eq(stockChecks.id, id)));
    const row = rows[0];
    return row ? { ...row.check, actorName: row.actorName } : null;
  }

  /** The check's lines in the order its products and variants were made. */
  async listLines(
    tx: Transaction,
    tenantId: string,
    checkId: string,
  ): Promise<StockCheckLineRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({
        line: stockCheckLines,
        productName: products.name,
        combinationKey: productVariants.combinationKey,
        batchCode: stockBatches.batchCode,
        expiresOn: stockBatches.expiresOn,
      })
      .from(stockCheckLines)
      .leftJoin(
        products,
        and(
          eq(products.tenantId, stockCheckLines.tenantId),
          eq(products.id, stockCheckLines.productId),
        ),
      )
      .leftJoin(
        productVariants,
        and(
          eq(productVariants.tenantId, stockCheckLines.tenantId),
          eq(productVariants.id, stockCheckLines.variantId),
        ),
      )
      .leftJoin(
        stockBatches,
        and(
          eq(stockBatches.tenantId, stockCheckLines.tenantId),
          eq(stockBatches.id, stockCheckLines.batchId),
        ),
      )
      .where(and(eq(stockCheckLines.tenantId, tenantId), eq(stockCheckLines.checkId, checkId)))
      .orderBy(
        asc(products.createdAt),
        asc(productVariants.createdAt),
        asc(stockCheckLines.variantId),
      );
    return rows.map((row) => ({
      ...row.line,
      productName: row.productName,
      combinationKey: row.combinationKey,
      batchCode: row.batchCode,
      expiresOn: row.expiresOn,
    }));
  }

  /** The shop's checks, newest first, each with its totals. */
  async listChecks(
    tx: Transaction,
    tenantId: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: StockCheckSummaryRow[]; total: number }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const changed = sql`${stockCheckLines.counted} <> ${stockCheckLines.expected}`;
    const rows = await tx
      .select({
        check: stockChecks,
        actorName: users.name,
        lines: sql<number>`count(${stockCheckLines.variantId})::int`,
        changed: sql<number>`count(*) FILTER (WHERE ${changed})::int`,
        valueGained: sql<string>`coalesce(sum(${lineValue}) FILTER (WHERE ${stockCheckLines.counted} > ${stockCheckLines.expected}), 0)::numeric(14, 2)::text`,
        valueLost: sql<string>`coalesce(-sum(${lineValue}) FILTER (WHERE ${stockCheckLines.counted} < ${stockCheckLines.expected}), 0)::numeric(14, 2)::text`,
        unknownCost: sql<number>`count(*) FILTER (WHERE ${changed} AND ${stockCheckLines.unitCost} IS NULL)::int`,
      })
      .from(stockChecks)
      .leftJoin(
        users,
        and(eq(users.tenantId, stockChecks.tenantId), eq(users.id, stockChecks.actorUserId)),
      )
      .leftJoin(
        stockCheckLines,
        and(
          eq(stockCheckLines.tenantId, stockChecks.tenantId),
          eq(stockCheckLines.checkId, stockChecks.id),
        ),
      )
      .where(eq(stockChecks.tenantId, tenantId))
      .groupBy(stockChecks.id, users.name)
      .orderBy(desc(stockChecks.createdAt), desc(stockChecks.id))
      .offset(page.offset)
      .limit(page.limit);
    const counted = await tx
      .select({ total: count() })
      .from(stockChecks)
      .where(eq(stockChecks.tenantId, tenantId));
    return {
      rows: rows.map((row) => ({
        ...row.check,
        actorName: row.actorName,
        lines: row.lines,
        changed: row.changed,
        valueGained: row.valueGained,
        valueLost: row.valueLost,
        unknownCost: row.unknownCost,
      })),
      total: counted[0]?.total ?? 0,
    };
  }

  /** LIF-19: a lapsed shop's checks and their lines, at day 60. */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(stockCheckLines).where(eq(stockCheckLines.tenantId, tenantId));
    await tx.delete(stockChecks).where(eq(stockChecks.tenantId, tenantId));
  }
}
