import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { StockReason } from '@lytronix/validators';
import {
  productVariants,
  products,
  stockLevels,
  stockMovements,
  users,
  type InsertStockMovement,
  type SelectProduct,
  type SelectStockMovement,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

/** A movement to record: the trigger fills on_hand_after and moves the level. */
export type NewStockMovement = Omit<InsertStockMovement, 'id' | 'onHandAfter' | 'createdAt'>;

/** A variant with what the ledger needs to know about it and its product. */
export interface StockVariantRow {
  variantId: string;
  productId: string;
  combinationKey: string;
  retired: boolean;
  avgCost: string | null;
  product: Pick<
    SelectProduct,
    'name' | 'stockTracking' | 'stockUnit' | 'lowStockThreshold' | 'stockState' | 'deletedAt'
  >;
}

/** A variant's stock, zero where it has no level yet. */
export interface VariantStockRow {
  variantId: string;
  productId: string;
  combinationKey: string;
  retired: boolean;
  sku: string | null;
  avgCost: string | null;
  onHand: string;
  reserved: string;
  available: string;
  lowNotified: boolean;
  hasLevel: boolean;
}

/** One line of a variant's stock history, with who made it. */
export interface StockHistoryRow extends SelectStockMovement {
  actorName: string | null;
}

// INV-01, INV-03, INV-09, INV-10: a shop's stock levels and its movement ledger. Every method sets the shop's tenant
// context. On-hand stock is only ever written by inserting movements; the database keeps the levels from them.
export class StockRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async findVariants(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<StockVariantRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (variantIds.length === 0) return [];
    const rows = await tx
      .select({
        variantId: productVariants.id,
        productId: productVariants.productId,
        combinationKey: productVariants.combinationKey,
        deletedAt: productVariants.deletedAt,
        avgCost: productVariants.avgCost,
        name: products.name,
        stockTracking: products.stockTracking,
        stockUnit: products.stockUnit,
        lowStockThreshold: products.lowStockThreshold,
        stockState: products.stockState,
        productDeletedAt: products.deletedAt,
      })
      .from(productVariants)
      .innerJoin(
        products,
        and(
          eq(products.tenantId, productVariants.tenantId),
          eq(products.id, productVariants.productId),
        ),
      )
      .where(and(eq(productVariants.tenantId, tenantId), inArray(productVariants.id, variantIds)));
    return rows.map((row) => ({
      variantId: row.variantId,
      productId: row.productId,
      combinationKey: row.combinationKey,
      retired: row.deletedAt !== null,
      avgCost: row.avgCost,
      product: {
        name: row.name,
        stockTracking: row.stockTracking,
        stockUnit: row.stockUnit,
        lowStockThreshold: row.lowStockThreshold,
        stockState: row.stockState,
        deletedAt: row.productDeletedAt,
      },
    }));
  }

  /**
   * Records the movements, in the order given (sort them by variant, so two writers always lock levels in the same
   * order). A level that would fall below zero, or below what is reserved, refuses the whole insert.
   */
  async insertMovements(
    tx: Transaction,
    tenantId: string,
    rows: NewStockMovement[],
  ): Promise<SelectStockMovement[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (rows.length === 0) return [];
    return tx.insert(stockMovements).values(rows).returning();
  }

  /** Every variant of these products, live and retired, with its stock; zero where it has no level yet. */
  async listVariantStock(
    tx: Transaction,
    tenantId: string,
    productIds: string[],
  ): Promise<VariantStockRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (productIds.length === 0) return [];
    const rows = await tx
      .select({
        variantId: productVariants.id,
        productId: productVariants.productId,
        combinationKey: productVariants.combinationKey,
        deletedAt: productVariants.deletedAt,
        sku: productVariants.sku,
        avgCost: productVariants.avgCost,
        onHand: stockLevels.onHand,
        reserved: stockLevels.reserved,
        available: stockLevels.available,
        lowNotified: stockLevels.lowNotified,
      })
      .from(productVariants)
      .leftJoin(
        stockLevels,
        and(
          eq(stockLevels.tenantId, productVariants.tenantId),
          eq(stockLevels.variantId, productVariants.id),
        ),
      )
      .where(
        and(eq(productVariants.tenantId, tenantId), inArray(productVariants.productId, productIds)),
      )
      .orderBy(asc(productVariants.createdAt), asc(productVariants.id));
    return rows.map((row) => ({
      variantId: row.variantId,
      productId: row.productId,
      combinationKey: row.combinationKey,
      retired: row.deletedAt !== null,
      sku: row.sku,
      avgCost: row.avgCost,
      onHand: row.onHand ?? '0.000',
      reserved: row.reserved ?? '0.000',
      available: row.available ?? '0.000',
      lowNotified: row.lowNotified ?? false,
      hasLevel: row.onHand !== null,
    }));
  }

  /**
   * INV-06: the variant's on-hand stock, its level made (empty) if it has none and locked until the transaction ends,
   * so a stock edit works out its difference from a number no other write can change underneath it.
   */
  async lockLevel(tx: Transaction, tenantId: string, variantId: string): Promise<string> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .insert(stockLevels)
      .values({ tenantId, variantId })
      .onConflictDoNothing({ target: [stockLevels.tenantId, stockLevels.variantId] });
    const rows = await tx
      .select({ onHand: stockLevels.onHand })
      .from(stockLevels)
      .where(and(eq(stockLevels.tenantId, tenantId), eq(stockLevels.variantId, variantId)))
      .for('update');
    return rows[0]?.onHand ?? '0.000';
  }

  /** INV-08: marks these variants' levels as notified (or not) for the current crossing. */
  async setLowNotified(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
    notified: boolean,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (variantIds.length === 0) return;
    await tx
      .update(stockLevels)
      .set({ lowNotified: notified, updatedAt: new Date() })
      .where(and(eq(stockLevels.tenantId, tenantId), inArray(stockLevels.variantId, variantIds)));
  }

  /** INV-09: a variant's movements, newest first, with the staff member who made each. */
  async listHistory(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: StockHistoryRow[]; total: number }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const own = and(eq(stockMovements.tenantId, tenantId), eq(stockMovements.variantId, variantId));
    const rows = await tx
      .select({ movement: stockMovements, actorName: users.name })
      .from(stockMovements)
      .leftJoin(
        users,
        and(eq(users.tenantId, stockMovements.tenantId), eq(users.id, stockMovements.actorUserId)),
      )
      .where(own)
      .orderBy(desc(stockMovements.id))
      .offset(page.offset)
      .limit(page.limit);
    const totals = await tx.select({ total: count() }).from(stockMovements).where(own);
    return {
      rows: rows.map((row) => ({ ...row.movement, actorName: row.actorName })),
      total: totals[0]?.total ?? 0,
    };
  }

  /** INV-10: whether a purchase receipt has set the variant's cost (Slice 4), after which it is no longer typed in. */
  async hasReceipt(tx: Transaction, tenantId: string, variantId: string): Promise<boolean> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.tenantId, tenantId),
          eq(stockMovements.variantId, variantId),
          eq(stockMovements.reason, StockReason.PurchaseReceipt),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /** INV-10: the variant's average unit cost, typed in by hand. */
  async setAvgCost(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    avgCost: string | null,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(productVariants)
      .set({ avgCost })
      .where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.id, variantId)));
  }

  /**
   * LIF-19: a lapsed shop's ledger and levels, at day 60. The movements' guard lets this through only for the shop
   * named in the transaction, and only while it is archived or deleted.
   */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(sql`SELECT set_config('app.erasing_tenant', ${tenantId}, true)`);
    await tx.delete(stockMovements).where(eq(stockMovements.tenantId, tenantId));
    await tx.delete(stockLevels).where(eq(stockLevels.tenantId, tenantId));
  }
}
