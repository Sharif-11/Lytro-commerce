import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { StockTracking, StockState } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { StockRefused } from '../../../common/errors/stock-refused';
import type { ResolvedActor } from '../../catalogue/services/catalogue-activity';
import { CatalogueVersion } from '../../catalogue/services/catalogue-version';
import type { LowStockNotifier, StockStore } from '../ports/stock-store';
import { LOW_STOCK_NOTIFIER, STOCK_STORE } from '../tokens';
import type {
  MovementRecord,
  NewStockMovement,
  StockChange,
  StockVariantRow,
} from '../types/inventory';
import { milli, productState, variantState } from './stock-state';

/**
 * INV-01 to INV-05, INV-08, INV-11, INV-19: the one path every change to on-hand stock takes, inside the caller's
 * transaction. It records each change as a movement (the database moves the level from it, refusing stock below zero
 * and fractions of whole-unit products), stamps an outgoing movement with the unit cost of the moment, then works
 * out each product's public stock state again (moving the catalogue version only when it changes) and tells the
 * shop, once per crossing, about a variant that has fallen to its low-stock threshold.
 */
@Injectable()
export class InventoryLedger {
  constructor(
    @Inject(STOCK_STORE) private readonly store: StockStore,
    @Inject(LOW_STOCK_NOTIFIER) private readonly notifier: LowStockNotifier,
    @Inject(CatalogueVersion) private readonly version: CatalogueVersion,
  ) {}

  async apply(
    tx: Transaction,
    tenantId: string,
    changes: StockChange[],
    who: ResolvedActor,
  ): Promise<MovementRecord[]> {
    if (changes.length === 0) return [];
    const variants = new Map(
      (
        await this.store.findVariants(
          tx,
          tenantId,
          changes.map((change) => change.variantId),
        )
      ).map((row): [string, StockVariantRow] => [row.variantId, row]),
    );
    const rows: NewStockMovement[] = changes.map((change) => {
      const variant = variants.get(change.variantId);
      if (!variant) throw new ApiError('not_found', 'ProductNotFound', {});
      // INV-02: a made-to-order product holds no stock and moves none.
      if (variant.product.stockTracking !== StockTracking.Tracked) {
        throw new ApiError('conflict', 'MadeToOrderHasNoStock', {});
      }
      const outgoing = milli(change.delta) < 0;
      return {
        tenantId,
        productId: variant.productId,
        variantId: variant.variantId,
        quantityDelta: change.delta,
        reason: change.reason,
        // INV-11: what leaving stock cost at this moment; unknown stays null, never zero.
        unitCost: outgoing ? variant.avgCost : null,
        referenceType: change.reference?.type ?? null,
        referenceId: change.reference?.id ?? null,
        actorUserId: who.id,
        note: change.note ?? null,
      };
    });
    // Two writers always lock levels in the same order, so they wait for each other instead of deadlocking.
    rows.sort((a, b) => (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0));

    let movements: MovementRecord[];
    try {
      movements = await this.store.insertMovements(tx, tenantId, rows);
    } catch (error) {
      if (error instanceof StockRefused) {
        throw error.kind === 'shortfall'
          ? new ApiError('conflict', 'NotEnoughStock', {})
          : new ApiError('conflict', 'WholeUnitsOnly', {});
      }
      throw error;
    }
    await this.refresh(tx, tenantId, [...new Set(rows.map((row) => row.productId))], true);
    return movements;
  }

  /**
   * CCH-08, INV-19: works the products' public stock state out again from their live variants, moving the catalogue
   * version only for a product whose state changed. With `notify`, also applies INV-08's once-per-crossing notice.
   */
  async refresh(
    tx: Transaction,
    tenantId: string,
    productIds: string[],
    notify: boolean,
  ): Promise<void> {
    if (productIds.length === 0) return;
    const stock = await this.store.listVariantStock(tx, tenantId, productIds);
    const products = new Map(
      (
        await this.store.findVariants(
          tx,
          tenantId,
          stock.map((row) => row.variantId),
        )
      ).map((row) => [row.productId, row]),
    );
    const crossed: string[] = [];
    const recovered: string[] = [];
    for (const productId of productIds) {
      const product = products.get(productId)?.product;
      if (!product) continue;
      const tracked = product.stockTracking === StockTracking.Tracked;
      const live = stock.filter((row) => row.productId === productId && !row.retired);
      const state = tracked
        ? productState(live.map((row) => variantState(row.available, product.lowStockThreshold)))
        : StockState.In;
      if (state !== product.stockState) {
        await this.version.setStockState(tx, tenantId, productId, state);
      }
      if (!notify || !tracked) continue;
      for (const row of live) {
        if (!row.hasLevel) continue;
        const low = milli(row.available) <= milli(product.lowStockThreshold);
        if (low && !row.lowNotified) {
          await this.notifier.lowStock({
            tenantId,
            productId,
            productName: product.name,
            variantId: row.variantId,
            available: row.available,
            threshold: product.lowStockThreshold,
          });
          crossed.push(row.variantId);
        } else if (!low && row.lowNotified) {
          recovered.push(row.variantId);
        }
      }
    }
    await this.store.setLowNotified(tx, tenantId, crossed, true);
    await this.store.setLowNotified(tx, tenantId, recovered, false);
  }
}
