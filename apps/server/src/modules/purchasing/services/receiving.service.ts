import { Inject, Injectable } from '@nestjs/common';
import type { StockVariantRow, Transaction } from '@lytronix/db';
import {
  AuditAction,
  FieldProblemCode,
  MEASURED_STOCK_UNITS,
  PurchaseStatus,
  ServerFieldProblemCode,
  StockReason,
  StockTracking,
  type ClosePurchaseInput,
  type PurchaseHistoryQuery,
  type ReceivePurchaseInput,
} from '@lytronix/validators';
import { ApiError, FieldsError, type InvalidField } from '../../../common/api-error';
import { PurchaseRefused } from '../../../common/errors/purchase-refused';
import type { CatalogueTransactions } from '../../catalogue/ports/catalogue-stores';
import { CatalogueActivity, type ResolvedActor } from '../../catalogue/services/catalogue-activity';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import type { StockArrival, StockArrivals } from '../../inventory/ports/stock-arrivals';
import { batchChoiceOf } from '../../inventory/services/batch-choice';
import { InventoryLedger } from '../../inventory/services/inventory-ledger';
import { SerialEntryService } from '../../inventory/services/serial-entry.service';
import { milli, quantityOf } from '../../inventory/services/stock-state';
import type { StockChange } from '../../inventory/types/inventory';
import type { PurchaseOrderStore } from '../ports/purchase-order-store';
import type { PurchaseReceiptStore } from '../ports/purchase-receipt-store';
import { PURCHASE_ORDER_STORE, PURCHASE_RECEIPT_STORE } from '../tokens';
import type {
  PurchaseHistoryPage,
  PurchaseLineRow,
  PurchaseOrderRow,
  PurchaseOrderView,
} from '../types/purchasing';
import { PurchaseOrderService } from './purchase-order.service';
import { SupplierService } from './supplier.service';

// PUR-04: a purchase placed with the supplier and still to be delivered.
const OPEN: readonly PurchaseStatus[] = [PurchaseStatus.Ordered, PurchaseStatus.PartiallyReceived];
// What a receipt's movements name as the record behind them (INV-09).
const RECEIPT_REFERENCE = 'purchase_receipt';

/** What one delivery brings for one item, checked, ready to record. */
interface Delivery {
  line: PurchaseLineRow;
  accepted: string;
  rejected: string;
  rejectReason: string | null;
  unitCost: string | null;
  batch: Pick<StockChange, 'batch' | 'batchId'>;
  serials: string[];
}

/** PUR-04: whether an item's variant may still take stock: its product live, tracked, and holding stock this way. */
function receivable(variant: StockVariantRow, line: PurchaseLineRow): boolean {
  return (
    variant.productId === line.productId &&
    variant.product.deletedAt === null &&
    variant.product.stockTracking === StockTracking.Tracked &&
    variant.isStockHolder === variant.product.sharedStock
  );
}

/**
 * PUR-04, UOM-03, INV-12, INV-14: why one item of a delivery cannot be received, as the field it is answered on and
 * why; null if it can. Its product still takes stock this way, it brings no more than is still to come, in whole units
 * unless measured, and a batch and serials only for units accepted into a product that keeps them.
 */
function refusalOf(
  item: ReceivePurchaseInput['items'][number],
  line: PurchaseLineRow,
  variant: StockVariantRow,
): { at: string; messageKey: InvalidField['messageKey'] } | null {
  if (!receivable(variant, line)) return { at: 'itemId', messageKey: 'PurchaseItemChanged' };
  if (
    milli(item.accepted) + milli(item.rejected) >
    milli(line.quantityOrdered) - milli(line.quantityReceived)
  ) {
    return { at: 'accepted', messageKey: 'MoreThanOutstanding' };
  }
  if (!MEASURED_STOCK_UNITS.includes(variant.product.stockUnit)) {
    if (!Number.isInteger(item.accepted)) return { at: 'accepted', messageKey: 'WholeUnitsOnly' };
    if (!Number.isInteger(item.rejected)) return { at: 'rejected', messageKey: 'WholeUnitsOnly' };
  }
  if (item.accepted === 0) {
    if (item.batchId !== undefined) return { at: 'batchId', messageKey: 'NothingAccepted' };
    if (item.batch !== undefined) return { at: 'batch', messageKey: 'NothingAccepted' };
    if (item.serials !== undefined) return { at: 'serials', messageKey: 'NothingAccepted' };
  }
  if (item.serials !== undefined && !variant.product.serialTracked) {
    return { at: 'serials', messageKey: 'SerialsNotTracked' };
  }
  return null;
}

