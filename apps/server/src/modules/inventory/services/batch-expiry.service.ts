import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import type { CatalogueTransactions } from '../../catalogue/ports/catalogue-stores';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { BatchExpiryNotifier, StockBatchStore } from '../ports/stock-batch-store';
import type { StockStore } from '../ports/stock-store';
import { BATCH_EXPIRY_NOTIFIER, STOCK_BATCH_STORE, STOCK_STORE } from '../tokens';
import { expiryWindow } from './batch.service';
import { InventoryLedger } from './inventory-ledger';
import { milli } from './stock-state';

/** What one daily pass did, for its log line and the tests. */
export interface ExpiryPassResult {
  shops: number;
  /** Variants whose unsellable stock changed. */
  refreshed: number;
  notices: number;
  /** INV-15: levels newly short of what they hold for orders, each told once. */
  shortNotices: number;
}

/**
 * INV-13: the daily expiry pass, for every shop not deleted. Expired batches' stock comes out of what is available (the
 * picking order never sells it whatever this does; this keeps the shown figures and the public stock state right at
 * the day boundary), and each batch with stock expiring within the warning window gets its one notice. Where expiry
 * left units held for orders with nothing sellable under them (INV-15), the shop is told once, until it recovers. Safe
 * to run again: a second pass on the same day changes nothing and sends nothing. One shop's failure never stops the
 * others.
 */
@Injectable()
export class BatchExpiryService {
  private readonly logger = new Logger('BatchExpiry');

  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(STOCK_STORE) private readonly stock: StockStore,
    @Inject(STOCK_BATCH_STORE) private readonly batches: StockBatchStore,
    @Inject(InventoryLedger) private readonly ledger: InventoryLedger,
    @Inject(BATCH_EXPIRY_NOTIFIER) private readonly notifier: BatchExpiryNotifier,
  ) {}

  async runDaily(now = new Date()): Promise<ExpiryPassResult> {
    const window = expiryWindow(now);
    const shops = await this.batches.listShopIds();
    let refreshed = 0;
    let notices = 0;
    let shortNotices = 0;
    for (const shopId of shops) {
      try {
        await this.transactions.run(async (tx) => {
          const changed = await this.batches.refreshUnsellable(tx, shopId);
          if (changed.length > 0) {
            const products = (await this.stock.findVariants(tx, shopId, changed)).map(
              (row) => row.productId,
            );
            await this.ledger.refresh(tx, shopId, [...new Set(products)], true);
            refreshed += changed.length;
          }
          const due = await this.batches.listUnnotified(tx, shopId, {
            from: window.today,
            until: window.until,
          });
          for (const batch of due) {
            await this.notifier.expiringSoon({
              tenantId: shopId,
              productId: batch.productId,
              productName: batch.productName,
              variantId: batch.variantId,
              batchId: batch.id,
              batchCode: batch.batchCode,
              expiresOn: batch.expiresOn ?? window.until,
              quantity: batch.quantity,
            });
          }
          await this.batches.markNotified(
            tx,
            shopId,
            due.map((batch) => batch.id),
          );
          notices += due.length;
          shortNotices += await this.tellShortfalls(tx, shopId);
        });
      } catch (error) {
        this.logger.error(`expiry pass failed for tenant ${shopId}`, error as Error);
      }
    }
    return { shops: shops.length, refreshed, notices, shortNotices };
  }

  /** INV-13, INV-15: one notice per level newly short of what it holds for orders; a recovered one is reset. */
  private async tellShortfalls(tx: Transaction, shopId: string): Promise<number> {
    const rows = await this.stock.listShortfalls(tx, shopId);
    const fresh = rows.filter((row) => milli(row.short) > 0 && !row.shortNotified);
    for (const row of fresh) {
      await this.notifier.heldStockExpired({
        tenantId: shopId,
        productId: row.productId,
        productName: row.productName,
        variantId: row.variantId,
        reserved: row.reserved,
        short: row.short,
      });
    }
    await this.stock.setShortNotified(
      tx,
      shopId,
      fresh.map((row) => row.variantId),
      true,
    );
    await this.stock.setShortNotified(
      tx,
      shopId,
      rows.filter((row) => milli(row.short) === 0).map((row) => row.variantId),
      false,
    );
    return fresh.length;
  }
}
