import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CatalogueTransactions } from '../../catalogue/ports/catalogue-stores';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { StockBatchStore } from '../ports/stock-batch-store';
import { STOCK_BATCH_STORE } from '../tokens';
import { ReservationService } from './reservation.service';

/** What one pass did, for its log line and the tests. */
export interface ReservationExpiryResult {
  shops: number;
  released: number;
}

/**
 * INV-16: the minute pass, for every shop not deleted: an order awaiting online payment whose time ran out lets go of
 * the stock it held. Safe to run again, or alongside a shipment: a reservation already resolved is left as it is. One
 * shop's failure never stops the others.
 */
@Injectable()
export class ReservationExpiryService {
  private readonly logger = new Logger('ReservationExpiry');

  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(STOCK_BATCH_STORE) private readonly batches: StockBatchStore,
    @Inject(ReservationService) private readonly reservations: ReservationService,
  ) {}

  async runTick(now = new Date()): Promise<ReservationExpiryResult> {
    const shops = await this.batches.listShopIds();
    let released = 0;
    for (const shopId of shops) {
      try {
        released += await this.transactions.run((tx) =>
          this.reservations.releaseDue(tx, shopId, now),
        );
      } catch (error) {
        this.logger.error(`reservation expiry failed for tenant ${shopId}`, error as Error);
      }
    }
    return { shops: shops.length, released };
  }
}
