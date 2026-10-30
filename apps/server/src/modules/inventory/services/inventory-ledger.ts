import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  ProductKind,
  SerialStatus,
  StockReason,
  StockTracking,
  StockState,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { StockRefused } from '../../../common/errors/stock-refused';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { dhakaDate } from '../../../common/time';
import type { ResolvedActor } from '../../catalogue/services/catalogue-activity';
import { CatalogueVersion } from '../../catalogue/services/catalogue-version';
import type { SerialStore } from '../ports/serial-store';
import { comboFigures, comboState } from './combo-figures';
import type { StockBatchStore } from '../ports/stock-batch-store';
import type { LowStockNotifier, StockStore } from '../ports/stock-store';
import { LOW_STOCK_NOTIFIER, SERIAL_STORE, STOCK_BATCH_STORE, STOCK_STORE } from '../tokens';
import type {
  BatchDescription,
  MovementRecord,
  NewStockMovement,
  StockBatchRecord,
  StockChange,
  StockVariantRow,
  VariantStockRow,
} from '../types/inventory';
import {
  milli,
  packsToStock,
  productState,
  quantityOf,
  sharedVariantState,
  variantState,
} from './stock-state';

/** INV-13: a batch is expired once its last sellable day (in Asia/Dhaka) is past. */
export function batchExpired(batch: Pick<StockBatchRecord, 'expiresOn'>, today: string): boolean {
  return batch.expiresOn !== null && batch.expiresOn < today;
}

function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * INV-01 to INV-05, INV-08, INV-11 to INV-15, INV-19, INV-24: the one path every change to on-hand stock takes, inside
 * the caller's transaction. It records each change as a movement (the database moves the level from it, refusing stock
 * below zero and fractions of whole-unit products), stamps an outgoing movement with the unit cost of the moment, then
 * works out each product's public stock state again (moving the catalogue version only when it changes) and tells the
 * shop, once per crossing, about stock that has fallen to its low-stock threshold. A change named on a variant of a
 * product sharing its stock is that many of its packs, and lands on the product's stock holder; a change of
 * batch-tracked stock lands in its batches, one movement per batch; a change of serial-numbered stock records the
 * serials that came in with it or went out (INV-14). No caller works out a pack amount, a batch or a serial itself.
 */
@Injectable()
export class InventoryLedger {
  constructor(
    @Inject(STOCK_STORE) private readonly store: StockStore,
    @Inject(STOCK_BATCH_STORE) private readonly batches: StockBatchStore,
    @Inject(SERIAL_STORE) private readonly serials: SerialStore,
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
    const landed = changes.map((change) => {
      const variant = variants.get(change.variantId);
      if (!variant) throw new ApiError('not_found', 'ProductNotFound', {});
      // INV-02: a made-to-order product holds no stock and moves none.
      if (variant.product.stockTracking !== StockTracking.Tracked) {
        throw new ApiError('conflict', 'MadeToOrderHasNoStock', {});
      }
      return { change, ...this.landingOf(variant, change.delta, holders) };
    });
    // Two writers always lock in the same order -- products by id, levels by variant, then each level's batches and
    // serials -- so they wait for each other instead of deadlocking.
    await this.store.lockProducts(tx, tenantId, [...new Set(landed.map(({ on }) => on.productId))]);
    landed.sort((a, b) => byId(a.on.variantId, b.on.variantId));
    const today = dhakaDate(new Date());
    const rows: NewStockMovement[] = [];
    const serialWork: {
      row: number;
      variantId: string;
      arriving: string[];
      leaving: string[];
      soldTo: string | null;
    }[] = [];
    for (const { change, on, delta } of landed) {
      const units = await this.serialUnits(tx, tenantId, on, delta, change.serials ?? []);
      if (units.arriving.length > 0 || units.leaving.length > 0) {
        const soldTo = change.reason === StockReason.Sale ? (change.orderId ?? null) : null;
        serialWork.push({ row: rows.length, variantId: on.variantId, ...units, soldTo });
      }
      const parts = on.product.batchTracked
        ? await this.batchParts(tx, tenantId, on, delta, change, today)
        : [{ batchId: null, delta }];
      for (const part of parts) {
        rows.push({
          tenantId,
          productId: on.productId,
          variantId: on.variantId,
          batchId: part.batchId,
          quantityDelta: part.delta,
          reason: change.reason,
          // INV-11: what leaving stock cost at this moment, unless the change says what it cost (INV-17: a damaged
          // return, at its sale's cost); unknown stays null, never zero. INV-10: what a receipt's units cost, which the
          // database takes into the average.
          unitCost:
            milli(part.delta) < 0 && change.unitCost === undefined
              ? on.avgCost
              : (change.unitCost ?? null),
          referenceType: change.reference?.type ?? null,
          referenceId: change.reference?.id ?? null,
          actorUserId: who.id,
          note: change.note ?? null,
        });
      }
    }

    let movements: MovementRecord[];
    try {
      movements = await this.store.insertMovements(tx, tenantId, rows);
    } catch (error) {
      if (error instanceof StockRefused) {
        if (error.kind === 'shortfall') throw new ApiError('conflict', 'NotEnoughStock', {});
        if (error.kind === 'held') throw new ApiError('conflict', 'UnitsHeldForOrders', {});
        throw new ApiError('conflict', 'WholeUnitsOnly', {});
      }
      throw error;
    }
    // INV-14: each unit's serial goes in or out with the movement that moved it.
    for (const work of serialWork) {
      const movement = movements[work.row];
      if (!movement) throw new Error('every stock change was recorded as a movement');
      try {
        await this.serials.insertSerials(
          tx,
          tenantId,
          work.arriving.map((serial) => ({
            variantId: work.variantId,
            serial,
            receivedMovementId: movement.id,
          })),
        );
      } catch (error) {
        if (error instanceof UniqueViolation) throw new ApiError('conflict', 'SerialTaken', {});
        throw error;
      }
      await this.serials.markLeft(tx, tenantId, work.leaving, movement.id, work.soldTo);
    }
    await this.refresh(tx, tenantId, [...new Set(rows.map((row) => row.productId))], true);
    return movements;
  }

