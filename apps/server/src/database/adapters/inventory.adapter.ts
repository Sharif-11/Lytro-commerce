import { Inject, Injectable } from '@nestjs/common';
import type { ReservationStatus, SerialStatus } from '@lytronix/validators';
import {
  CategoryRepository,
  ProductRepository,
  PurchaseOrderRepository,
  ReservationRepository,
  SerialRepository,
  StockBatchRepository,
  StockCheckRepository,
  StockRepository,
  TenantRepository,
  TransactionRunner,
  type ProductListFilter,
  type ProductListRow,
  type ProductStateCounts,
  type Transaction,
} from '@lytronix/db';
import { StockRefused } from '../../common/errors/stock-refused';
import { UniqueViolation } from '../../common/errors/unique-violation';
import { DatabaseService } from '../database.service';
import type {
  NewStockCheckLine,
  StockCheckStore,
} from '../../modules/inventory/ports/stock-check-store';
import type { ReservationStore } from '../../modules/inventory/ports/reservation-store';
import type { SerialStore } from '../../modules/inventory/ports/serial-store';
import type { StockBatchStore } from '../../modules/inventory/ports/stock-batch-store';
import type { StockStore } from '../../modules/inventory/ports/stock-store';
import type {
  MovementRecord,
  NewReservation,
  NewSerial,
  NewStockBatch,
  NewStockMovement,
  OutgoingRow,
  ReferencedMovementRow,
  ReservationRecord,
  ReturnedRow,
  SerialRecord,
  ShortfallRow,
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

// The checks a movement or a reservation can run into (INV-01, UOM-03, INV-15), by what they protect. The triggers
// refusing more than is free report the name of the check they took over from (migration 0062).
const SHORTFALL_CHECKS = [
  'stock_levels_on_hand_check',
  'stock_levels_available_check',
  'stock_batches_quantity_check',
];
const HELD_CHECK = 'stock_levels_reserved_held_check';
const WHOLE_UNITS_CHECK = 'stock_whole_units';
// INV-14: a serial a held unit already has (migration 0059).
const SERIAL_HELD_INDEX = 'serial_numbers_held_idx';

@Injectable()
export class DrizzleStockStore implements StockStore {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(StockRepository) private readonly stock: StockRepository,
    @Inject(PurchaseOrderRepository) private readonly purchases: PurchaseOrderRepository,
    @Inject(CategoryRepository) private readonly categories: CategoryRepository,
    @Inject(ProductRepository) private readonly products: ProductRepository,
  ) {}

  listProducts(
    tx: Transaction,
    tenantId: string,
    filter: ProductListFilter,
  ): Promise<{ rows: ProductListRow[]; total: number; counts: ProductStateCounts }> {
    return this.products.listProducts(tx, tenantId, filter);
  }

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
      if (this.transactions.isCheckViolation(error, HELD_CHECK)) throw new StockRefused('held');
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

  lockProducts(tx: Transaction, tenantId: string, productIds: string[]): Promise<void> {
    return this.stock.lockProducts(tx, tenantId, productIds);
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

  listShortfalls(tx: Transaction, tenantId: string): Promise<ShortfallRow[]> {
    return this.stock.listShortfalls(tx, tenantId);
  }

  setShortNotified(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
    notified: boolean,
  ): Promise<void> {
    return this.stock.setShortNotified(tx, tenantId, variantIds, notified);
  }

  listHistory(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    page: { offset: number; limit: number },
  ): Promise<{ rows: StockHistoryRow[]; total: number }> {
    return this.stock.listHistory(tx, tenantId, variantId, page);
  }

  hasCostedReceipt(tx: Transaction, tenantId: string, variantId: string): Promise<boolean> {
    return this.stock.hasCostedReceipt(tx, tenantId, variantId);
  }

  async incoming(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<Map<string, string>> {
    const rows = await this.purchases.incoming(tx, tenantId, variantIds);
    return new Map(rows.map((row) => [row.variantId, row.incoming]));
  }

  setAvgCost(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    avgCost: string | null,
  ): Promise<void> {
    return this.stock.setAvgCost(tx, tenantId, variantId, avgCost);
  }

  stockValue(tx: Transaction, tenantId: string): Promise<StockValueRow[]> {
    return this.stock.stockValue(tx, tenantId);
  }

  async categoryTree(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ id: string; parentId: string | null; name: string }[]> {
    const rows = await this.categories.listCategories(tx, tenantId);
    return rows.map((row) => ({ id: row.id, parentId: row.parentId, name: row.name }));
  }

  listReferencing(
    tx: Transaction,
    tenantId: string,
    reference: { type: string; id: string },
  ): Promise<ReferencedMovementRow[]> {
    return this.stock.listReferencing(tx, tenantId, reference);
  }

  returnedInPeriod(
    tx: Transaction,
    tenantId: string,
    period: { from: Date; to: Date },
  ): Promise<ReturnedRow> {
    return this.stock.returnedInPeriod(tx, tenantId, period);
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
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
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
    return this.tenants.listLiveIds(this.database.handle.db);
  }
}

/** Database-backed serial numbers (INV-14). Every method runs in the caller's transaction, under the shop's context. */
@Injectable()
export class DrizzleSerialStore implements SerialStore {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(SerialRepository) private readonly serials: SerialRepository,
  ) {}

  countHeld(tx: Transaction, tenantId: string, variantIds: string[]): Promise<Map<string, number>> {
    return this.serials.countHeld(tx, tenantId, variantIds);
  }

  lockHeld(tx: Transaction, tenantId: string, variantId: string): Promise<SerialRecord[]> {
    return this.serials.lockHeld(tx, tenantId, variantId);
  }

  findHeld(tx: Transaction, tenantId: string, serials: string[]): Promise<SerialRecord[]> {
    return this.serials.findHeld(tx, tenantId, serials);
  }

  async insertSerials(tx: Transaction, tenantId: string, rows: NewSerial[]): Promise<void> {
    try {
      await this.serials.insertSerials(tx, tenantId, rows);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, SERIAL_HELD_INDEX)) {
        throw new UniqueViolation('serial');
      }
      throw error;
    }
  }

  markLeft(
    tx: Transaction,
    tenantId: string,
    ids: string[],
    movementId: number,
    soldOrderId: string | null,
  ): Promise<void> {
    return this.serials.markLeft(tx, tenantId, ids, movementId, soldOrderId);
  }

  markReturned(tx: Transaction, tenantId: string, ids: string[]): Promise<void> {
    return this.serials.markReturned(tx, tenantId, ids);
  }

  listSerials(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    status: SerialStatus | null,
    page: { offset: number; limit: number },
  ): Promise<{ rows: SerialRecord[]; total: number }> {
    return this.serials.listSerials(tx, tenantId, variantId, status, page);
  }

  listForMovements(
    tx: Transaction,
    tenantId: string,
    movementIds: number[],
  ): Promise<SerialRecord[]> {
    return this.serials.listForMovements(tx, tenantId, movementIds);
  }

  findSerial(tx: Transaction, tenantId: string, id: string): Promise<SerialRecord | null> {
    return this.serials.findSerial(tx, tenantId, id);
  }

  async updateSerial(tx: Transaction, tenantId: string, id: string, serial: string): Promise<void> {
    try {
      await this.serials.updateSerial(tx, tenantId, id, serial);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, SERIAL_HELD_INDEX)) {
        throw new UniqueViolation('serial');
      }
      throw error;
    }
  }

  deleteSerial(tx: Transaction, tenantId: string, id: string): Promise<void> {
    return this.serials.deleteSerial(tx, tenantId, id);
  }

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.serials.deleteAllForTenant(tx, tenantId);
  }
}

