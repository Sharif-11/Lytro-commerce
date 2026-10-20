import { Inject, Injectable } from '@nestjs/common';
import type { PurchaseOrderPatch, StockVariantRow, Transaction } from '@lytronix/db';
import {
  AuditAction,
  FieldProblemCode,
  MEASURED_STOCK_UNITS,
  PurchaseStatus,
  ServerFieldProblemCode,
  StockTracking,
  STOCK_HOLDER_KEY,
  type CreatePurchaseOrderInput,
  type PurchaseOrderListQuery,
  type UpdatePurchaseOrderInput,
} from '@lytronix/validators';
import { ApiError, FieldsError, type InvalidField } from '../../../common/api-error';
import { MissingReference } from '../../../common/errors/missing-reference';
import { StockRefused } from '../../../common/errors/stock-refused';
import { fromPaisa, quantityTimesCost } from '../../balance/services/money';
import type { CatalogueTransactions } from '../../catalogue/ports/catalogue-stores';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import { optionIdsOfKey } from '../../catalogue/services/variant-matrix';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import { milli, quantityOf } from '../../inventory/services/stock-state';
import type { PurchaseOrderStore } from '../ports/purchase-order-store';
import type { PurchaseReceiptStore } from '../ports/purchase-receipt-store';
import { PURCHASE_ORDER_STORE, PURCHASE_RECEIPT_STORE } from '../tokens';
import type {
  NewPurchaseLine,
  PurchaseItemView,
  PurchaseLineRow,
  PurchaseOrderPage,
  PurchaseOrderRow,
  PurchaseOrderView,
} from '../types/purchasing';
import { SupplierService } from './supplier.service';

// PUR-02: a purchase that has ended, received in full, closed short or cancelled, never changes again.
const FINISHED: readonly PurchaseStatus[] = [
  PurchaseStatus.Received,
  PurchaseStatus.ClosedShort,
  PurchaseStatus.Cancelled,
];

/** One item as entered or as stored: the variant and how much of it. */
interface ItemEntry {
  variantId: string;
  quantity: number;
}

function supplierOf(order: PurchaseOrderRow): PurchaseOrderView['supplier'] {
  return order.supplierId !== null ? { id: order.supplierId, name: order.supplierName } : null;
}

function itemView(row: PurchaseLineRow, canSeeCost: boolean): PurchaseItemView {
  const outstanding = Math.max(milli(row.quantityOrdered) - milli(row.quantityReceived), 0);
  return {
    id: row.id,
    productId: row.productId,
    variantId: row.variantId,
    productName: row.productName,
    // A shared stock is named by its product alone.
    optionIds:
      row.combinationKey !== null && row.combinationKey !== STOCK_HOLDER_KEY
        ? optionIdsOfKey(row.combinationKey)
        : [],
    sharedStock: row.combinationKey === STOCK_HOLDER_KEY,
    stockUnit: row.stockUnit,
    quantityOrdered: row.quantityOrdered,
    quantityReceived: row.quantityReceived,
    outstanding: quantityOf(outstanding),
    ...(canSeeCost
      ? {
          unitCost: row.unitCost,
          total:
            row.unitCost !== null
              ? fromPaisa(quantityTimesCost(row.quantityOrdered, row.unitCost))
              : null,
        }
      : {}),
  };
}

/**
 * PUR-02, PUR-03, PUR-05, PUR-10, INV-20: the shop's purchases from its suppliers. A purchase starts as a draft with
 * no number, which may be changed freely or deleted; placing it with the supplier gives it the shop's next number,
 * gap-free. Its items still change until the first delivery is received, and a placed purchase with nothing received
 * may be cancelled. What is ordered and not yet received on a placed, open purchase is the variant's incoming stock.
 * Costs are shown only to a caller who may see cost (D3-9). Each change is in the activity log with its number.
 */
