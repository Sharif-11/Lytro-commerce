import type { Transaction } from '@lytronix/db';
import type {
  LowStockNotice,
  MovementRecord,
  NewStockMovement,
  OutgoingRow,
  StockHistoryRow,
  StockValueRow,
  StockVariantRow,
  VariantStockRow,
} from '../types/inventory';

/**
 * INV-01, INV-03, INV-09, INV-10: a shop's stock levels and its movement ledger. A movement the database refuses
 * (stock below zero or below what is reserved, or a fraction of a whole-unit product) comes back as StockRefused.
 */
export interface StockStore {
  findVariants(tx: Transaction, tenantId: string, variantIds: string[]): Promise<StockVariantRow[]>;
  insertMovements(
    tx: Transaction,
    tenantId: string,
    rows: NewStockMovement[],
  ): Promise<MovementRecord[]>;
  listVariantStock(
    tx: Transaction,
    tenantId: string,
    productIds: string[],
  ): Promise<VariantStockRow[]>;
  lockLevel(tx: Transaction, tenantId: string, variantId: string): Promise<string>;
  setLowNotified(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
    notified: boolean,
  ): Promise<void>;
  listHistory(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: StockHistoryRow[]; total: number }>;
  hasReceipt(tx: Transaction, tenantId: string, variantId: string): Promise<boolean>;
  setAvgCost(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    avgCost: string | null,
  ): Promise<void>;
  /** INV-18: the stock held now, at average cost. */
  stockValue(tx: Transaction, tenantId: string): Promise<StockValueRow>;
  /** INV-18: the stock that left in a period, by reason, at the cost each movement recorded. */
  outgoingByReason(
    tx: Transaction,
    tenantId: string,
    period: { from: Date; to: Date },
  ): Promise<OutgoingRow[]>;
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}

/**
 * INV-08, D3-5: tells the shop a variant's stock is low, once per crossing. A console stand-in until Phase 7's
 * notification module (in-app and push) replaces the adapter; the once-per-crossing rule is the ledger's.
 */
export interface LowStockNotifier {
  lowStock(notice: LowStockNotice): Promise<void>;
}
