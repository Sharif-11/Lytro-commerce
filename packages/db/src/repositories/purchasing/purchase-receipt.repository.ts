import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  purchaseOrderLines,
  purchaseOrders,
  purchaseReceiptLines,
  purchaseReceipts,
  stockBatches,
  suppliers,
  users,
  type InsertPurchaseReceiptLine,
  type SelectPurchaseReceipt,
  type SelectPurchaseReceiptLine,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

/** A delivery with who took it in. */
export interface PurchaseReceiptRow extends SelectPurchaseReceipt {
  actorName: string | null;
}

/** What a delivery brought for one item, with the batch it landed in (INV-12). */
export interface PurchaseReceiptLineRow extends SelectPurchaseReceiptLine {
  batchCode: string | null;
  expiresOn: string | null;
}

/** PUR-09: one delivery of a variant, as its purchase history shows it. */
export interface PurchaseHistoryRow {
  receiptId: string;
  purchaseOrderId: string;
  number: number | null;
  supplierId: string | null;
  supplierName: string | null;
  receivedAt: Date;
  quantityAccepted: string;
  quantityRejected: string;
  rejectReason: string | null;
  unitCost: string | null;
}

// PUR-04, PUR-08, PUR-09: the deliveries a shop has received against its purchases. Every method sets the shop's
// tenant context. A receipt is only ever inserted (the database refuses a change); the trigger on its lines moves each
// item's received quantity, and the stock it brought in goes through the stock ledger, not through here.
export class PurchaseReceiptRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async insertReceipt(
    tx: Transaction,
    values: Pick<SelectPurchaseReceipt, 'tenantId' | 'purchaseOrderId' | 'actorUserId' | 'note'>,
  ): Promise<SelectPurchaseReceipt> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const [row] = await tx.insert(purchaseReceipts).values(values).returning();
    if (!row) throw new Error('insert returned no receipt row');
    return row;
  }

  async insertLines(
    tx: Transaction,
    tenantId: string,
    rows: InsertPurchaseReceiptLine[],
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (rows.length === 0) return;
    await tx.insert(purchaseReceiptLines).values(rows);
  }

  /** How many deliveries a purchase has had, rejected ones included. */
  async countForOrder(tx: Transaction, tenantId: string, orderId: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ total: count() })
      .from(purchaseReceipts)
      .where(
        and(eq(purchaseReceipts.tenantId, tenantId), eq(purchaseReceipts.purchaseOrderId, orderId)),
      );
    return row?.total ?? 0;
  }

  /** A purchase's deliveries, oldest first, and what each brought for each item. */
  async listForOrder(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<{ receipts: PurchaseReceiptRow[]; lines: PurchaseReceiptLineRow[] }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const receipts = await tx
      .select({ receipt: purchaseReceipts, actorName: users.name })
      .from(purchaseReceipts)
      .leftJoin(
        users,
        and(
          eq(users.tenantId, purchaseReceipts.tenantId),
          eq(users.id, purchaseReceipts.actorUserId),
        ),
      )
      .where(
        and(eq(purchaseReceipts.tenantId, tenantId), eq(purchaseReceipts.purchaseOrderId, orderId)),
      )
      .orderBy(asc(purchaseReceipts.receivedAt), asc(purchaseReceipts.id));
    const ids = receipts.map((row) => row.receipt.id);
    const lines =
      ids.length === 0
        ? []
        : await tx
            .select({
              line: purchaseReceiptLines,
              batchCode: stockBatches.batchCode,
              expiresOn: stockBatches.expiresOn,
            })
            .from(purchaseReceiptLines)
            .leftJoin(
              stockBatches,
              and(
                eq(stockBatches.tenantId, purchaseReceiptLines.tenantId),
                eq(stockBatches.id, purchaseReceiptLines.batchId),
              ),
            )
            .where(
              and(
                eq(purchaseReceiptLines.tenantId, tenantId),
                inArray(purchaseReceiptLines.receiptId, ids),
              ),
            );
    return {
      receipts: receipts.map((row) => ({ ...row.receipt, actorName: row.actorName })),
      lines: lines.map((row) => ({
        ...row.line,
        batchCode: row.batchCode,
        expiresOn: row.expiresOn,
      })),
    };
  }

  /** PUR-09: every delivery of a variant, newest first, with its purchase and supplier. */
  async historyForVariant(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: PurchaseHistoryRow[]; total: number }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const where = and(
      eq(purchaseReceiptLines.tenantId, tenantId),
      eq(purchaseOrderLines.variantId, variantId),
    );
    const item = and(
      eq(purchaseOrderLines.tenantId, purchaseReceiptLines.tenantId),
      eq(purchaseOrderLines.id, purchaseReceiptLines.purchaseLineId),
    );
    const rows = await tx
      .select({
        receiptId: purchaseReceipts.id,
        purchaseOrderId: purchaseOrders.id,
        number: purchaseOrders.number,
        supplierId: purchaseOrders.supplierId,
        supplierName: suppliers.name,
        receivedAt: purchaseReceipts.receivedAt,
        quantityAccepted: purchaseReceiptLines.quantityAccepted,
        quantityRejected: purchaseReceiptLines.quantityRejected,
        rejectReason: purchaseReceiptLines.rejectReason,
        unitCost: purchaseReceiptLines.unitCost,
      })
      .from(purchaseReceiptLines)
      .innerJoin(purchaseOrderLines, item)
      .innerJoin(
        purchaseReceipts,
        and(
          eq(purchaseReceipts.tenantId, purchaseReceiptLines.tenantId),
          eq(purchaseReceipts.id, purchaseReceiptLines.receiptId),
        ),
      )
      .innerJoin(
        purchaseOrders,
        and(
          eq(purchaseOrders.tenantId, purchaseReceipts.tenantId),
          eq(purchaseOrders.id, purchaseReceipts.purchaseOrderId),
        ),
      )
      .leftJoin(
        suppliers,
        and(
          eq(suppliers.tenantId, purchaseOrders.tenantId),
          eq(suppliers.id, purchaseOrders.supplierId),
        ),
      )
      .where(where)
      .orderBy(desc(purchaseReceipts.receivedAt), desc(purchaseReceipts.id))
      .offset(page.offset)
      .limit(page.limit);
    const counted = await tx
      .select({ total: count() })
      .from(purchaseReceiptLines)
      .innerJoin(purchaseOrderLines, item)
      .where(where);
    return { rows, total: counted[0]?.total ?? 0 };
  }

  /** LIF-19: a lapsed shop's deliveries and what each brought, at day 60, before its purchases. */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(sql`SELECT set_config('app.erasing_tenant', ${tenantId}, true)`);
    await tx.delete(purchaseReceiptLines).where(eq(purchaseReceiptLines.tenantId, tenantId));
    await tx.delete(purchaseReceipts).where(eq(purchaseReceipts.tenantId, tenantId));
  }
}
