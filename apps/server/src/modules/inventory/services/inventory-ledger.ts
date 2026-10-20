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
  VariantStockRow,
} from '../types/inventory';
import { milli, packsToStock, productState, sharedVariantState, variantState } from './stock-state';

/**
 * INV-01 to INV-05, INV-08, INV-11, INV-19, INV-24: the one path every change to on-hand stock takes, inside the
 * caller's transaction. It records each change as a movement (the database moves the level from it, refusing stock
 * below zero and fractions of whole-unit products), stamps an outgoing movement with the unit cost of the moment, then
 * works out each product's public stock state again (moving the catalogue version only when it changes) and tells the
 * shop, once per crossing, about stock that has fallen to its low-stock threshold. A change named on a variant of a
 * product sharing its stock is that many of its packs, and lands on the product's stock holder: no caller works out a
 * pack amount itself.
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
    const sharing = [...variants.values()]
      .filter((row) => row.product.sharedStock && !row.isStockHolder)
      .map((row) => row.productId);
    const holders = new Map(
      (await this.store.findStockHolders(tx, tenantId, [...new Set(sharing)])).map(
        (row): [string, StockVariantRow] => [row.productId, row],
      ),
    );
    const rows: NewStockMovement[] = changes.map((change) => {
      const variant = variants.get(change.variantId);
      if (!variant) throw new ApiError('not_found', 'ProductNotFound', {});
      // INV-02: a made-to-order product holds no stock and moves none.
      if (variant.product.stockTracking !== StockTracking.Tracked) {
        throw new ApiError('conflict', 'MadeToOrderHasNoStock', {});
      }
      const landing = this.landingOf(variant, change.delta, holders);
      const outgoing = milli(landing.delta) < 0;
      return {
        tenantId,
        productId: landing.on.productId,
        variantId: landing.on.variantId,
        quantityDelta: landing.delta,
        reason: change.reason,
        // INV-11: what leaving stock cost at this moment; unknown stays null, never zero.
        unitCost: outgoing ? landing.on.avgCost : null,
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
   * version only for a product whose state changed. With `notify`, also applies INV-08's once-per-crossing notice:
   * per variant, or for a product sharing its stock, on the shared stock.
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
      const { state, watched } = tracked
        ? this.stateOf(live, product.sharedStock, product.lowStockThreshold)
        : { state: StockState.In, watched: [] };
      if (state !== product.stockState) {
        await this.version.setStockState(tx, tenantId, productId, state);
      }
      if (!notify) continue;
      for (const row of watched) {
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

  /**
   * INV-24: where a change lands. A variant of a product sharing its stock moves that many whole packs (UOM-04) on the
   * stock holder; the stock holder itself moves only while its product shares.
   */
  private landingOf(
    variant: StockVariantRow,
    delta: string,
    holders: Map<string, StockVariantRow>,
  ): { on: StockVariantRow; delta: string } {
    if (variant.isStockHolder) {
      if (!variant.product.sharedStock) throw new ApiError('not_found', 'ProductNotFound', {});
      return { on: variant, delta };
    }
    if (!variant.product.sharedStock) return { on: variant, delta };
    const holder = holders.get(variant.productId);
    if (!holder || variant.packAmount === null) {
      throw new Error(
        'a product sharing its stock has a stock holder and a pack amount per variant',
      );
    }
    if (milli(delta) % 1000 !== 0) throw new ApiError('conflict', 'WholePacksOnly', {});
    return { on: holder, delta: packsToStock(delta, variant.packAmount) };
  }

  /**
   * CCH-08, INV-24: a product's public state is its best variant's. Without shared stock each variant holds its own
   * and is watched for INV-08; with it, each variant's state comes from the shared stock, and only that is watched.
   */
  private stateOf(
    live: VariantStockRow[],
    shared: boolean,
    threshold: string,
  ): { state: StockState; watched: VariantStockRow[] } {
    if (!shared) {
      return {
        state: productState(live.map((row) => variantState(row.available, threshold))),
        watched: live,
      };
    }
    const pool = live.find((row) => row.isStockHolder);
    if (!pool) return { state: StockState.Out, watched: [] };
    const sizes = live.filter((row) => !row.isStockHolder);
    return {
      state: productState(
        sizes.map((row) => sharedVariantState(pool.available, row.packAmount ?? '0', threshold)),
      ),
      watched: [pool],
    };
  }
}
