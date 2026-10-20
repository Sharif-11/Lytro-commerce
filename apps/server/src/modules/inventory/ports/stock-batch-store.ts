import type { Transaction } from '@lytronix/db';
import type {
  BatchExpiryNotice,
  NewStockBatch,
  StockBatchListRow,
  StockBatchRecord,
} from '../types/inventory';

/**
 * INV-12, INV-13: a shop's stock batches. A batch's quantity is only ever moved by a stock movement through the
 * ledger; this store opens batches, reads and locks them, and serves the daily expiry pass.
 */
export interface StockBatchStore {
  findBatches(tx: Transaction, tenantId: string, batchIds: string[]): Promise<StockBatchRecord[]>;
  /** A variant's open batches in the picking order, locked; lock the variant's level first. */
  lockOpenBatches(
    tx: Transaction,
    tenantId: string,
    variantId: string,
  ): Promise<StockBatchRecord[]>;
  insertBatch(tx: Transaction, tenantId: string, batch: NewStockBatch): Promise<StockBatchRecord>;
  listProductBatches(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<StockBatchListRow[]>;
  listShopBatches(
    tx: Transaction,
    tenantId: string,
    range: { from: string | null; until: string },
    page: { offset: number; limit: number },
  ): Promise<{ rows: StockBatchListRow[]; total: number }>;
  listUnnotified(
    tx: Transaction,
    tenantId: string,
    range: { from: string; until: string },
  ): Promise<StockBatchListRow[]>;
  markNotified(tx: Transaction, tenantId: string, batchIds: string[]): Promise<void>;
  /** Works each level's unsellable stock out again from its expired batches; the variants whose figure changed. */
  refreshUnsellable(tx: Transaction, tenantId: string): Promise<string[]>;
  /** Every shop not yet deleted, for the daily pass. */
  listShopIds(): Promise<string[]>;
}

/**
 * INV-13, D3-5: tells the shop a batch is about to expire, once per batch. A console stand-in until Phase 7's
 * notification module replaces the adapter; the once-per-batch rule is the expiry pass's.
 */
export interface BatchExpiryNotifier {
  expiringSoon(notice: BatchExpiryNotice): Promise<void>;
}