  /**
   * INV-14: the serials a change of serial-numbered stock brings in (at most one per unit, none held anywhere in the
   * shop already) or takes out (held by this variant, in stock). Units leaving without a named serial are units that
   * have none yet; the change is refused when there are not that many. Locks the variant's level, then its serials.
   */
  private async serialUnits(
    tx: Transaction,
    tenantId: string,
    on: StockVariantRow,
    delta: string,
    named: string[],
  ): Promise<{ arriving: string[]; leaving: string[] }> {
    if (!on.product.serialTracked) {
      if (named.length > 0) throw new ApiError('conflict', 'SerialsNotTracked', {});
      return { arriving: [], leaving: [] };
    }
    const units = Math.abs(milli(delta)) / 1000;
    if (named.length > units) throw new ApiError('conflict', 'TooManySerials', {});
    const onHand = milli(await this.store.lockLevel(tx, tenantId, on.variantId)) / 1000;
    const held = await this.serials.lockHeld(tx, tenantId, on.variantId);
    if (milli(delta) > 0) {
      if (named.length > 0 && (await this.serials.findHeld(tx, tenantId, named)).length > 0) {
        throw new ApiError('conflict', 'SerialTaken', {});
      }
      return { arriving: named, leaving: [] };
    }
    const inStock = new Map(
      held.filter((row) => row.status === SerialStatus.InStock).map((row) => [row.serial, row.id]),
    );
    const leaving = named.map((serial) => inStock.get(serial));
    if (leaving.some((id) => id === undefined)) {
      throw new ApiError('not_found', 'SerialNotFound', {});
    }
    if (units - named.length > onHand - held.length) {
      throw new ApiError('conflict', 'SerialsMustBeNamed', {});
    }
    return { arriving: [], leaving: leaving.filter((id): id is string => id !== undefined) };
  }

  /**
   * CCH-08, INV-19, ATR-07: works out again the public stock state of each live variant and of its product (its best
   * variant on sale), moving the catalogue version only when one changed. With `notify`, also applies INV-08's
   * once-per-crossing notice: per variant, or for a product sharing its stock, on the shared stock.
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
    const combos = new Set<string>();
    for (const productId of productIds) {
      const product = products.get(productId)?.product;
      if (!product) continue;
      // CMB-02: a combo's state is what its parts can make, worked out with the others below.
      if (product.kind === ProductKind.Combo) {
        combos.add(productId);
        continue;
      }
      const live = stock.filter((row) => row.productId === productId && !row.retired);
      const { states, watched } = this.statesOf(live, product);
      const changed = live.flatMap((row) => {
        const state = states.get(row.variantId);
        return state !== undefined && state !== row.stockState
          ? [{ variantId: row.variantId, state }]
          : [];
      });
      const state = productState(
        live.flatMap((row) => {
          const own = row.active ? states.get(row.variantId) : undefined;
          return own === undefined ? [] : [own];
        }),
      );
      await this.version.setStockStates(tx, tenantId, productId, {
        product: state === product.stockState ? null : state,
        variants: changed,
      });
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
    // CMB-02: every combo using one of these products follows in the same transaction (a combo has no combo inside).
    const parts = productIds.filter((id) => !combos.has(id));
    for (const id of await this.store.combosUsingProducts(tx, tenantId, parts)) combos.add(id);
    await this.refreshCombos(tx, tenantId, [...combos]);
  }

  /**
   * CMB-02, CMB-08: each combo's state from what its parts can make now -- out while a part cannot be had -- moving
   * the catalogue version when it changes. A combo sends no low-stock notice; its parts do (agreed 2026-10-30).
   */
  private async refreshCombos(
    tx: Transaction,
    tenantId: string,
    comboIds: string[],
  ): Promise<void> {
    if (comboIds.length === 0) return;
    const figures = comboFigures(await this.store.listComboPartStock(tx, tenantId, comboIds));
    const own = await this.store.listVariantStock(tx, tenantId, comboIds);
    const combos = new Map(
      (
        await this.store.findVariants(
          tx,
          tenantId,
          own.map((row) => row.variantId),
        )
      ).map((row) => [row.productId, row.product]),
    );
    for (const comboId of comboIds) {
      const combo = combos.get(comboId);
      if (!combo) continue;
      const state = comboState(figures.get(comboId), combo.lowStockThreshold);
      await this.version.setStockStates(tx, tenantId, comboId, {
        product: state === combo.stockState ? null : state,
        variants: own
          .filter((row) => row.productId === comboId && !row.retired && row.stockState !== state)
          .map((row) => ({ variantId: row.variantId, state })),
      });
    }
  }

