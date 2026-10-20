import { Inject, Injectable } from '@nestjs/common';
import type { CatalogueTransactions } from '../../catalogue/ports/catalogue-stores';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { ReservationStore } from '../ports/reservation-store';
import type { SerialStore } from '../ports/serial-store';
import type { StockCheckStore } from '../ports/stock-check-store';
import type { StockStore } from '../ports/stock-store';
import { RESERVATION_STORE, SERIAL_STORE, STOCK_CHECK_STORE, STOCK_STORE } from '../tokens';

/**
 * LIF-19: the day-60 deletion job's inventory step: the shop's reservations, stock checks, serials, movement ledger,
 * batches and stock levels. The ledger is otherwise append-only (INV-03); the database lets this through only for a shop that is
 * archived or deleted. Runs before the catalogue's step, and is safe to run again.
 */
@Injectable()
export class InventoryEraser {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(STOCK_STORE) private readonly store: StockStore,
    @Inject(STOCK_CHECK_STORE) private readonly checks: StockCheckStore,
    @Inject(SERIAL_STORE) private readonly serials: SerialStore,
    @Inject(RESERVATION_STORE) private readonly reservations: ReservationStore,
  ) {}

  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.transactions.run(async (tx) => {
      // First: the catalogue's step deletes variants, which is refused while one is held for an order (INV-15).
      await this.reservations.deleteAllForTenant(tx, tenantId);
      await this.checks.deleteAllForTenant(tx, tenantId);
      await this.serials.deleteAllForTenant(tx, tenantId);
      await this.store.deleteAllForTenant(tx, tenantId);
    });
  }
}
