import type { Transaction } from '@lytronix/db';
import type { StockCheckLineRow, StockCheckRow, StockCheckSummaryRow } from '../types/inventory';

/** One counted variant as a check stores it. */
export interface NewStockCheckLine {
  productId: string;
  variantId: string;
  /** INV-12: the batch counted; null for a variant counted as a whole. */
  batchId: string | null;
  expected: string;
  counted: string;
  unitCost: string | null;
  movementId: number | null;
}

/**
 * INV-07: a shop's stock checks and what each counted. A check is only ever recorded, never changed; the recount
 * movements behind it go through the stock ledger.
 */
export interface StockCheckStore {
  insertCheck(
    tx: Transaction,
    tenantId: string,
    values: { actorUserId: string | null; note: string | null },
  ): Promise<StockCheckRow>;
  insertLines(
    tx: Transaction,
    tenantId: string,
    checkId: string,
    lines: NewStockCheckLine[],
  ): Promise<void>;
  findCheck(tx: Transaction, tenantId: string, id: string): Promise<StockCheckRow | null>;
  listLines(tx: Transaction, tenantId: string, checkId: string): Promise<StockCheckLineRow[]>;
  listChecks(
    tx: Transaction,
    tenantId: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: StockCheckSummaryRow[]; total: number }>;
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
