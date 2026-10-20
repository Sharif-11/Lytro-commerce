import { Inject, Injectable } from '@nestjs/common';
import type { PurchaseStatus } from '@lytronix/validators';
import {
  PurchaseOrderRepository,
  PurchaseReceiptRepository,
  StockRepository,
  SupplierRepository,
  TransactionRunner,
  type PurchaseLinePatch,
  type PurchaseOrderPatch,
  type StockVariantRow,
  type SupplierPatch,
  type Transaction,
} from '@lytronix/db';
import { MissingReference } from '../../common/errors/missing-reference';
import { PurchaseRefused } from '../../common/errors/purchase-refused';
import { StockRefused } from '../../common/errors/stock-refused';
import { UniqueViolation } from '../../common/errors/unique-violation';
import type { PurchaseOrderStore } from '../../modules/purchasing/ports/purchase-order-store';
import type { PurchaseReceiptStore } from '../../modules/purchasing/ports/purchase-receipt-store';
import type { SupplierStore } from '../../modules/purchasing/ports/supplier-store';
import type {
  NewPurchaseLine,
  NewReceiptLine,
  PurchaseHistoryRow,
  PurchaseLineRow,
  PurchaseOrderRow,
  PurchaseOrderSummaryRow,
  PurchaseReceiptLineRow,
  PurchaseReceiptRow,
  SupplierRecord,
} from '../../modules/purchasing/types/purchasing';

// PUR-01: a live supplier already has the name, ignoring case (migration 0060).
const SUPPLIER_NAME_INDEX = 'suppliers_live_name_idx';
// PUR-02: what the purchase-line trigger and the supplier key refuse (migration 0060).
const WHOLE_UNITS_CHECK = 'stock_whole_units';
const SHARED_LINE_CHECK = 'purchase_lines_shared';
const LINE_VARIANT_KEY = 'purchase_lines_variant';
const SUPPLIER_KEY = 'purchase_orders_supplier_fk';
// PUR-04: what the receipt triggers refuse (migration 0061).
const OUTSTANDING_CHECK = 'purchase_receipt_lines_outstanding';
const OPEN_CHECK = 'purchase_receipts_open';

@Injectable()
export class DrizzleSupplierStore implements SupplierStore {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(SupplierRepository) private readonly suppliers: SupplierRepository,
  ) {}

  async insertSupplier(
    tx: Transaction,
    tenantId: string,
    values: Pick<SupplierRecord, 'name' | 'phone' | 'email' | 'address' | 'notes'>,
  ): Promise<SupplierRecord> {
    try {
      return await this.suppliers.insertSupplier(tx, { tenantId, ...values });
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, SUPPLIER_NAME_INDEX)) {
        throw new UniqueViolation('name');
      }
      throw error;
    }
  }

  insertSupplierIfFree(
    tx: Transaction,
    tenantId: string,
    values: Pick<SupplierRecord, 'name' | 'phone' | 'email' | 'address' | 'notes'>,
  ): Promise<SupplierRecord | null> {
    return this.suppliers.insertSupplierIfFree(tx, { tenantId, ...values });
  }

  findSupplier(tx: Transaction, tenantId: string, id: string): Promise<SupplierRecord | null> {
    return this.suppliers.findSupplier(tx, tenantId, id);
  }

  findLiveByName(tx: Transaction, tenantId: string, name: string): Promise<SupplierRecord | null> {
    return this.suppliers.findLiveByName(tx, tenantId, name);
  }

  async updateSupplier(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: SupplierPatch,
  ): Promise<SupplierRecord | null> {
    try {
      return await this.suppliers.updateSupplier(tx, tenantId, id, patch);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, SUPPLIER_NAME_INDEX)) {
        throw new UniqueViolation('name');
      }
      throw error;
    }
  }

  listSuppliers(
    tx: Transaction,
    tenantId: string,
    filter: { archived: boolean; search: string | null },
    page: { offset: number; limit: number },
  ): Promise<{ rows: SupplierRecord[]; total: number }> {
    return this.suppliers.listSuppliers(tx, tenantId, filter, page);
  }

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.suppliers.deleteAllForTenant(tx, tenantId);
  }
}

