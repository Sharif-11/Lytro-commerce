import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditAction,
  FieldProblemCode,
  MEASURED_STOCK_UNITS,
  StockEditReason,
  StockReason,
  StockTracking,
  type SetStockInput,
  type StockHistoryQuery,
  type VariantCostInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import type {
  CatalogueTransactions,
  ProductStockHooks,
} from '../../catalogue/ports/catalogue-stores';
import { CatalogueActivity, type ResolvedActor } from '../../catalogue/services/catalogue-activity';
import { optionIdsOfKey } from '../../catalogue/services/variant-matrix';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import type { StockStore } from '../ports/stock-store';
import { STOCK_STORE } from '../tokens';
import type {
  ProductStockView,
  StockHistoryPage,
  StockVariantRow,
  VariantStockView,
} from '../types/inventory';
import { InventoryLedger } from './inventory-ledger';
import { milli, productState, quantityOf, variantState } from './stock-state';

// What the note on a made-to-order switch's write-off says (INV-02).
const UNTRACKING_NOTE = 'Switched to made to order';

/**
 * INV-06: the one-tap reason as the ledger records it. "New stock arrived" is a manual adjustment until purchasing
 * (Slice 4) makes it a received purchase; a reason that contradicts the change (new stock that lowers it, damage that
 * raises it) is refused rather than guessed.
 */
function reasonFor(edit: StockEditReason, rising: boolean): StockReason | null {
  switch (edit) {
    case StockEditReason.NewStock:
      return rising ? StockReason.ManualAdjustment : null;
    case StockEditReason.CountedAgain:
      return StockReason.Recount;
    case StockEditReason.DamagedOrLost:
      return rising ? null : StockReason.Damaged;
    case StockEditReason.Other:
      return StockReason.ManualAdjustment;
  }
}

/**
 * INV-01 to INV-11, INV-20, INV-21: a shop's stock, as the product's stock screen reads and edits it, and the hooks
 * catalogue calls inside a product's own transaction (opening stock, a made-to-order switch, a changed matrix or
 * threshold). Cost (INV-10) is shown only to a caller who may see it (D3-9).
 */
@Injectable()
export class StockService implements ProductStockHooks {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(STOCK_STORE) private readonly store: StockStore,
    @Inject(InventoryLedger) private readonly ledger: InventoryLedger,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  /** INV-01, CCH-08: every live variant's stock, and each retired variant still holding some (ATR-11). */
  view(tenantId: string, productId: string, canSeeCost: boolean): Promise<ProductStockView> {
    return this.transactions.run((tx) => this.viewWithin(tx, tenantId, productId, canSeeCost));
  }

