import { Inject, Injectable } from '@nestjs/common';
import type { CatalogueTransactions } from '../../catalogue/ports/catalogue-stores';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { PurchaseOrderStore } from '../ports/purchase-order-store';
import type { SupplierStore } from '../ports/supplier-store';
import { PURCHASE_ORDER_STORE, SUPPLIER_STORE } from '../tokens';

/**
 * LIF-19: the day-60 deletion job's purchasing step: the shop's purchases, their items, its purchase counter and its
 * suppliers. A placed purchase is otherwise kept (PUR-02); the database lets this through only for a shop that is
 * archived or deleted. Runs before the inventory step, and is safe to run again.
 */
@Injectable()
export class PurchasingEraser {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(PURCHASE_ORDER_STORE) private readonly orders: PurchaseOrderStore,
    @Inject(SUPPLIER_STORE) private readonly suppliers: SupplierStore,
  ) {}

  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.transactions.run(async (tx) => {
      await this.orders.deleteAllForTenant(tx, tenantId);
      await this.suppliers.deleteAllForTenant(tx, tenantId);
    });
  }
}
