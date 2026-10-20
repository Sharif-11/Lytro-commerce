import { Inject, Injectable } from '@nestjs/common';
import {
  StockBatchRepository,
  StockCheckRepository,
  StockRepository,
  TransactionRunner,
  type Transaction,
} from '@lytronix/db';
import { StockRefused } from '../../common/errors/stock-refused';
import { DatabaseService } from '../database.service';
import type {
  NewStockCheckLine,
  StockCheckStore,
} from '../../modules/inventory/ports/stock-check-store';
import type { StockBatchStore } from '../../modules/inventory/ports/stock-batch-store';
import type { StockStore } from '../../modules/inventory/ports/stock-store';
import type {
  MovementRecord,
  NewStockBatch,
  NewStockMovement,
  OutgoingRow,
  StockCheckLineRow,
  StockCheckRow,
  StockBatchListRow,
  StockBatchRecord,
  StockCheckSummaryRow,
  StockHistoryRow,
  StockValueRow,
  StockVariantRow,
  VariantStockRow,
} from '../../modules/inventory/types/inventory';

// The checks a movement can run into (INV-01, UOM-03), by what they protect.
const SHORTFALL_CHECKS = [
  'stock_levels_on_hand_check',
  'stock_levels_available_check',
  'stock_batches_quantity_check',
];
const WHOLE_UNITS_CHECK = 'stock_whole_units';

@Injectable()
export class DrizzleStockStore implements StockStore {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(StockRepository) private readonly stock: StockRepository,
  ) {}

  findVariants(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<StockVariantRow[]> {
    return this.stock.findVariants(tx, tenantId, variantIds);
  }

  findStockHolders(
    tx: Transaction,
    tenantId: string,
    productIds: string[],
  ): Promise<StockVariantRow[]> {
    return this.stock.findStockHolders(tx, tenantId, productIds);
  }

  async insertMovements(
    tx: Transaction,
    tenantId: string,
    rows: NewStockMovement[],
  ): Promise<MovementRecord[]> {
    try {
      return await this.stock.insertMovements(tx, tenantId, rows);
    } catch (error) {
      if (SHORTFALL_CHECKS.some((check) => this.transactions.isCheckViolation(error, check))) {
        throw new StockRefused('shortfall');
      }
      if (this.transactions.isCheckViolation(error, WHOLE_UNITS_CHECK)) {
        throw new StockRefused('whole_units');
      }
      throw error;
    }
  }

  listVariantStock(
    tx: Transaction,
    tenantId: string,
    productIds: string[],
  ): Promise<VariantStockRow[]> {
    return this.stock.listVariantStock(tx, tenantId, productIds);
  }

  lockLevel(tx: Transaction, tenantId: string, variantId: string): Promise<string> {
    return this.stock.lockLevel(tx, tenantId, variantId);
  }

  setLowNotified(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
    notified: boolean,
  ): Promise<void> {
    return this.stock.setLowNotified(tx, tenantId, variantIds, notified);
  }

  listHistory(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: StockHistoryRow[]; total: number }> {
    return this.stock.listHistory(tx, tenantId, variantId, page);
  }

  hasReceipt(tx: Transaction, tenantId: string, variantId: string): Promise<boolean> {
    return this.stock.hasReceipt(tx, tenantId, variantId);
  }

  setAvgCost(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    avgCost: string | null,
  ): Promise<void> {
    return this.stock.setAvgCost(tx, tenantId, variantId, avgCost);
  }

  stockValue(tx: Transaction, tenantId: string): Promise<StockValueRow> {
    return this.stock.stockValue(tx, tenantId);
  }

  outgoingByReason(
    tx: Transaction,
    tenantId: string,
    period: { from: Date; to: Date },
  ): Promise<OutgoingRow[]> {
    return this.stock.outgoingByReason(tx, tenantId, period);
  }

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.stock.deleteAllForTenant(tx, tenantId);
  }
}

/** Database-backed stock checks (INV-07). Every method runs in the caller's transaction, under the shop's context. */
@Injectable()
export class DrizzleStockCheckStore implements StockCheckStore {
  constructor(@Inject(StockCheckRepository) private readonly checks: StockCheckRepository) {}

  async insertCheck(
    tx: Transaction,
    tenantId: string,
    values: { actorUserId: string | null; note: string | null },
  ): Promise<StockCheckRow> {
    const row = await this.checks.insertCheck(tx, { tenantId, ...values });
    return { ...row, actorName: null };
  }

  insertLines(
    tx: Transaction,
    tenantId: string,
    checkId: string,
    lines: NewStockCheckLine[],
  ): Promise<void> {
    return this.checks.insertLines(
      tx,
      tenantId,
      lines.map((line) => ({ tenantId, checkId, ...line })),
    );
  }

  findCheck(tx: Transaction, tenantId: string, id: string): Promise<StockCheckRow | null> {
    return this.checks.findCheck(tx, tenantId, id);
  }

  listLines(tx: Transaction, tenantId: string, checkId: string): Promise<StockCheckLineRow[]> {
    return this.checks.listLines(tx, tenantId, checkId);
  }

  listChecks(
    tx: Transaction,
    tenantId: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: StockCheckSummaryRow[]; total: number }> {
    return this.checks.listChecks(tx, tenantId, page);
  }

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.checks.deleteAllForTenant(tx, tenantId);
  }
}

/** Database-backed stock batches (INV-12, INV-13). Every method but listShopIds runs in the caller's transaction. */
@Injectable()
export class DrizzleStockBatchStore implements StockBatchStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(StockBatchRepository) private readonly batches: StockBatchRepository,
  ) {}

  findBatches(tx: Transaction, tenantId: string, batchIds: string[]): Promise<StockBatchRecord[]> {
    return this.batches.findBatches(tx, tenantId, batchIds);
  }

  lockOpenBatches(
    tx: Transaction,
    tenantId: string,
    variantId: string,
  ): Promise<StockBatchRecord[]> {
    return this.batches.lockOpenBatches(tx, tenantId, variantId);
  }

  insertBatch(tx: Transaction, tenantId: string, batch: NewStockBatch): Promise<StockBatchRecord> {
    return this.batches.insertBatch(tx, tenantId, batch);
  }

  listProductBatches(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<StockBatchListRow[]> {
    return this.batches.listProductBatches(tx, tenantId, productId);
  }

  listShopBatches(
    tx: Transaction,
    tenantId: string,
    range: { from: string | null; until: string },
    page: { offset: number; limit: number },
  ): Promise<{ rows: StockBatchListRow[]; total: number }> {
    return this.batches.listShopBatches(tx, tenantId, range, page);
  }

  listUnnotified(
    tx: Transaction,
    tenantId: string,
    range: { from: string; until: string },
  ): Promise<StockBatchListRow[]> {
    return this.batches.listUnnotified(tx, tenantId, range);
  }

  markNotified(tx: Transaction, tenantId: string, batchIds: string[]): Promise<void> {
    return this.batches.markNotified(tx, tenantId, batchIds);
  }

  refreshUnsellable(tx: Transaction, tenantId: string): Promise<string[]> {
    return this.batches.refreshUnsellable(tx, tenantId);
  }

  listShopIds(): Promise<string[]> {
    return this.batches.listShopIds(this.database.handle.db);
  }
}
