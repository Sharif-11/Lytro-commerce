import { Inject, Injectable } from '@nestjs/common';
import type { CatalogueTransactions } from '../../catalogue/ports/catalogue-stores';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { StockCheckStore } from '../ports/stock-check-store';
import type { StockStore } from '../ports/stock-store';
import { STOCK_CHECK_STORE, STOCK_STORE } from '../tokens';

/**
 * LIF-19: the day-60 deletion job's inventory step: the shop's stock checks, movement ledger and stock levels. The
 * ledger is otherwise append-only (INV-03); the database lets this through only for a shop that is archived or
 * deleted. Runs before the catalogue's step, and is safe to run again.
 */
@Injectable()
export class InventoryEraser {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(STOCK_STORE) private readonly store: StockStore,
    @Inject(STOCK_CHECK_STORE) private readonly checks: StockCheckStore,
  ) {}

  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.transactions.run(async (tx) => {
      await this.checks.deleteAllForTenant(tx, tenantId);
      await this.store.deleteAllForTenant(tx, tenantId);
    });
  }
}
