import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { OPEN_PURCHASE_STATUSES, type PurchaseStatus, type StockUnit } from '@lytronix/validators';
import {
  productVariants,
  products,
  purchaseCounters,
  purchaseOrderLines,
  purchaseOrders,
  suppliers,
  type InsertPurchaseOrderLine,
  type SelectPurchaseOrder,
  type SelectPurchaseOrderLine,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';
import { isEmptyPatch } from '../patch';

/** A purchase with its supplier's name (kept after the supplier is archived). */
export interface PurchaseOrderRow extends SelectPurchaseOrder {
  supplierName: string | null;
}

/** A purchase as its list shows it: how many items, and what they cost where the cost is known. */
export interface PurchaseOrderSummaryRow extends PurchaseOrderRow {
  items: number;
  /** Quantity times unit cost, rounded to the paisa item by item, summed; items with no cost add nothing. */
  total: string;
  unknownCost: number;
}

/**
 * PUR-05: what one purchase (or, with no purchase, the shop's open purchases) orders in one stock unit, and how much of
 * it is still to come. Null unit: the product has since been deleted for good.
 */
export interface PurchaseUnitsRow {
  purchaseOrderId: string;
  stockUnit: StockUnit | null;
  ordered: string;
  outstanding: string;
}

/** One item bought, with the names it is shown by; null where the product has since been deleted for good. */
export interface PurchaseLineRow extends SelectPurchaseOrderLine {
  productName: string | null;
  combinationKey: string | null;
  stockUnit: StockUnit | null;
}

/** The details a purchase's update may change. */
export type PurchaseOrderPatch = Partial<
  Pick<
    SelectPurchaseOrder,
    'supplierId' | 'status' | 'number' | 'expectedOn' | 'notes' | 'orderedAt' | 'closeReason'
  >
>;

/** What an item's update may change. */
export type PurchaseLinePatch = Partial<
  Pick<SelectPurchaseOrderLine, 'position' | 'quantityOrdered' | 'unitCost'>
>;

// PUR-05: the purchases whose outstanding quantity is on its way.
const OPEN_STATUSES = [...OPEN_PURCHASE_STATUSES];

// An item's quantity at its cost, rounded to the paisa the way each item is shown.
const lineTotal = sql`round(${purchaseOrderLines.quantityOrdered} * ${purchaseOrderLines.unitCost}, 2)`;

// PUR-04, PUR-05: what an item still awaits -- ordered less received, never below nothing.
const OUTSTANDING = sql`greatest(${purchaseOrderLines.quantityOrdered} - ${purchaseOrderLines.quantityReceived}, 0)`;

// PUR-02, PUR-03, PUR-05: a shop's purchases, the items each buys, and the counter that numbers them. Every method sets
// the shop's tenant context. The database keeps a number once given and keeps a placed purchase (a trigger); the
// stock a receipt brings in goes through the stock ledger, not through here.
export class PurchaseOrderRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  /**
   * PUR-03: the shop's next purchase number. The counter row stays locked until the transaction ends, so a second
   * purchase placed at the same time waits and takes the number after; a rollback gives the number back.
   */
  async nextNumber(tx: Transaction, tenantId: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(purchaseCounters)
      .values({ tenantId, lastNumber: 1 })
      .onConflictDoUpdate({
        target: purchaseCounters.tenantId,
        set: { lastNumber: sql`${purchaseCounters.lastNumber} + 1` },
      })
      .returning({ lastNumber: purchaseCounters.lastNumber });
    if (!row) throw new Error('the purchase counter returned no number');
    return row.lastNumber;
  }

  /** A draft, or (PUR-07, a one-step arrival) a purchase placed at once with its number. */
  async insertOrder(
    tx: Transaction,
    values: Pick<SelectPurchaseOrder, 'tenantId' | 'supplierId' | 'expectedOn' | 'notes'> &
      Partial<Pick<SelectPurchaseOrder, 'status' | 'number' | 'orderedAt'>>,
  ): Promise<SelectPurchaseOrder> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const [row] = await tx.insert(purchaseOrders).values(values).returning();
    if (!row) throw new Error('insert returned no purchase row');
    return row;
  }

  /** A purchase with its supplier's name; `lock` holds the row until the transaction ends. */
  async findOrder(
    tx: Transaction,
    tenantId: string,
    id: string,
    lock: boolean,
  ): Promise<PurchaseOrderRow | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (lock) {
      const locked = await tx
        .select({ id: purchaseOrders.id })
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.tenantId, tenantId), eq(purchaseOrders.id, id)))
        .for('update');
      if (locked.length === 0) return null;
    }
    const [row] = await tx
      .select({ order: purchaseOrders, supplierName: suppliers.name })
      .from(purchaseOrders)
      .leftJoin(
        suppliers,
        and(
          eq(suppliers.tenantId, purchaseOrders.tenantId),
          eq(suppliers.id, purchaseOrders.supplierId),
        ),
      )
      .where(and(eq(purchaseOrders.tenantId, tenantId), eq(purchaseOrders.id, id)));
    return row ? { ...row.order, supplierName: row.supplierName } : null;
  }

  /** Changes the purchase and marks it updated, even when only its items changed (an empty patch). */
  async updateOrder(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: PurchaseOrderPatch,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(purchaseOrders)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(purchaseOrders.tenantId, tenantId), eq(purchaseOrders.id, id)));
  }

  /** A draft, and its items with it. The database refuses any other purchase. */
  async deleteOrder(tx: Transaction, tenantId: string, id: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(purchaseOrders)
      .where(and(eq(purchaseOrders.tenantId, tenantId), eq(purchaseOrders.id, id)));
  }

  async insertLines(
    tx: Transaction,
    tenantId: string,
    rows: Omit<InsertPurchaseOrderLine, 'id' | 'quantityReceived'>[],
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (rows.length === 0) return;
    await tx.insert(purchaseOrderLines).values(rows);
  }

  async updateLine(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: PurchaseLinePatch,
  ): Promise<void> {
    if (isEmptyPatch(patch)) return;
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(purchaseOrderLines)
      .set(patch)
      .where(and(eq(purchaseOrderLines.tenantId, tenantId), eq(purchaseOrderLines.id, id)));
  }

  async deleteLines(tx: Transaction, tenantId: string, ids: string[]): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (ids.length === 0) return;
    await tx
      .delete(purchaseOrderLines)
      .where(and(eq(purchaseOrderLines.tenantId, tenantId), inArray(purchaseOrderLines.id, ids)));
  }

  /** A purchase's items in the order they were entered. */
  async listLines(tx: Transaction, tenantId: string, orderId: string): Promise<PurchaseLineRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({
        line: purchaseOrderLines,
        productName: products.name,
        combinationKey: productVariants.combinationKey,
        stockUnit: products.stockUnit,
      })
      .from(purchaseOrderLines)
      .leftJoin(
        products,
        and(
          eq(products.tenantId, purchaseOrderLines.tenantId),
          eq(products.id, purchaseOrderLines.productId),
        ),
      )
      .leftJoin(
        productVariants,
        and(
          eq(productVariants.tenantId, purchaseOrderLines.tenantId),
          eq(productVariants.id, purchaseOrderLines.variantId),
        ),
      )
      .where(
        and(
          eq(purchaseOrderLines.tenantId, tenantId),
          eq(purchaseOrderLines.purchaseOrderId, orderId),
        ),
      )
      .orderBy(asc(purchaseOrderLines.position));
    return rows.map((row) => ({
      ...row.line,
      productName: row.productName,
      combinationKey: row.combinationKey,
      stockUnit: row.stockUnit,
    }));
  }

  /** The shop's purchases, newest first, optionally of one status or one supplier, each with its totals. */
  async listOrders(
    tx: Transaction,
    tenantId: string,
    filter: { status: PurchaseStatus | null; supplierId: string | null },
    page: { offset: number; limit: number },
  ): Promise<{ rows: PurchaseOrderSummaryRow[]; total: number }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const conditions = [eq(purchaseOrders.tenantId, tenantId)];
    if (filter.status !== null) conditions.push(eq(purchaseOrders.status, filter.status));
    if (filter.supplierId !== null)
      conditions.push(eq(purchaseOrders.supplierId, filter.supplierId));
    const where = and(...conditions);
    const rows = await tx
      .select({
        order: purchaseOrders,
        supplierName: suppliers.name,
        items: sql<number>`count(${purchaseOrderLines.id})::int`,
        total: sql<string>`coalesce(sum(${lineTotal}), 0)::numeric(14, 2)::text`,
        unknownCost: sql<number>`count(${purchaseOrderLines.id}) FILTER (WHERE ${purchaseOrderLines.unitCost} IS NULL)::int`,
      })
      .from(purchaseOrders)
      .leftJoin(
        suppliers,
        and(
          eq(suppliers.tenantId, purchaseOrders.tenantId),
          eq(suppliers.id, purchaseOrders.supplierId),
        ),
      )
      .leftJoin(
        purchaseOrderLines,
        and(
          eq(purchaseOrderLines.tenantId, purchaseOrders.tenantId),
          eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id),
        ),
      )
      .where(where)
      .groupBy(purchaseOrders.id, suppliers.name)
      .orderBy(desc(purchaseOrders.createdAt), desc(purchaseOrders.id))
      .offset(page.offset)
      .limit(page.limit);
    const counted = await tx.select({ total: count() }).from(purchaseOrders).where(where);
    return {
      rows: rows.map((row) => ({
        ...row.order,
        supplierName: row.supplierName,
        items: row.items,
        total: row.total,
        unknownCost: row.unknownCost,
      })),
      total: counted[0]?.total ?? 0,
    };
  }

  /** PUR-05: what each of these purchases orders, and still awaits, in each stock unit. */
  async unitsOf(
    tx: Transaction,
    tenantId: string,
    purchaseOrderIds: string[],
  ): Promise<PurchaseUnitsRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (purchaseOrderIds.length === 0) return [];
    return tx
      .select({
        purchaseOrderId: purchaseOrderLines.purchaseOrderId,
        stockUnit: products.stockUnit,
        ordered: sql<string>`sum(${purchaseOrderLines.quantityOrdered})::numeric(14, 3)::text`,
        outstanding: sql<string>`sum(${OUTSTANDING})::numeric(14, 3)::text`,
      })
      .from(purchaseOrderLines)
      .leftJoin(
        productVariants,
        and(
          eq(productVariants.tenantId, purchaseOrderLines.tenantId),
          eq(productVariants.id, purchaseOrderLines.variantId),
        ),
      )
      .leftJoin(
        products,
        and(
          eq(products.tenantId, productVariants.tenantId),
          eq(products.id, productVariants.productId),
        ),
      )
      .where(
        and(
          eq(purchaseOrderLines.tenantId, tenantId),
          inArray(purchaseOrderLines.purchaseOrderId, purchaseOrderIds),
        ),
      )
      .groupBy(purchaseOrderLines.purchaseOrderId, products.stockUnit)
      .orderBy(asc(products.stockUnit));
  }

  /**
   * PUR-05: what the shop's placed, open purchases still await, in each stock unit, and from how many purchases (those
   * with something still to come).
   */
  async coming(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ units: { stockUnit: StockUnit | null; quantity: string }[]; purchases: number }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const open = and(
      eq(purchaseOrderLines.tenantId, tenantId),
      inArray(purchaseOrders.status, OPEN_STATUSES),
      sql`${OUTSTANDING} > 0`,
    );
    const units = await tx
      .select({
        stockUnit: products.stockUnit,
        quantity: sql<string>`sum(${OUTSTANDING})::numeric(14, 3)::text`,
      })
      .from(purchaseOrderLines)
      .innerJoin(
        purchaseOrders,
        and(
          eq(purchaseOrders.tenantId, purchaseOrderLines.tenantId),
          eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId),
        ),
      )
      .leftJoin(
        productVariants,
        and(
          eq(productVariants.tenantId, purchaseOrderLines.tenantId),
          eq(productVariants.id, purchaseOrderLines.variantId),
        ),
      )
      .leftJoin(
        products,
        and(
          eq(products.tenantId, productVariants.tenantId),
          eq(products.id, productVariants.productId),
        ),
      )
      .where(open)
      .groupBy(products.stockUnit)
      .orderBy(asc(products.stockUnit));
    const purchases = await tx
      .select({ total: sql<number>`count(DISTINCT ${purchaseOrderLines.purchaseOrderId})::int` })
      .from(purchaseOrderLines)
      .innerJoin(
        purchaseOrders,
        and(
          eq(purchaseOrders.tenantId, purchaseOrderLines.tenantId),
          eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId),
        ),
      )
      .where(open);
    return { units, purchases: purchases[0]?.total ?? 0 };
  }

  /**
   * PUR-05: each variant's incoming stock, what is ordered and not yet received on placed, open purchases. A variant
   * with none is left out.
   */
  async incoming(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<{ variantId: string; incoming: string }[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (variantIds.length === 0) return [];
    return tx
      .select({
        variantId: purchaseOrderLines.variantId,
        incoming: sql<string>`sum(${OUTSTANDING})::numeric(14, 3)::text`,
      })
      .from(purchaseOrderLines)
      .innerJoin(
        purchaseOrders,
        and(
          eq(purchaseOrders.tenantId, purchaseOrderLines.tenantId),
          eq(purchaseOrders.id, purchaseOrderLines.purchaseOrderId),
        ),
      )
      .where(
        and(
          eq(purchaseOrderLines.tenantId, tenantId),
          inArray(purchaseOrderLines.variantId, variantIds),
          inArray(purchaseOrders.status, OPEN_STATUSES),
        ),
      )
      .groupBy(purchaseOrderLines.variantId)
      .having(sql`sum(${OUTSTANDING}) > 0`);
  }

  /** LIF-19: a lapsed shop's purchases, their items and its counter, at day 60. */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(sql`SELECT set_config('app.erasing_tenant', ${tenantId}, true)`);
    await tx.delete(purchaseOrderLines).where(eq(purchaseOrderLines.tenantId, tenantId));
    await tx.delete(purchaseOrders).where(eq(purchaseOrders.tenantId, tenantId));
    await tx.delete(purchaseCounters).where(eq(purchaseCounters.tenantId, tenantId));
  }
}