@Injectable()
export class DrizzleReservationStore implements ReservationStore {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ReservationRepository) private readonly reservations: ReservationRepository,
  ) {}

  async insert(tx: Transaction, tenantId: string, row: NewReservation): Promise<ReservationRecord> {
    try {
      return await this.reservations.insert(tx, tenantId, row);
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

  findReservations(tx: Transaction, tenantId: string, ids: string[]): Promise<ReservationRecord[]> {
    return this.reservations.findReservations(tx, tenantId, ids);
  }

  lockReservations(tx: Transaction, tenantId: string, ids: string[]): Promise<ReservationRecord[]> {
    return this.reservations.lockReservations(tx, tenantId, ids);
  }

  listForOrder(tx: Transaction, tenantId: string, orderId: string): Promise<ReservationRecord[]> {
    return this.reservations.listForOrder(tx, tenantId, orderId);
  }

  listDue(
    tx: Transaction,
    tenantId: string,
    now: Date,
    limit: number,
  ): Promise<ReservationRecord[]> {
    return this.reservations.listDue(tx, tenantId, now, limit);
  }

  resolve(
    tx: Transaction,
    tenantId: string,
    ids: string[],
    status: ReservationStatus.Consumed | ReservationStatus.Released,
  ): Promise<string[]> {
    return this.reservations.resolve(tx, tenantId, ids, status);
  }

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.reservations.deleteAllForTenant(tx, tenantId);
  }
}