@Injectable()
export class PurchaseOrderService {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(PURCHASE_ORDER_STORE) private readonly orders: PurchaseOrderStore,
    @Inject(PURCHASE_RECEIPT_STORE) private readonly receipts: PurchaseReceiptStore,
    @Inject(SupplierService) private readonly suppliers: SupplierService,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  list(
    tenantId: string,
    query: PurchaseOrderListQuery,
    canSeeCost: boolean,
  ): Promise<PurchaseOrderPage> {
    return this.transactions.run(async (tx) => {
      const { rows, total } = await this.orders.listOrders(
        tx,
        tenantId,
        { status: query.status ?? null, supplierId: query.supplierId ?? null },
        { offset: (query.page - 1) * query.limit, limit: query.limit },
      );
      return {
        purchaseOrders: rows.map((row) => ({
          id: row.id,
          number: row.number,
          status: row.status,
          supplier: supplierOf(row),
          expectedOn: row.expectedOn,
          createdAt: row.createdAt,
          orderedAt: row.orderedAt,
          items: row.items,
          ...(canSeeCost ? { total: row.total, unknownCost: row.unknownCost } : {}),
        })),
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      };
    });
  }

  get(tenantId: string, id: string, canSeeCost: boolean): Promise<PurchaseOrderView> {
    return this.transactions.run((tx) => this.view(tx, tenantId, id, canSeeCost));
  }

