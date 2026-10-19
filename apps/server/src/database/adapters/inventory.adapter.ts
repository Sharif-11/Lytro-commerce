import { Inject, Injectable } from '@nestjs/common';
import { StockRepository, TransactionRunner, type Transaction } from '@lytronix/db';
import { StockRefused } from '../../common/errors/stock-refused';
import type { StockStore } from '../../modules/inventory/ports/stock-store';
import type {
  MovementRecord,
  NewStockMovement,
  StockHistoryRow,
  StockVariantRow,
  VariantStockRow,
} from '../../modules/inventory/types/inventory';

// The checks a movement can run into (INV-01, UOM-03), by what they protect.
const SHORTFALL_CHECKS = ['stock_levels_on_hand_check', 'stock_levels_available_check'];
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

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.stock.deleteAllForTenant(tx, tenantId);
  }
}