  /**
   * INV-12, INV-13: a change of batch-tracked stock, batch by batch, under the level's lock and then its batches'. A
   * named batch takes all of it. Rising, it goes into the batch described (joining an open one of the same code), or
   * into the variant's "no expiry" batch. Falling, it leaves in the picking order: earliest expiry first, none last.
   * A sale never takes an expired batch; any other loss (damage, a recount, a write-off) takes expired stock last.
   */
  private async batchParts(
    tx: Transaction,
    tenantId: string,
    on: StockVariantRow,
    delta: string,
    change: StockChange,
    today: string,
  ): Promise<{ batchId: string; delta: string }[]> {
    await this.store.lockLevel(tx, tenantId, on.variantId);
    const open = await this.batches.lockOpenBatches(tx, tenantId, on.variantId);
    if (change.batchId) {
      const named = open.find((batch) => batch.id === change.batchId);
      if (!named) throw new ApiError('not_found', 'BatchNotFound', {});
      return [{ batchId: named.id, delta }];
    }
    const amount = milli(delta);
    if (amount > 0) {
      const into = await this.incomingBatch(tx, tenantId, on.variantId, open, change.batch, today);
      return [{ batchId: into.id, delta }];
    }
    const sellable = open.filter((batch) => !batchExpired(batch, today));
    const expired = open.filter((batch) => batchExpired(batch, today));
    const picking = change.reason === StockReason.Sale ? sellable : [...sellable, ...expired];
    let need = -amount;
    const parts: { batchId: string; delta: string }[] = [];
    for (const batch of picking) {
      if (need === 0) break;
      const take = Math.min(milli(batch.quantity), need);
      if (take <= 0) continue;
      parts.push({ batchId: batch.id, delta: quantityOf(-take) });
      need -= take;
    }
    if (need > 0) throw new ApiError('conflict', 'NotEnoughStock', {});
    return parts;
  }

  /**
   * INV-12, INV-22: the batch arriving stock goes into. Described with a code the variant already has open, it joins
   * that batch, unless it names a different expiry (one lot has one expiry date). Described otherwise, it opens a new
   * batch, never with an expiry already past. Not described, it goes into the variant's one "no expiry" batch.
   */
  private async incomingBatch(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    open: StockBatchRecord[],
    described: BatchDescription | null | undefined,
    today: string,
  ): Promise<StockBatchRecord> {
    const batchCode = described?.batchCode ?? null;
    const expiresOn = described?.expiresOn ?? null;
    if (batchCode === null && expiresOn === null) {
      return (
        open.find((batch) => batch.isDefault) ??
        this.batches.insertBatch(tx, tenantId, {
          variantId,
          batchCode: null,
          expiresOn: null,
          isDefault: true,
        })
      );
    }
    if (expiresOn !== null && expiresOn < today) {
      throw new ApiError('conflict', 'ExpiryInThePast', {});
    }
    const same =
      batchCode !== null ? open.find((batch) => batch.batchCode === batchCode) : undefined;
    if (same) {
      if (expiresOn !== null && same.expiresOn !== expiresOn) {
        throw new ApiError('conflict', 'BatchExpiryDiffers', {});
      }
      return same;
    }
    return this.batches.insertBatch(tx, tenantId, {
      variantId,
      batchCode,
      expiresOn,
      isDefault: false,
    });
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
   * CCH-08, INV-24: each sellable variant's public state, and the stock INV-08 watches. A product whose stock is not
   * counted is in throughout. Without shared stock each variant holds its own and is watched; with it, each variant's
   * state comes from the shared stock, and only that is watched.
   */
  private statesOf(
    live: VariantStockRow[],
    product: StockVariantRow['product'],
  ): { states: Map<string, StockState>; watched: VariantStockRow[] } {
    const sizes = live.filter((row) => !row.isStockHolder);
    const threshold = product.lowStockThreshold;
    if (product.stockTracking !== StockTracking.Tracked) {
      return { states: new Map(sizes.map((row) => [row.variantId, StockState.In])), watched: [] };
    }
    if (!product.sharedStock) {
      return {
        states: new Map(
          sizes.map((row) => [row.variantId, variantState(row.available, threshold)]),
        ),
        watched: live,
      };
    }
    const pool = live.find((row) => row.isStockHolder);
    return {
      states: new Map(
        sizes.map((row) => [
          row.variantId,
          pool
            ? sharedVariantState(pool.available, row.packAmount ?? '0', threshold)
            : StockState.Out,
        ]),
      ),
      watched: pool ? [pool] : [],
    };
  }
}
