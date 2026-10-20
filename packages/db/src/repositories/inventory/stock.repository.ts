import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
  type SQL,
} from 'drizzle-orm';
import { StockReason } from '@lytronix/validators';
import {
  productVariants,
  products,
  stockBatches,
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
  /** INV-24: the hidden variant holding the product's shared stock. */
  isStockHolder: boolean;
  /** INV-24: how much of the shared stock one unit sold uses; null unless the product shares its stock. */
  packAmount: string | null;
  product: Pick<
    SelectProduct,
    | 'name'
    | 'stockTracking'
    | 'stockUnit'
    | 'lowStockThreshold'
    | 'stockState'
    | 'sharedStock'
    | 'batchTracked'
    | 'serialTracked'
    | 'serialFormat'
    | 'deletedAt'
  >;
}

/** A variant's stock, zero where it has no level yet. */
export interface VariantStockRow {
  variantId: string;
  productId: string;
  combinationKey: string;
  retired: boolean;
  isStockHolder: boolean;
  packAmount: string | null;
  sku: string | null;
  avgCost: string | null;
  onHand: string;
  reserved: string;
  /** INV-13: stock in its expired batches, out of what is available until written off. */
  unsellable: string;
  available: string;
  lowNotified: boolean;
  hasLevel: boolean;
}

/** INV-18: the stock held now at average cost; variants holding stock with no cost add nothing and are counted. */
export interface StockValueRow {
  value: string;
  unknownCost: number;
}

/** INV-18: one reason's outgoing movements in a period, valued at the cost each recorded. */
export interface OutgoingRow {
  reason: StockReason;
  movements: number;
  value: string;
  unknownCost: number;
}

/**
 * INV-13, INV-15: a level where expiry has left units held for orders with nothing sellable under them (`short` above
 * zero), or one the shop was told about that has since recovered.
 */
export interface ShortfallRow {
  variantId: string;
  productId: string;
  productName: string;
  reserved: string;
  short: string;
  shortNotified: boolean;
}

