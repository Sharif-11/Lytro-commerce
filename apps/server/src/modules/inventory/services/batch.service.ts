import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditAction,
  BatchState,
  EXPIRY_WARNING_DAYS,
  STOCK_HOLDER_KEY,
  StockReason,
  type BatchListQuery,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { DAY_MS, dhakaDate } from '../../../common/time';
import type { CatalogueTransactions } from '../../catalogue/ports/catalogue-stores';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import { optionIdsOfKey } from '../../catalogue/services/variant-matrix';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import type { StockBatchStore } from '../ports/stock-batch-store';
import type { StockStore } from '../ports/stock-store';
import { STOCK_BATCH_STORE, STOCK_STORE } from '../tokens';
import type {
  BatchView,
  ProductBatchesView,
  ShopBatchPage,
  StockBatchListRow,
} from '../types/inventory';
import { batchExpired, InventoryLedger } from './inventory-ledger';
import { milli, quantityOf } from './stock-state';

/** INV-13: today in Asia/Dhaka, and the last day of the expiry warning window from it. */
export function expiryWindow(now: Date): { today: string; until: string } {
  return {
    today: dhakaDate(now),
    until: dhakaDate(new Date(now.getTime() + EXPIRY_WARNING_DAYS * DAY_MS)),
  };
}

function stateOf(expiresOn: string | null, window: { today: string; until: string }): BatchState {
  if (expiresOn === null) return BatchState.Fine;
  if (expiresOn < window.today) return BatchState.Expired;
  return expiresOn <= window.until ? BatchState.Expiring : BatchState.Fine;
}

function viewOf(row: StockBatchListRow, window: { today: string; until: string }): BatchView {
  return {
    id: row.id,
    variantId: row.variantId,
    // A shared stock is named by its product alone.
    optionIds:
      row.isStockHolder || row.combinationKey === STOCK_HOLDER_KEY
        ? []
        : optionIdsOfKey(row.combinationKey),
    batchCode: row.batchCode,
    expiresOn: row.expiresOn,
    noExpiry: row.isDefault,
    quantity: row.quantity,
    receivedAt: row.receivedAt,
    state: stateOf(row.expiresOn, window),
  };
}

/**
 * INV-12, INV-13, INV-21: a shop's batches as it reads them, a product's and the shop's expiring and expired ones, and
 * the write-off of an expired batch the shop confirms: one `expired` movement for what it holds, through the ledger,
 * valued at the cost of the moment (INV-11) and in the activity log.
 */
@Injectable()
export class BatchService {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(STOCK_STORE) private readonly stock: StockStore,
    @Inject(STOCK_BATCH_STORE) private readonly batches: StockBatchStore,
    @Inject(InventoryLedger) private readonly ledger: InventoryLedger,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  /** A product's open batches holding stock, in the picking order, each with where it stands against its expiry. */
  productBatches(tenantId: string, productId: string): Promise<ProductBatchesView> {
    return this.transactions.run((tx) => this.productBatchesWithin(tx, tenantId, productId));
  }

  /** INV-13: the shop's batches with stock that are expired, or expiring within the warning window, soonest first. */
  shopBatches(tenantId: string, query: BatchListQuery): Promise<ShopBatchPage> {
    const window = expiryWindow(new Date());
    const range =
      query.state === BatchState.Expired
        ? {
            from: null,
            until: dhakaDate(new Date(Date.parse(`${window.today}T00:00:00Z`) - DAY_MS)),
          }
        : query.state === BatchState.Expiring
          ? { from: window.today, until: window.until }
          : { from: null, until: window.until };
    return this.transactions.run(async (tx) => {
      const { rows, total } = await this.batches.listShopBatches(tx, tenantId, range, {
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      });
      return {
        batches: rows.map((row) => ({
          ...viewOf(row, window),
          productId: row.productId,
          productName: row.productName,
        })),
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      };
    });
  }

  /** INV-13: what an expired batch holds, written off when the shop confirms; refused for a batch not yet expired. */
  async writeOff(
    tenantId: string,
    productId: string,
    batchId: string,
    actor: CatalogueActor,
  ): Promise<ProductBatchesView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const [found] = await this.batches.findBatches(tx, tenantId, [batchId]);
      const [variant] = found ? await this.stock.findVariants(tx, tenantId, [found.variantId]) : [];
      if (
        !found ||
        found.closedAt !== null ||
        variant?.productId !== productId ||
        variant.product.deletedAt !== null
      ) {
        throw new ApiError('not_found', 'BatchNotFound', {});
      }
      if (!batchExpired(found, dhakaDate(new Date()))) {
        throw new ApiError('conflict', 'BatchNotExpired', {});
      }
      // Read what it holds under its level's lock, then its batches', as every stock writer takes them.
      await this.stock.lockLevel(tx, tenantId, found.variantId);
      const batch = (await this.batches.lockOpenBatches(tx, tenantId, found.variantId)).find(
        (row) => row.id === batchId,
      );
      const held = batch ? milli(batch.quantity) : 0;
      if (held > 0) {
        await this.ledger.apply(
          tx,
          tenantId,
          [
            {
              variantId: found.variantId,
              delta: quantityOf(-held),
              reason: StockReason.Expired,
              batchId,
            },
          ],
          who,
        );
        await this.activity.record(
          tx,
          tenantId,
          who,
          AuditAction.StockAdjusted,
          { type: 'product', id: productId },
          {
            variantId: found.variantId,
            batchId,
            writtenOff: quantityOf(held),
            reason: StockReason.Expired,
          },
        );
      }
      return this.productBatchesWithin(tx, tenantId, productId);
    });
  }

  private async productBatchesWithin(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<ProductBatchesView> {
    const rows = await this.stock.listVariantStock(tx, tenantId, [productId]);
    const [first] = await this.stock.findVariants(
      tx,
      tenantId,
      rows.slice(0, 1).map((row) => row.variantId),
    );
    if (!first || first.product.deletedAt !== null) {
      throw new ApiError('not_found', 'ProductNotFound', {});
    }
    const window = expiryWindow(new Date());
    const batches = await this.batches.listProductBatches(tx, tenantId, productId);
    return {
      productId,
      batches: batches.filter((row) => milli(row.quantity) > 0).map((row) => viewOf(row, window)),
    };
  }
}