  /**
   * INV-06: the tenant types the stock they now have; the difference is recorded as one movement with the one-tap
   * reason (a manual adjustment when skipped), and the change is in the activity log (INV-21).
   */
  async setStock(
    tenantId: string,
    productId: string,
    variantId: string,
    input: SetStockInput,
    actor: CatalogueActor,
  ): Promise<ProductStockView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const variant = await this.variantOf(tx, tenantId, productId, variantId);
      if (variant.product.stockTracking !== StockTracking.Tracked) {
        throw new ApiError('conflict', 'MadeToOrderHasNoStock', {});
      }
      if (
        !MEASURED_STOCK_UNITS.includes(variant.product.stockUnit) &&
        !Number.isInteger(input.onHand)
      ) {
        throw new FieldsError([
          { field: 'onHand', problem: FieldProblemCode.NotAllowed, messageKey: 'WholeUnitsOnly' },
        ]);
      }
      const current = await this.store.lockLevel(tx, tenantId, variantId);
      const change = milli(input.onHand) - milli(current);
      if (change !== 0) {
        const reason = reasonFor(input.reason ?? StockEditReason.Other, change > 0);
        if (reason === null) {
          throw new FieldsError([
            {
              field: 'reason',
              problem: FieldProblemCode.NotAllowed,
              messageKey: 'StockReasonDoesNotFit',
            },
          ]);
        }
        await this.ledger.apply(
          tx,
          tenantId,
          [{ variantId, delta: quantityOf(change), reason, note: input.note ?? null }],
          who,
        );
        await this.activity.record(
          tx,
          tenantId,
          who,
          AuditAction.StockAdjusted,
          { type: 'product', id: productId },
          {
            variantId,
            from: quantityOf(milli(current)),
            to: quantityOf(milli(input.onHand)),
            reason,
            ...(input.note ? { note: input.note } : {}),
          },
        );
      }
      return this.viewWithin(tx, tenantId, productId, true);
    });
  }

  /**
   * INV-10: the average unit cost typed in by hand, until a purchase receipt sets it (Slice 4). Never public, so the
   * catalogue version stays; in the activity log.
   */
  async setCost(
    tenantId: string,
    productId: string,
    variantId: string,
    input: VariantCostInput,
    actor: CatalogueActor,
  ): Promise<ProductStockView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const variant = await this.variantOf(tx, tenantId, productId, variantId);
      if (await this.store.hasReceipt(tx, tenantId, variantId)) {
        throw new ApiError('conflict', 'CostFromPurchases', {});
      }
      const avgCost = input.avgCost === null ? null : input.avgCost.toFixed(4);
      await this.store.setAvgCost(tx, tenantId, variantId, avgCost);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.VariantCostSet,
        { type: 'product', id: productId },
        { variantId, from: variant.avgCost, to: avgCost },
      );
      return this.viewWithin(tx, tenantId, productId, true);
    });
  }

  /** INV-09: a variant's movements, newest first, with the reference and person behind each. */
  history(
    tenantId: string,
    productId: string,
    variantId: string,
    query: StockHistoryQuery,
    canSeeCost: boolean,
  ): Promise<StockHistoryPage> {
    return this.transactions.run(async (tx) => {
      await this.variantOf(tx, tenantId, productId, variantId);
      const { rows, total } = await this.store.listHistory(tx, tenantId, variantId, {
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      });
      return {
        movements: rows.map((row) => ({
          id: row.id,
          delta: row.quantityDelta,
          onHandAfter: row.onHandAfter,
          reason: row.reason,
          ...(canSeeCost ? { unitCost: row.unitCost } : {}),
          reference:
            row.referenceType !== null && row.referenceId !== null
              ? { type: row.referenceType, id: row.referenceId }
              : null,
          note: row.note,
          actor: row.actorUserId !== null ? { userId: row.actorUserId, name: row.actorName } : null,
          createdAt: row.createdAt,
        })),
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      };
    });
  }

  // --- ProductStockHooks: called by catalogue inside a product's own transaction ---

  async recordOpeningStock(
    tx: Transaction,
    tenantId: string,
    _productId: string,
    lines: { variantId: string; quantity: string }[],
    who: ResolvedActor,
  ): Promise<void> {
    await this.ledger.apply(
      tx,
      tenantId,
      lines.map((line) => ({
        variantId: line.variantId,
        delta: quantityOf(milli(line.quantity)),
        reason: StockReason.Initial,
      })),
      who,
    );
  }

  /** INV-02: everything the product holds written off to zero, recorded, before it stops being tracked. */
  async beforeUntracking(
    tx: Transaction,
    tenantId: string,
    productId: string,
    who: ResolvedActor,
  ): Promise<void> {
    const held = (await this.store.listVariantStock(tx, tenantId, [productId])).filter(
      (row) => milli(row.onHand) > 0,
    );
    if (held.length === 0) return;
    await this.ledger.apply(
      tx,
      tenantId,
      held.map((row) => ({
        variantId: row.variantId,
        delta: quantityOf(-milli(row.onHand)),
        reason: StockReason.ManualAdjustment,
        note: UNTRACKING_NOTE,
      })),
      who,
    );
    await this.activity.record(
      tx,
      tenantId,
      who,
      AuditAction.StockAdjusted,
      { type: 'product', id: productId },
      {
        writtenOff: held.map((row) => ({
          variantId: row.variantId,
          from: row.onHand,
          to: '0.000',
        })),
        reason: StockReason.ManualAdjustment,
        note: UNTRACKING_NOTE,
      },
    );
  }

  refreshStockState(tx: Transaction, tenantId: string, productId: string): Promise<void> {
    return this.ledger.refresh(tx, tenantId, [productId], false);
  }

  // --- Building blocks ---

  /** The variant, which must be one of this live product's, retired or not. */
  private async variantOf(
    tx: Transaction,
    tenantId: string,
    productId: string,
    variantId: string,
  ): Promise<StockVariantRow> {
    const [variant] = await this.store.findVariants(tx, tenantId, [variantId]);
    if (!variant || variant.productId !== productId || variant.product.deletedAt !== null) {
      throw new ApiError('not_found', 'ProductNotFound', {});
    }
    return variant;
  }

  private async viewWithin(
    tx: Transaction,
    tenantId: string,
    productId: string,
    canSeeCost: boolean,
  ): Promise<ProductStockView> {
    const rows = await this.store.listVariantStock(tx, tenantId, [productId]);
    const [first] = await this.store.findVariants(
      tx,
      tenantId,
      rows.slice(0, 1).map((row) => row.variantId),
    );
    if (!first || first.product.deletedAt !== null) {
      throw new ApiError('not_found', 'ProductNotFound', {});
    }
    const product = first.product;
    const shown = rows.filter((row) => !row.retired || milli(row.onHand) > 0);
    const variants: VariantStockView[] = shown.map((row) => ({
      variantId: row.variantId,
      optionIds: optionIdsOfKey(row.combinationKey),
      sku: row.sku,
      retired: row.retired,
      onHand: row.onHand,
      reserved: row.reserved,
      available: row.available,
      state: variantState(row.available, product.lowStockThreshold),
      ...(canSeeCost ? { avgCost: row.avgCost } : {}),
    }));
    return {
      productId,
      stockTracking: product.stockTracking,
      stockUnit: product.stockUnit,
      lowStockThreshold: product.lowStockThreshold,
      state:
        product.stockTracking === StockTracking.Tracked
          ? productState(variants.filter((row) => !row.retired).map((row) => row.state))
          : product.stockState,
      variants,
    };
  }
}