/** One line of a variant's stock history, with who made it and, for a batch, its code and expiry (INV-12). */
export interface StockHistoryRow extends SelectStockMovement {
  actorName: string | null;
  batchCode: string | null;
  expiresOn: string | null;
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
    if (variantIds.length === 0) return [];
    return this.selectVariants(tx, tenantId, inArray(productVariants.id, variantIds));
  }

  /** INV-24: the live stock-holder variant of each of these products that shares its stock. */
  async findStockHolders(
    tx: Transaction,
    tenantId: string,
    productIds: string[],
  ): Promise<StockVariantRow[]> {
    if (productIds.length === 0) return [];
    return this.selectVariants(
      tx,
      tenantId,
      and(
        inArray(productVariants.productId, productIds),
        eq(productVariants.isStockHolder, true),
        isNull(productVariants.deletedAt),
      ),
    );
  }

  private async selectVariants(
    tx: Transaction,
    tenantId: string,
    which: SQL | undefined,
  ): Promise<StockVariantRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({
        variantId: productVariants.id,
        productId: productVariants.productId,
        combinationKey: productVariants.combinationKey,
        deletedAt: productVariants.deletedAt,
        avgCost: productVariants.avgCost,
        isStockHolder: productVariants.isStockHolder,
        packAmount: productVariants.packAmount,
        name: products.name,
        stockTracking: products.stockTracking,
        stockUnit: products.stockUnit,
        lowStockThreshold: products.lowStockThreshold,
        stockState: products.stockState,
        sharedStock: products.sharedStock,
        batchTracked: products.batchTracked,
        serialTracked: products.serialTracked,
        serialFormat: products.serialFormat,
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
      .where(and(eq(productVariants.tenantId, tenantId), which));
    return rows.map((row) => ({
      variantId: row.variantId,
      productId: row.productId,
      combinationKey: row.combinationKey,
      retired: row.deletedAt !== null,
      avgCost: row.avgCost,
      isStockHolder: row.isStockHolder,
      packAmount: row.packAmount,
      product: {
        name: row.name,
        stockTracking: row.stockTracking,
        stockUnit: row.stockUnit,
        lowStockThreshold: row.lowStockThreshold,
        stockState: row.stockState,
        sharedStock: row.sharedStock,
        batchTracked: row.batchTracked,
        serialTracked: row.serialTracked,
        serialFormat: row.serialFormat,
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
        isStockHolder: productVariants.isStockHolder,
        packAmount: productVariants.packAmount,
        sku: productVariants.sku,
        avgCost: productVariants.avgCost,
        onHand: stockLevels.onHand,
        reserved: stockLevels.reserved,
        unsellable: stockLevels.unsellable,
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
      isStockHolder: row.isStockHolder,
      packAmount: row.packAmount,
      sku: row.sku,
      avgCost: row.avgCost,
      onHand: row.onHand ?? '0.000',
      reserved: row.reserved ?? '0.000',
      unsellable: row.unsellable ?? '0.000',
      available: row.available ?? '0.000',
      lowNotified: row.lowNotified ?? false,
      hasLevel: row.onHand !== null,
    }));
  }

  /**
   * The stock lock order: these products, in id order, before any of their levels. A writer holding a product's lock
   * may update it (its public stock state) without waiting on another writer that holds the same product and waits
   * for a level, which is how two writers sharing the product row would deadlock.
   */
  async lockProducts(tx: Transaction, tenantId: string, productIds: string[]): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (productIds.length === 0) return;
    await tx
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds)))
      .orderBy(asc(products.id))
      .for('no key update');
  }

  /**
   * INV-06: the variant's on-hand stock, its level made (empty) if it has none and locked until the transaction ends,
   * so a stock edit works out its difference from a number no other write can change underneath it. Its product is
   * locked first, as every stock writer locks; a writer touching several products locks them all first.
   */
  async lockLevel(tx: Transaction, tenantId: string, variantId: string): Promise<string> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(sql`
      SELECT p.id FROM ${products} p
      JOIN ${productVariants} v ON v.tenant_id = p.tenant_id AND v.product_id = p.id
      WHERE v.tenant_id = ${tenantId} AND v.id = ${variantId}
      FOR NO KEY UPDATE OF p`);
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

  /** INV-13, INV-15: the shop's levels short of what they hold for orders, and those still marked as told. */
  async listShortfalls(tx: Transaction, tenantId: string): Promise<ShortfallRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const short = sql<string>`GREATEST(${stockLevels.reserved} + ${stockLevels.unsellable} - ${stockLevels.onHand}, 0)`;
    return tx
      .select({
        variantId: stockLevels.variantId,
        productId: productVariants.productId,
        productName: products.name,
        reserved: stockLevels.reserved,
        short: short.mapWith(String),
        shortNotified: stockLevels.shortNotified,
      })
      .from(stockLevels)
      .innerJoin(
        productVariants,
        and(
          eq(productVariants.tenantId, stockLevels.tenantId),
          eq(productVariants.id, stockLevels.variantId),
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
          eq(stockLevels.tenantId, tenantId),
          sql`(${stockLevels.reserved} + ${stockLevels.unsellable} > ${stockLevels.onHand} OR ${stockLevels.shortNotified})`,
        ),
      )
      .orderBy(asc(stockLevels.variantId));
  }

  /** INV-13, INV-15: marks these levels as told (or not) about their current shortfall. */
  async setShortNotified(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
    notified: boolean,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (variantIds.length === 0) return;
    await tx
      .update(stockLevels)
      .set({ shortNotified: notified, updatedAt: new Date() })
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
      .select({
        movement: stockMovements,
        actorName: users.name,
        batchCode: stockBatches.batchCode,
        expiresOn: stockBatches.expiresOn,
      })
      .from(stockMovements)
      .leftJoin(
        users,
        and(eq(users.tenantId, stockMovements.tenantId), eq(users.id, stockMovements.actorUserId)),
      )
      .leftJoin(
        stockBatches,
        and(
          eq(stockBatches.tenantId, stockMovements.tenantId),
          eq(stockBatches.id, stockMovements.batchId),
        ),
      )
      .where(own)
      .orderBy(desc(stockMovements.id))
      .offset(page.offset)
      .limit(page.limit);
    const totals = await tx.select({ total: count() }).from(stockMovements).where(own);
    return {
      rows: rows.map((row) => ({
        ...row.movement,
        actorName: row.actorName,
        batchCode: row.batchCode,
        expiresOn: row.expiresOn,
      })),
      total: totals[0]?.total ?? 0,
    };
  }

  /**
   * INV-10: whether a purchase receipt carrying a unit cost has set the variant's average cost, after which it is no
   * longer typed in. A receipt with no cost leaves it to the hand.
   */
  async hasCostedReceipt(tx: Transaction, tenantId: string, variantId: string): Promise<boolean> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.tenantId, tenantId),
          eq(stockMovements.variantId, variantId),
          eq(stockMovements.reason, StockReason.PurchaseReceipt),
          isNotNull(stockMovements.unitCost),
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
   * INV-18: what the stock held now is worth at average cost, and how many variants holding stock have no cost yet
   * (counted at nothing, so the value is a floor, never a guess).
   */
  async stockValue(tx: Transaction, tenantId: string): Promise<StockValueRow> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({
        value: sql<string>`coalesce(round(sum(${stockLevels.onHand} * ${productVariants.avgCost}), 2), 0)::numeric(14, 2)::text`,
        unknownCost: sql<number>`count(*) FILTER (WHERE ${productVariants.avgCost} IS NULL)::int`,
      })
      .from(stockLevels)
      .innerJoin(
        productVariants,
        and(
          eq(productVariants.tenantId, stockLevels.tenantId),
          eq(productVariants.id, stockLevels.variantId),
        ),
      )
      .where(and(eq(stockLevels.tenantId, tenantId), sql`${stockLevels.onHand} > 0`));
    return rows[0] ?? { value: '0.00', unknownCost: 0 };
  }

  /**
   * INV-11, INV-18: the stock that left in a period, by reason, valued at the cost each movement recorded. A
   * movement whose cost was unknown adds nothing and is counted instead.
   */
  async outgoingByReason(
    tx: Transaction,
    tenantId: string,
    period: { from: Date; to: Date },
  ): Promise<OutgoingRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select({
        reason: stockMovements.reason,
        movements: sql<number>`count(*)::int`,
        value: sql<string>`coalesce(round(sum(-${stockMovements.quantityDelta} * ${stockMovements.unitCost}), 2), 0)::numeric(14, 2)::text`,
        unknownCost: sql<number>`count(*) FILTER (WHERE ${stockMovements.unitCost} IS NULL)::int`,
      })
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.tenantId, tenantId),
          sql`${stockMovements.quantityDelta} < 0`,
          gte(stockMovements.createdAt, period.from),
          lt(stockMovements.createdAt, period.to),
        ),
      )
      .groupBy(stockMovements.reason)
      .orderBy(asc(stockMovements.reason));
  }

  /**
   * LIF-19: a lapsed shop's ledger, batches and levels, at day 60. The movements' guard lets this through only for the shop
   * named in the transaction, and only while it is archived or deleted.
   */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(sql`SELECT set_config('app.erasing_tenant', ${tenantId}, true)`);
    await tx.delete(stockMovements).where(eq(stockMovements.tenantId, tenantId));
    await tx.delete(stockBatches).where(eq(stockBatches.tenantId, tenantId));
    await tx.delete(stockLevels).where(eq(stockLevels.tenantId, tenantId));
  }
}