@Injectable()
export class DrizzlePurchaseOrderStore implements PurchaseOrderStore {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PurchaseOrderRepository) private readonly orders: PurchaseOrderRepository,
    @Inject(StockRepository) private readonly stock: StockRepository,
  ) {}

  findVariants(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<StockVariantRow[]> {
    return this.stock.findVariants(tx, tenantId, variantIds);
  }

  async lockLevel(tx: Transaction, tenantId: string, variantId: string): Promise<void> {
    await this.stock.lockLevel(tx, tenantId, variantId);
  }

  nextNumber(tx: Transaction, tenantId: string): Promise<number> {
    return this.orders.nextNumber(tx, tenantId);
  }

  async insertOrder(
    tx: Transaction,
    tenantId: string,
    values: Pick<PurchaseOrderRow, 'supplierId' | 'expectedOn' | 'notes'> &
      Partial<Pick<PurchaseOrderRow, 'status' | 'number' | 'orderedAt'>>,
  ): Promise<string> {
    try {
      return (await this.orders.insertOrder(tx, { tenantId, ...values })).id;
    } catch (error) {
      this.refuse(error);
    }
  }

  findOrder(
    tx: Transaction,
    tenantId: string,
    id: string,
    lock: boolean,
  ): Promise<PurchaseOrderRow | null> {
    return this.orders.findOrder(tx, tenantId, id, lock);
  }

  async updateOrder(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: PurchaseOrderPatch,
  ): Promise<void> {
    try {
      await this.orders.updateOrder(tx, tenantId, id, patch);
    } catch (error) {
      this.refuse(error);
    }
  }

  deleteOrder(tx: Transaction, tenantId: string, id: string): Promise<void> {
    return this.orders.deleteOrder(tx, tenantId, id);
  }

  async insertLines(
    tx: Transaction,
    tenantId: string,
    orderId: string,
    lines: NewPurchaseLine[],
  ): Promise<void> {
    try {
      await this.orders.insertLines(
        tx,
        tenantId,
        lines.map((line) => ({ tenantId, purchaseOrderId: orderId, ...line })),
      );
    } catch (error) {
      this.refuse(error);
    }
  }

  async updateLine(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: PurchaseLinePatch,
  ): Promise<void> {
    try {
      await this.orders.updateLine(tx, tenantId, id, patch);
    } catch (error) {
      this.refuse(error);
    }
  }

  deleteLines(tx: Transaction, tenantId: string, ids: string[]): Promise<void> {
    return this.orders.deleteLines(tx, tenantId, ids);
  }

  listLines(tx: Transaction, tenantId: string, orderId: string): Promise<PurchaseLineRow[]> {
    return this.orders.listLines(tx, tenantId, orderId);
  }

  listOrders(
    tx: Transaction,
    tenantId: string,
    filter: { status: PurchaseStatus | null; supplierId: string | null },
    page: { offset: number; limit: number },
  ): Promise<{ rows: PurchaseOrderSummaryRow[]; total: number }> {
    return this.orders.listOrders(tx, tenantId, filter, page);
  }

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.orders.deleteAllForTenant(tx, tenantId);
  }

  /** Throws what the database refused, by kind; anything else as it came. */
  private refuse(error: unknown): never {
    if (this.transactions.isCheckViolation(error, WHOLE_UNITS_CHECK)) {
      throw new StockRefused('whole_units');
    }
    if (this.transactions.isCheckViolation(error, SHARED_LINE_CHECK)) {
      throw new StockRefused('shared');
    }
    if (this.transactions.isForeignKeyViolation(error, LINE_VARIANT_KEY)) {
      throw new MissingReference('variant');
    }
    if (this.transactions.isForeignKeyViolation(error, SUPPLIER_KEY)) {
      throw new MissingReference('supplier');
    }
    throw error;
  }
}

@Injectable()
export class DrizzlePurchaseReceiptStore implements PurchaseReceiptStore {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PurchaseReceiptRepository) private readonly receipts: PurchaseReceiptRepository,
  ) {}

  async insertReceipt(
    tx: Transaction,
    tenantId: string,
    values: { purchaseOrderId: string; actorUserId: string | null; note: string | null },
  ): Promise<string> {
    try {
      return (await this.receipts.insertReceipt(tx, { tenantId, ...values })).id;
    } catch (error) {
      if (this.transactions.isCheckViolation(error, OPEN_CHECK)) {
        throw new PurchaseRefused('not_open');
      }
      throw error;
    }
  }

  async insertLines(
    tx: Transaction,
    tenantId: string,
    receiptId: string,
    lines: NewReceiptLine[],
  ): Promise<void> {
    try {
      await this.receipts.insertLines(
        tx,
        tenantId,
        lines.map((line) => ({ tenantId, receiptId, ...line })),
      );
    } catch (error) {
      if (this.transactions.isCheckViolation(error, OUTSTANDING_CHECK)) {
        throw new PurchaseRefused('outstanding');
      }
      if (this.transactions.isCheckViolation(error, WHOLE_UNITS_CHECK)) {
        throw new StockRefused('whole_units');
      }
      throw error;
    }
  }

  countForOrder(tx: Transaction, tenantId: string, orderId: string): Promise<number> {
    return this.receipts.countForOrder(tx, tenantId, orderId);
  }

  listForOrder(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<{ receipts: PurchaseReceiptRow[]; lines: PurchaseReceiptLineRow[] }> {
    return this.receipts.listForOrder(tx, tenantId, orderId);
  }

  historyForVariant(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: PurchaseHistoryRow[]; total: number }> {
    return this.receipts.historyForVariant(tx, tenantId, variantId, page);
  }

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.receipts.deleteAllForTenant(tx, tenantId);
  }
}