  /** PUR-02: a new purchase, saved as a draft. */
  async create(
    tenantId: string,
    input: CreatePurchaseOrderInput,
    actor: CatalogueActor,
  ): Promise<PurchaseOrderView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      if (input.supplierId) {
        await this.suppliers.liveSupplier(tx, tenantId, input.supplierId, 'supplierId');
      }
      const lines = await this.linesOf(tx, tenantId, input.items);
      const id = await this.written(() =>
        this.orders.insertOrder(tx, tenantId, {
          supplierId: input.supplierId ?? null,
          expectedOn: input.expectedOn ?? null,
          notes: input.notes ?? null,
        }),
      );
      await this.written(() => this.orders.insertLines(tx, tenantId, id, lines));
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.PurchaseCreated,
        { type: 'purchase', id },
        { items: lines.length },
      );
      return this.view(tx, tenantId, id, true);
    });
  }

  /**
   * PUR-02: a purchase's details and items. The items (the whole list, a kept one matched by its variant) and the
   * supplier change until the first delivery is received; after it only the expected date and notes do.
   */
  async update(
    tenantId: string,
    id: string,
    input: UpdatePurchaseOrderInput,
    actor: CatalogueActor,
  ): Promise<PurchaseOrderView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const order = await this.locked(tx, tenantId, id);
      if (FINISHED.includes(order.status)) {
        throw new ApiError('conflict', 'PurchaseFinished', {});
      }
      const stored = await this.orders.listLines(tx, tenantId, id);
      if (
        (input.items !== undefined ||
          (input.supplierId !== undefined && input.supplierId !== order.supplierId)) &&
        (await this.hasDeliveries(tx, tenantId, order, stored))
      ) {
        throw new ApiError('conflict', 'PurchaseHasDeliveries', {});
      }
      const patch: PurchaseOrderPatch = {};
      const changed: string[] = [];
      if (input.supplierId !== undefined && input.supplierId !== order.supplierId) {
        if (input.supplierId !== null) {
          await this.suppliers.liveSupplier(tx, tenantId, input.supplierId, 'supplierId');
        }
        patch.supplierId = input.supplierId;
        changed.push('supplierId');
      }
      if (input.expectedOn !== undefined && input.expectedOn !== order.expectedOn) {
        patch.expectedOn = input.expectedOn;
        changed.push('expectedOn');
      }
      if (input.notes !== undefined && input.notes !== order.notes) {
        patch.notes = input.notes;
        changed.push('notes');
      }
      if (input.items !== undefined) {
        await this.replaceLines(tx, tenantId, id, stored, input.items);
        changed.push('items');
      }
      if (changed.length > 0) {
        await this.written(() => this.orders.updateOrder(tx, tenantId, id, patch));
        await this.activity.record(
          tx,
          tenantId,
          who,
          AuditAction.PurchaseUpdated,
          { type: 'purchase', id },
          { number: order.number, changed },
        );
      }
      return this.view(tx, tenantId, id, true);
    });
  }

  /**
   * PUR-02, PUR-03: a draft placed with the supplier. It takes the shop's next number, under the counter's lock, so two
   * purchases placed at once get consecutive numbers. Its items and supplier are checked again, since a product may
   * have changed while it was a draft.
   */
  async place(tenantId: string, id: string, actor: CatalogueActor): Promise<PurchaseOrderView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const order = await this.locked(tx, tenantId, id);
      if (order.status !== PurchaseStatus.Draft) {
        throw new ApiError('conflict', 'PurchaseAlreadyPlaced', {});
      }
      const stored = await this.orders.listLines(tx, tenantId, id);
      await this.checkItems(
        tx,
        tenantId,
        stored.map((row) => ({ variantId: row.variantId, quantity: Number(row.quantityOrdered) })),
        'conflict',
      );
      if (order.supplierId !== null) {
        await this.suppliers.liveSupplier(tx, tenantId, order.supplierId, 'supplierId');
      }
      const number = await this.orders.nextNumber(tx, tenantId);
      await this.orders.updateOrder(tx, tenantId, id, {
        status: PurchaseStatus.Ordered,
        number,
        orderedAt: new Date(),
      });
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.PurchasePlaced,
        { type: 'purchase', id },
        { number },
      );
      return this.view(tx, tenantId, id, true);
    });
  }

  /** PUR-02: a placed purchase with nothing received, cancelled. A draft is deleted instead. */
  async cancel(tenantId: string, id: string, actor: CatalogueActor): Promise<PurchaseOrderView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const order = await this.locked(tx, tenantId, id);
      if (order.status === PurchaseStatus.Draft) {
        throw new ApiError('conflict', 'PurchaseIsDraft', {});
      }
      if (FINISHED.includes(order.status)) {
        throw new ApiError('conflict', 'PurchaseFinished', {});
      }
      if (
        await this.hasDeliveries(tx, tenantId, order, await this.orders.listLines(tx, tenantId, id))
      ) {
        throw new ApiError('conflict', 'PurchaseCloseShortInstead', {});
      }
      await this.orders.updateOrder(tx, tenantId, id, { status: PurchaseStatus.Cancelled });
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.PurchaseCancelled,
        { type: 'purchase', id },
        { number: order.number },
      );
      return this.view(tx, tenantId, id, true);
    });
  }

  /** PUR-02: a draft deleted, with its items. A placed purchase is kept, and cancelled instead. */
  async remove(tenantId: string, id: string, actor: CatalogueActor): Promise<void> {
    const who = await this.activity.resolve(tenantId, actor);
    await this.transactions.run(async (tx) => {
      const order = await this.locked(tx, tenantId, id);
      if (order.status !== PurchaseStatus.Draft) {
        throw new ApiError('conflict', 'PurchasePlacedIsKept', {});
      }
      const items = (await this.orders.listLines(tx, tenantId, id)).length;
      await this.orders.deleteOrder(tx, tenantId, id);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.PurchaseDeleted,
        { type: 'purchase', id },
        { items },
      );
    });
  }

  // --- Building blocks ---

  private async locked(tx: Transaction, tenantId: string, id: string): Promise<PurchaseOrderRow> {
    const order = await this.orders.findOrder(tx, tenantId, id, true);
    if (!order) throw new ApiError('not_found', 'PurchaseNotFound', {});
    return order;
  }

  /**
   * Whether a delivery has been received on the purchase, even one rejected in full, after which its items and
   * supplier stay as they are, and it is closed short rather than cancelled.
   */
  private async hasDeliveries(
    tx: Transaction,
    tenantId: string,
    order: PurchaseOrderRow,
    lines: PurchaseLineRow[],
  ): Promise<boolean> {
    return (
      order.status === PurchaseStatus.PartiallyReceived ||
      lines.some((line) => milli(line.quantityReceived) > 0) ||
      (await this.receipts.countForOrder(tx, tenantId, order.id)) > 0
    );
  }

  /** The items entered, checked, as the purchase stores them in the order given. */
  private async linesOf(
    tx: Transaction,
    tenantId: string,
    items: CreatePurchaseOrderInput['items'],
  ): Promise<NewPurchaseLine[]> {
    const variants = await this.checkItems(tx, tenantId, items, 'validation_error');
    return items.map((item, position) => {
      const variant = variants.get(item.variantId);
      if (!variant) throw new Error('a checked item has no variant');
      return {
        productId: variant.productId,
        variantId: item.variantId,
        position,
        quantityOrdered: quantityOf(milli(item.quantity)),
        unitCost:
          item.unitCost === undefined || item.unitCost === null ? null : item.unitCost.toFixed(4),
      };
    });
  }

  /**
   * PUR-02, UOM-03, INV-02, INV-24: each item names a live, sold variant of a product whose stock is tracked, in whole
   * numbers unless the product is measured; a product sharing its stock is bought by its shared stock. Refused item by
   * item; `conflict` when a saved purchase no longer passes (it is being placed).
   */
  private async checkItems(
    tx: Transaction,
    tenantId: string,
    items: ItemEntry[],
    code: 'validation_error' | 'conflict',
  ): Promise<Map<string, StockVariantRow>> {
    const variants = new Map(
      (
        await this.orders.findVariants(
          tx,
          tenantId,
          items.map((item) => item.variantId),
        )
      ).map((row) => [row.variantId, row]),
    );
    const problems = items.flatMap((item, index): InvalidField[] => {
      const field = `items.${String(index)}`;
      const variant = variants.get(item.variantId);
      // INV-24: a stock holder is bought only while its product shares its stock.
      if (
        !variant ||
        variant.product.deletedAt !== null ||
        (variant.isStockHolder && !variant.product.sharedStock)
      ) {
        return [
          {
            field: `${field}.variantId`,
            problem: ServerFieldProblemCode.NotFound,
            messageKey: 'ProductNotFound',
          },
        ];
      }
      const notAllowed = (key: InvalidField['messageKey'], at = 'variantId'): InvalidField[] => [
        { field: `${field}.${at}`, problem: FieldProblemCode.NotAllowed, messageKey: key },
      ];
      if (variant.retired) return notAllowed('VariantRetired');
      if (variant.product.stockTracking !== StockTracking.Tracked) {
        return notAllowed('MadeToOrderHasNoStock');
      }
      if (variant.product.sharedStock && !variant.isStockHolder) return notAllowed('StockIsShared');
      if (
        !MEASURED_STOCK_UNITS.includes(variant.product.stockUnit) &&
        !Number.isInteger(item.quantity)
      ) {
        return notAllowed('WholeUnitsOnly', 'quantity');
      }
      return [];
    });
    if (problems.length > 0) throw new FieldsError(problems, code);
    return variants;
  }

  /** PUR-02: the items as they should now be. A kept item (same variant) keeps its id; the rest go or come. */
  private async replaceLines(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    stored: PurchaseLineRow[],
    items: CreatePurchaseOrderInput['items'],
  ): Promise<void> {
    const lines = await this.linesOf(tx, tenantId, items);
    const kept = new Map(stored.map((row) => [row.variantId, row]));
    const wanted = new Set(lines.map((line) => line.variantId));
    await this.orders.deleteLines(
      tx,
      tenantId,
      stored.filter((row) => !wanted.has(row.variantId)).map((row) => row.id),
    );
    for (const line of lines) {
      const row = kept.get(line.variantId);
      if (row) {
        await this.written(() =>
          this.orders.updateLine(tx, tenantId, row.id, {
            position: line.position,
            quantityOrdered: line.quantityOrdered,
            unitCost: line.unitCost,
          }),
        );
      }
    }
    await this.written(() =>
      this.orders.insertLines(
        tx,
        tenantId,
        orderId,
        lines.filter((line) => !kept.has(line.variantId)),
      ),
    );
  }

  /**
   * A write the database may still refuse, if a product changed between the check and the write: answered as the
   * check would have.
   */
  private async written<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof StockRefused && error.kind === 'whole_units') {
        throw new FieldsError([
          { field: 'items', problem: FieldProblemCode.NotAllowed, messageKey: 'WholeUnitsOnly' },
        ]);
      }
      if (error instanceof StockRefused && error.kind === 'shared') {
        throw new FieldsError([
          { field: 'items', problem: FieldProblemCode.NotAllowed, messageKey: 'StockIsShared' },
        ]);
      }
      if (error instanceof MissingReference && error.target === 'variant') {
        throw new FieldsError([
          {
            field: 'items',
            problem: ServerFieldProblemCode.NotFound,
            messageKey: 'ProductNotFound',
          },
        ]);
      }
      if (error instanceof MissingReference && error.target === 'supplier') {
        throw new FieldsError([
          {
            field: 'supplierId',
            problem: ServerFieldProblemCode.NotFound,
            messageKey: 'SupplierNotFound',
          },
        ]);
      }
      throw error;
    }
  }

  /** PUR-02, PUR-04: a purchase as the shop sees it, inside a transaction already open; its deliveries oldest first. */
  async view(
    tx: Transaction,
    tenantId: string,
    id: string,
    canSeeCost: boolean,
  ): Promise<PurchaseOrderView> {
    const order = await this.orders.findOrder(tx, tenantId, id, false);
    if (!order) throw new ApiError('not_found', 'PurchaseNotFound', {});
    const lines = await this.orders.listLines(tx, tenantId, id);
    const items = lines.map((row) => itemView(row, canSeeCost));
    const delivered = await this.receipts.listForOrder(tx, tenantId, id);
    // A delivery's items in the order the purchase lists them.
    const positions = new Map(lines.map((row) => [row.id, row.position]));
    const positionOf = (itemId: string): number => positions.get(itemId) ?? 0;
    const known = lines.filter((row) => row.unitCost !== null);
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      supplier: supplierOf(order),
      expectedOn: order.expectedOn,
      notes: order.notes,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      orderedAt: order.orderedAt,
      closeReason: order.closeReason,
      items,
      receipts: delivered.receipts.map((receipt) => ({
        id: receipt.id,
        receivedAt: receipt.receivedAt,
        actor:
          receipt.actorUserId !== null
            ? { userId: receipt.actorUserId, name: receipt.actorName }
            : null,
        note: receipt.note,
        items: delivered.lines
          .filter((line) => line.receiptId === receipt.id)
          .sort((a, b) => positionOf(a.purchaseLineId) - positionOf(b.purchaseLineId))
          .map((line) => ({
            itemId: line.purchaseLineId,
            accepted: line.quantityAccepted,
            rejected: line.quantityRejected,
            rejectReason: line.rejectReason,
            ...(canSeeCost ? { unitCost: line.unitCost } : {}),
            batch:
              line.batchId !== null
                ? { id: line.batchId, batchCode: line.batchCode, expiresOn: line.expiresOn }
                : null,
          })),
      })),
      ...(canSeeCost
        ? {
            total: fromPaisa(
              known.reduce(
                (sum, row) => sum + quantityTimesCost(row.quantityOrdered, row.unitCost ?? '0'),
                0n,
              ),
            ),
            unknownCost: lines.length - known.length,
          }
        : {}),
    };
  }
}