/**
 * PUR-04 to PUR-10, INV-10: stock coming in against purchases. A delivery records, item by item, what was accepted
 * into stock (one purchase-receipt movement each, through the stock ledger, into a batch and with serials where the
 * product keeps them) and what was rejected and why, which stays outstanding. The database moves each item's received
 * quantity with its receipt line, never past what was ordered, and takes a receipt's unit cost into the average cost.
 * A purchase is received once every item is, closed short to drop what is still to come, and a receipt never changes.
 * Stock that arrives through the stock routes is recorded here too, as a purchase received in full (PUR-07).
 */
@Injectable()
export class ReceivingService implements StockArrivals {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(PURCHASE_ORDER_STORE) private readonly orders: PurchaseOrderStore,
    @Inject(PURCHASE_RECEIPT_STORE) private readonly receipts: PurchaseReceiptStore,
    @Inject(PurchaseOrderService) private readonly purchases: PurchaseOrderService,
    @Inject(SupplierService) private readonly suppliers: SupplierService,
    @Inject(InventoryLedger) private readonly ledger: InventoryLedger,
    @Inject(SerialEntryService) private readonly serialEntry: SerialEntryService,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  /** PUR-04: one delivery against a placed purchase, under the purchase's lock so two at once take turns. */
  async receive(
    tenantId: string,
    orderId: string,
    input: ReceivePurchaseInput,
    actor: CatalogueActor,
  ): Promise<PurchaseOrderView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const order = await this.locked(tx, tenantId, orderId);
      if (order.status === PurchaseStatus.Draft) {
        throw new ApiError('conflict', 'PlaceBeforeReceiving', {});
      }
      if (!OPEN.includes(order.status)) throw new ApiError('conflict', 'PurchaseFinished', {});
      const deliveries = await this.deliveriesOf(tx, tenantId, order, input);
      const receiptId = await this.record(tx, tenantId, order, deliveries, input.note ?? null, who);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.PurchaseReceived,
        { type: 'purchase', id: order.id },
        { number: order.number, receiptId, items: deliveries.length },
      );
      return this.purchases.view(tx, tenantId, order.id, true);
    });
  }

  /** PUR-06: a purchase with something delivered closed short: what is still to come is dropped, stock untouched. */
  async closeShort(
    tenantId: string,
    orderId: string,
    input: ClosePurchaseInput,
    actor: CatalogueActor,
  ): Promise<PurchaseOrderView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const order = await this.locked(tx, tenantId, orderId);
      if (order.status === PurchaseStatus.Draft) {
        throw new ApiError('conflict', 'PurchaseIsDraft', {});
      }
      if (!OPEN.includes(order.status)) throw new ApiError('conflict', 'PurchaseFinished', {});
      if ((await this.receipts.countForOrder(tx, tenantId, order.id)) === 0) {
        throw new ApiError('conflict', 'NothingReceivedCancelInstead', {});
      }
      const lines = await this.orders.listLines(tx, tenantId, order.id);
      await this.orders.updateOrder(tx, tenantId, order.id, {
        status: PurchaseStatus.ClosedShort,
        closeReason: input.reason,
      });
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.PurchaseClosedShort,
        { type: 'purchase', id: order.id },
        {
          number: order.number,
          reason: input.reason,
          dropped: lines.filter(
            (line) => milli(line.quantityReceived) < milli(line.quantityOrdered),
          ).length,
        },
      );
      return this.purchases.view(tx, tenantId, order.id, true);
    });
  }

  /**
   * PUR-09: a variant's deliveries, newest first: supplier, date, quantity and (with inventory:manage) unit cost of each.
   * A product sharing its stock is bought by its shared stock, so its history is the shared stock's.
   */
  history(
    tenantId: string,
    productId: string,
    variantId: string,
    query: PurchaseHistoryQuery,
    canSeeCost: boolean,
  ): Promise<PurchaseHistoryPage> {
    return this.transactions.run(async (tx) => {
      const [variant] = await this.orders.findVariants(tx, tenantId, [variantId]);
      if (
        !variant ||
        variant.productId !== productId ||
        variant.product.deletedAt !== null ||
        (variant.isStockHolder && !variant.product.sharedStock)
      ) {
        throw new ApiError('not_found', 'ProductNotFound', {});
      }
      if (variant.product.sharedStock && !variant.isStockHolder) {
        throw new ApiError('conflict', 'StockIsShared', {});
      }
      const { rows, total } = await this.receipts.historyForVariant(tx, tenantId, variantId, {
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      });
      return {
        purchases: rows.map((row) => ({
          receiptId: row.receiptId,
          purchaseOrderId: row.purchaseOrderId,
          number: row.number,
          supplier: row.supplierId !== null ? { id: row.supplierId, name: row.supplierName } : null,
          receivedAt: row.receivedAt,
          accepted: row.quantityAccepted,
          rejected: row.quantityRejected,
          rejectReason: row.rejectReason,
          ...(canSeeCost ? { unitCost: row.unitCost } : {}),
        })),
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      };
    });
  }

  /**
   * PUR-07: stock that arrived through a stock route, recorded as a purchase placed and received in full in one step,
   * with the shop's next number and the supplier named (a typed name finds a live one or adds it). The level is locked
   * before the purchase counter, as a stock edit does, so the two never wait on each other in opposite orders.
   */
  async arrived(
    tx: Transaction,
    tenantId: string,
    arrival: StockArrival,
    who: ResolvedActor,
  ): Promise<void> {
    await this.orders.lockLevel(tx, tenantId, arrival.variantId);
    const supplier =
      arrival.supplier === null
        ? null
        : 'id' in arrival.supplier
          ? await this.suppliers.liveSupplier(tx, tenantId, arrival.supplier.id, 'supplierId')
          : await this.suppliers.namedSupplier(
              tx,
              tenantId,
              arrival.supplier.name,
              who,
              'supplierName',
            );
    const number = await this.orders.nextNumber(tx, tenantId);
    const orderId = await this.orders.insertOrder(tx, tenantId, {
      supplierId: supplier?.id ?? null,
      expectedOn: null,
      notes: null,
      status: PurchaseStatus.Ordered,
      number,
      orderedAt: new Date(),
    });
    await this.orders.insertLines(tx, tenantId, orderId, [
      {
        productId: arrival.productId,
        variantId: arrival.variantId,
        position: 0,
        quantityOrdered: arrival.quantity,
        unitCost: arrival.unitCost,
      },
    ]);
    const order = await this.locked(tx, tenantId, orderId);
    const [line] = await this.orders.listLines(tx, tenantId, orderId);
    if (!line) throw new Error('a purchase just made has no item');
    const receiptId = await this.record(
      tx,
      tenantId,
      order,
      [
        {
          line,
          accepted: arrival.quantity,
          rejected: quantityOf(0),
          rejectReason: null,
          unitCost: arrival.unitCost,
          batch: { batch: arrival.batch, batchId: arrival.batchId },
          serials: arrival.serials,
        },
      ],
      arrival.note,
      who,
    );
    await this.activity.record(
      tx,
      tenantId,
      who,
      AuditAction.PurchaseReceived,
      { type: 'purchase', id: orderId },
      { number, receiptId, items: 1, oneStep: true },
    );
  }

  // --- Building blocks ---

  private async locked(tx: Transaction, tenantId: string, id: string): Promise<PurchaseOrderRow> {
    const order = await this.orders.findOrder(tx, tenantId, id, true);
    if (!order) throw new ApiError('not_found', 'PurchaseNotFound', {});
    return order;
  }

  /** PUR-04: each item of the delivery checked against the purchase, refused item by item, then nothing is saved. */
  private async deliveriesOf(
    tx: Transaction,
    tenantId: string,
    order: PurchaseOrderRow,
    input: ReceivePurchaseInput,
  ): Promise<Delivery[]> {
    const lines = new Map(
      (await this.orders.listLines(tx, tenantId, order.id)).map((row) => [row.id, row]),
    );
    const variants = new Map(
      (
        await this.orders.findVariants(
          tx,
          tenantId,
          [...lines.values()].map((row) => row.variantId),
        )
      ).map((row) => [row.variantId, row]),
    );
    const problems: InvalidField[] = [];
    const checked: {
      item: ReceivePurchaseInput['items'][number];
      line: PurchaseLineRow;
      variant: StockVariantRow;
      field: string;
    }[] = [];
    input.items.forEach((item, index) => {
      const field = `items.${String(index)}`;
      const line = lines.get(item.itemId);
      if (!line) {
        problems.push({
          field: `${field}.itemId`,
          problem: ServerFieldProblemCode.NotFound,
          messageKey: 'PurchaseItemNotFound',
        });
        return;
      }
      const variant = variants.get(line.variantId);
      const refused = variant
        ? refusalOf(item, line, variant)
        : { at: 'itemId', messageKey: 'PurchaseItemChanged' as const };
      if (refused !== null) {
        problems.push({
          field: `${field}.${refused.at}`,
          problem: FieldProblemCode.NotAllowed,
          messageKey: refused.messageKey,
        });
      } else if (variant) {
        checked.push({ item, line, variant, field });
      }
    });
    if (problems.length > 0) throw new FieldsError(problems);
    const deliveries: Delivery[] = [];
    for (const { item, line, variant, field } of checked) {
      const arriving = item.accepted > 0;
      deliveries.push({
        line,
        accepted: quantityOf(milli(item.accepted)),
        rejected: quantityOf(milli(item.rejected)),
        rejectReason: item.rejected > 0 ? (item.rejectReason ?? null) : null,
        // PUR-04: the cost agreed on the item unless the delivery says otherwise; null is not known.
        unitCost: !arriving
          ? null
          : item.unitCost === undefined
            ? line.unitCost
            : item.unitCost === null
              ? null
              : item.unitCost.toFixed(4),
        batch: arriving ? batchChoiceOf(variant, item, true, field) : {},
        serials:
          arriving && variant.product.serialTracked
            ? await this.serialEntry.arriving(
                tx,
                tenantId,
                item.serials,
                variant.product.serialFormat,
                `${field}.serials`,
                item.accepted,
              )
            : [],
      });
    }
    return deliveries;
  }

  /**
   * PUR-04: a receipt and its lines, the accepted units moved into stock through the ledger (one purchase-receipt
   * movement per item, naming the receipt), and the purchase's status as its items now stand: received once every item
   * is, partly received once any has stock received, as it was after a delivery rejected in full.
   */
  private async record(
    tx: Transaction,
    tenantId: string,
    order: PurchaseOrderRow,
    deliveries: Delivery[],
    note: string | null,
    who: ResolvedActor,
  ): Promise<string> {
    const receiptId = await this.receipts.insertReceipt(tx, tenantId, {
      purchaseOrderId: order.id,
      actorUserId: who.id,
      note,
    });
    const arriving = deliveries.filter((delivery) => milli(delivery.accepted) > 0);
    const movements = await this.ledger.apply(
      tx,
      tenantId,
      arriving.map((delivery) => ({
        variantId: delivery.line.variantId,
        delta: delivery.accepted,
        reason: StockReason.PurchaseReceipt,
        note,
        reference: { type: RECEIPT_REFERENCE, id: receiptId },
        unitCost: delivery.unitCost,
        ...delivery.batch,
        serials: delivery.serials,
      })),
      who,
    );
    // One movement per item arriving, and a purchase names each variant once.
    const moved = new Map(movements.map((movement) => [movement.variantId, movement]));
    try {
      await this.receipts.insertLines(
        tx,
        tenantId,
        receiptId,
        deliveries.map((delivery) => {
          const movement =
            milli(delivery.accepted) > 0 ? moved.get(delivery.line.variantId) : undefined;
          return {
            purchaseLineId: delivery.line.id,
            quantityAccepted: delivery.accepted,
            quantityRejected: delivery.rejected,
            rejectReason: delivery.rejectReason,
            unitCost: delivery.unitCost,
            batchId: movement?.batchId ?? null,
            movementId: movement?.id ?? null,
          };
        }),
      );
    } catch (error) {
      if (error instanceof PurchaseRefused && error.kind === 'outstanding') {
        throw new ApiError('conflict', 'MoreThanOutstanding', {});
      }
      throw error;
    }
    const lines = await this.orders.listLines(tx, tenantId, order.id);
    const status = lines.every(
      (line) => milli(line.quantityReceived) >= milli(line.quantityOrdered),
    )
      ? PurchaseStatus.Received
      : lines.some((line) => milli(line.quantityReceived) > 0)
        ? PurchaseStatus.PartiallyReceived
        : order.status;
    if (status !== order.status) {
      await this.orders.updateOrder(tx, tenantId, order.id, { status });
    }
    return receiptId;
  }
}
