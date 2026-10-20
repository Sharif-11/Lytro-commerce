import { Inject, Injectable } from '@nestjs/common';
import type { CatalogueTransactions } from '../../catalogue/ports/catalogue-stores';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { PurchaseOrderStore } from '../ports/purchase-order-store';
import type { PurchaseReceiptStore } from '../ports/purchase-receipt-store';
import type { SupplierStore } from '../ports/supplier-store';
import { PURCHASE_ORDER_STORE, PURCHASE_RECEIPT_STORE, SUPPLIER_STORE } from '../tokens';

/**
 * LIF-19: the day-60 deletion job's purchasing step: the shop's receipts, purchases, their items, its purchase counter
 * and its suppliers. A receipt and a placed purchase are otherwise kept (PUR-02, PUR-08); the database lets this through
 * only for a shop that is archived or deleted. Runs before the inventory step, and is safe to run again.
 */
@Injectable()
export class PurchasingEraser {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(PURCHASE_RECEIPT_STORE) private readonly receipts: PurchaseReceiptStore,
    @Inject(PURCHASE_ORDER_STORE) private readonly orders: PurchaseOrderStore,
    @Inject(SUPPLIER_STORE) private readonly suppliers: SupplierStore,
  ) {}

  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.transactions.run(async (tx) => {
      await this.receipts.deleteAllForTenant(tx, tenantId);
      await this.orders.deleteAllForTenant(tx, tenantId);
      await this.suppliers.deleteAllForTenant(tx, tenantId);
    });
  }
}
