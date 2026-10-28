import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditAction,
  FieldProblemCode,
  MEASURED_STOCK_UNITS,
  StockEditReason,
  StockReason,
  StockTracking,
  type AddStockInput,
  type SetStockInput,
  type StockHistoryQuery,
  type StockPageQuery,
  type VariantCostInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { packCost, unitCostOfPack } from '../../balance/services/money';
import type {
  CatalogueTransactions,
  ProductStockHooks,
} from '../../catalogue/ports/catalogue-stores';
import { CatalogueActivity, type ResolvedActor } from '../../catalogue/services/catalogue-activity';
import { ProductService } from '../../catalogue/services/product.service';
import { inProductOrder } from '../../catalogue/services/variant-attributes';
import { optionIdsOfKey } from '../../catalogue/services/variant-matrix';
import { CATALOGUE_TRANSACTIONS } from '../../catalogue/tokens';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import type { SerialStore } from '../ports/serial-store';
import type { StockArrivals } from '../ports/stock-arrivals';
import type { StockStore } from '../ports/stock-store';
import { SERIAL_STORE, STOCK_STORE } from '../tokens';
import type {
  BatchDescription,
  ProductStockView,
  SharedStockView,
  StockHistoryPage,
  StockPageView,
  StockVariantRow,
  VariantStockRow,
  VariantStockView,
} from '../types/inventory';
import { batchChoiceOf } from './batch-choice';
import { InventoryLedger } from './inventory-ledger';
import { SerialEntryService } from './serial-entry.service';
import {
  milli,
  packsOf,
  packsToStock,
  productState,
  quantityOf,
  reservedExpired,
  sharedVariantState,
  variantState,
} from './stock-state';

// PUR-05: a variant with nothing on its way, in the form quantities are shown.
const NONE_INCOMING = '0.000';

// What the note on a made-to-order switch's write-off says (INV-02).
const UNTRACKING_NOTE = 'Switched to made to order';

/** INV-10: a unit cost as the ledger and the average keep it, to four decimals. */
const costOf = (cost: string): string => Number(cost).toFixed(4);

/** A product as its stock view reads it. */
type StockedProduct = { id: string } & Pick<
  StockVariantRow['product'],
  | 'stockTracking'
  | 'stockUnit'
  | 'lowStockThreshold'
  | 'stockState'
  | 'sharedStock'
  | 'serialTracked'
>;

/**
 * INV-06: the one-tap reason as the ledger records it. "New stock arrived" is a purchase received (PUR-07, recorded by
 * the stock arrivals); a reason that contradicts the change (new stock that lowers it, damage that raises it) is
 * refused rather than guessed.
 */
function reasonFor(edit: StockEditReason, rising: boolean): StockReason | null {
  switch (edit) {
    case StockEditReason.NewStock:
      return rising ? StockReason.PurchaseReceipt : null;
    case StockEditReason.CountedAgain:
      return StockReason.Recount;
    case StockEditReason.DamagedOrLost:
      return rising ? null : StockReason.Damaged;
    case StockEditReason.Other:
      return StockReason.ManualAdjustment;
  }
}

/**
 * INV-01 to INV-11, INV-20, INV-21, INV-24: a shop's stock, as the product's stock screen reads and edits it, and the
 * hooks catalogue calls inside a product's own transaction (opening stock, a made-to-order switch, a changed matrix or
 * threshold, a switch to or from shared stock). Cost (INV-10) is shown only to a caller who may see it (D3-9). A
 * product sharing its stock holds it on its stock holder, which these routes take like any variant; a variant drawing
 * on it holds none of its own, so its stock and cost are set on the shared stock.
 */
@Injectable()
export class StockService implements ProductStockHooks {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(STOCK_STORE) private readonly store: StockStore,
    @Inject(SERIAL_STORE) private readonly serials: SerialStore,
    @Inject(InventoryLedger) private readonly ledger: InventoryLedger,
    @Inject(SerialEntryService) private readonly serialEntry: SerialEntryService,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(ProductService) private readonly catalogue: ProductService,
  ) {}

  /** INV-01, CCH-08: every live variant's stock, and each retired variant still holding some (ATR-11). */
  view(tenantId: string, productId: string, canSeeCost: boolean): Promise<ProductStockView> {
    return this.transactions.run((tx) => this.viewWithin(tx, tenantId, productId, canSeeCost));
  }

  /**
   * The Stock page (Slice 11.9; INV-01, INV-08): a page of the shop's products found by name, out of stock first, then
   * low, each with its stock as its own screen shows it, its name, whether it is on sale, how it keeps its stock (its
   * sheets differ by it), and its variant-defining attributes, its variants' option ids in their order; All, Low and
   * Out counted as the Products list counts them.
   */
  page(tenantId: string, query: StockPageQuery, canSeeCost: boolean): Promise<StockPageView> {
    return this.transactions.run(async (tx) => {
      const { rows, total, counts } = await this.store.listProducts(tx, tenantId, {
        search: query.search,
        ...(query.stock ? { active: true, stockState: query.stock } : {}),
        attentionFirst: true,
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      });
      const products = rows.map((row) => row.product);
      const stock = await this.store.listVariantStock(
        tx,
        tenantId,
        products.map((product) => product.id),
      );
      const views = await this.viewsOf(tx, tenantId, products, stock, canSeeCost);
      const splits = await this.catalogue.variantAttributesWithin(
        tx,
        tenantId,
        new Map(
          products.map((product) => [
            product.id,
            stock
              .filter((row) => row.productId === product.id && !row.isStockHolder)
              .map((row) => row.variantId),
          ]),
        ),
      );
      return {
        products: products.flatMap((product, index) => {
          const view = views[index];
          if (!view) return [];
          const own = splits.get(product.id) ?? [];
          return [
            {
              ...view,
              name: product.name,
              active: product.active,
              batchTracked: product.batchTracked,
              serialTracked: product.serialTracked,
              serialFormat: product.serialFormat,
              splits: own,
              variants: inProductOrder(own, view.variants),
            },
          ];
        }),
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
        counts: { all: counts.total, low: counts.low, out: counts.out },
      };
    });
  }

  /**
   * INV-06: the tenant types the stock they now have; the difference is recorded as one movement with the one-tap
   * reason (a manual adjustment when skipped), and the change is in the activity log (INV-21). New stock arriving is
   * handed to `arrivals`, which records it as a purchase received in full, with no supplier or cost (PUR-07).
   */
  async setStock(
    tenantId: string,
    productId: string,
    variantId: string,
    input: SetStockInput,
    actor: CatalogueActor,
    arrivals: StockArrivals,
  ): Promise<ProductStockView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const variant = await this.holderOf(tx, tenantId, productId, variantId);
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
      if (change === 0) this.refuseSerialsWithout(variant, input.serials);
      if (change > 0 && input.reason === StockEditReason.NewStock) {
        await arrivals.arrived(
          tx,
          tenantId,
          {
            productId,
            variantId,
            quantity: quantityOf(change),
            unitCost: null,
            supplier: null,
            note: input.note ?? null,
            ...batchChoiceOf(variant, input, true),
            serials: await this.serialsOf(tx, tenantId, variant, input.serials, change),
          },
          who,
        );
      } else if (change !== 0) {
        const batch = batchChoiceOf(variant, input, change > 0);
        const serials = await this.serialsOf(tx, tenantId, variant, input.serials, change);
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
          [
            {
              variantId,
              delta: quantityOf(change),
              reason,
              note: input.note ?? null,
              ...batch,
              serials,
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
   * INV-10: the average unit cost typed in by hand, until a purchase receipt carrying a cost sets it. Never public, so
   * the catalogue version stays; in the activity log.
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
      const variant = await this.holderOf(tx, tenantId, productId, variantId);
      if (await this.store.hasCostedReceipt(tx, tenantId, variantId)) {
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

  /**
   * INV-06, INV-24, PUR-07: stock that arrived, added to what is held and handed to `arrivals`, which records it as a
   * purchase received in full (with the supplier and cost, if given). On a variant of a product sharing its stock it is
   * a whole number of that variant's packs, at a cost per pack, and arrives on the shared stock, at a cost per unit; on
   * the shared stock, in the product's unit; on any other variant, units.
   */
  async addStock(
    tenantId: string,
    productId: string,
    variantId: string,
    input: AddStockInput,
    actor: CatalogueActor,
    arrivals: StockArrivals,
  ): Promise<ProductStockView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const variant = await this.variantOf(tx, tenantId, productId, variantId);
      if (variant.product.stockTracking !== StockTracking.Tracked) {
        throw new ApiError('conflict', 'MadeToOrderHasNoStock', {});
      }
      const packs = variant.product.sharedStock && !variant.isStockHolder;
      const whole = packs || !MEASURED_STOCK_UNITS.includes(variant.product.stockUnit);
      if (whole && !Number.isInteger(input.quantity)) {
        throw new FieldsError([
          {
            field: 'quantity',
            problem: FieldProblemCode.NotAllowed,
            messageKey: packs ? 'WholePacksOnly' : 'WholeUnitsOnly',
          },
        ]);
      }
      const batch = batchChoiceOf(variant, input, true);
      const serials = await this.serialsOf(
        tx,
        tenantId,
        variant,
        input.serials,
        milli(input.quantity),
      );
      const quantity = quantityOf(milli(input.quantity));
      const cost = input.unitCost === undefined || input.unitCost === null ? null : input.unitCost;
      // INV-24: packs of a size arrive on the shared stock, and a pack's cost becomes a cost per unit of it.
      const holder = packs
        ? (await this.store.findStockHolders(tx, tenantId, [productId]))[0]
        : variant;
      const pack = variant.packAmount ?? '0';
      if (!holder) throw new Error('a product sharing its stock has no stock holder');
      await arrivals.arrived(
        tx,
        tenantId,
        {
          productId,
          variantId: holder.variantId,
          quantity: packs ? packsToStock(quantity, pack) : quantity,
          unitCost:
            cost === null ? null : packs ? unitCostOfPack(cost.toFixed(2), pack) : cost.toFixed(4),
          supplier:
            input.supplierId !== undefined
              ? { id: input.supplierId }
              : input.supplierName !== undefined
                ? { name: input.supplierName }
                : null,
          note: input.note ?? null,
          ...batch,
          serials,
        },
        who,
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
      // INV-14: the serials each movement brought in or took out.
      const moved = new Map<number, string[]>();
      for (const serial of await this.serials.listForMovements(
        tx,
        tenantId,
        rows.map((row) => row.id),
      )) {
        for (const id of [serial.receivedMovementId, serial.leftMovementId]) {
          if (id !== null) moved.set(id, [...(moved.get(id) ?? []), serial.serial]);
        }
      }
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
          batch:
            row.batchId !== null
              ? { id: row.batchId, batchCode: row.batchCode, expiresOn: row.expiresOn }
              : null,
          serials: moved.get(row.id) ?? [],
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
    lines: {
      variantId: string;
      quantity: string;
      batch?: BatchDescription;
      serials?: string[];
      unitCost?: string;
    }[],
    who: ResolvedActor,
  ): Promise<void> {
    await this.ledger.apply(
      tx,
      tenantId,
      lines.map((line) => ({
        variantId: line.variantId,
        delta: quantityOf(milli(line.quantity)),
        reason: StockReason.Initial,
        batch: line.batch ?? null,
        serials: line.serials ?? null,
        ...(line.unitCost !== undefined ? { unitCost: costOf(line.unitCost) } : {}),
      })),
      who,
    );
    // INV-10: only a purchase receipt moves the average, so an opening cost is kept as the cost entered by hand, which
    // a receipt carrying a cost takes over later.
    for (const line of lines) {
      if (line.unitCost !== undefined) {
        await this.store.setAvgCost(tx, tenantId, line.variantId, costOf(line.unitCost));
      }
    }
  }

  /**
   * INV-02: everything the product holds written off to zero, recorded, before it stops being tracked. Refused while
   * units are held for orders (INV-15): those orders ship or are let go first.
   */
  async beforeUntracking(
    tx: Transaction,
    tenantId: string,
    productId: string,
    who: ResolvedActor,
  ): Promise<void> {
    const stock = await this.store.listVariantStock(tx, tenantId, [productId]);
    if (stock.some((row) => milli(row.reserved) > 0)) {
      throw new ApiError('conflict', 'UnitsHeldForOrders', {});
    }
    const held = stock.filter((row) => milli(row.onHand) > 0);
    if (held.length === 0) return;
    // INV-14: every serial-numbered unit goes with its serial. Each level is locked before its serials, as the ledger
    // takes them.
    const serials = new Map<string, string[]>();
    const inLockOrder = [...held].sort((a, b) =>
      a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0,
    );
    for (const row of inLockOrder) {
      await this.store.lockLevel(tx, tenantId, row.variantId);
      const own = await this.serials.lockHeld(tx, tenantId, row.variantId);
      serials.set(
        row.variantId,
        own.map((serial) => serial.serial),
      );
    }
    await this.ledger.apply(
      tx,
      tenantId,
      held.map((row) => ({
        variantId: row.variantId,
        delta: quantityOf(-milli(row.onHand)),
        reason: StockReason.ManualAdjustment,
        note: UNTRACKING_NOTE,
        serials: serials.get(row.variantId) ?? null,
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

  async takenSerials(tx: Transaction, tenantId: string, serials: string[]): Promise<string[]> {
    return [...(await this.serialEntry.taken(tx, tenantId, serials))];
  }

  async holdsStock(tx: Transaction, tenantId: string, productId: string): Promise<boolean> {
    return (await this.store.listVariantStock(tx, tenantId, [productId])).some(
      (row) => milli(row.onHand) !== 0 || milli(row.reserved) !== 0,
    );
  }

  // --- Building blocks ---

  /**
   * INV-24: a variant that holds its own stock: an ordinary one, or a product's stock holder while it shares. A variant
   * drawing on a shared stock holds none, so its stock and cost are the shared stock's.
   */
  private async holderOf(
    tx: Transaction,
    tenantId: string,
    productId: string,
    variantId: string,
  ): Promise<StockVariantRow> {
    const variant = await this.variantOf(tx, tenantId, productId, variantId);
    if (variant.isStockHolder && !variant.product.sharedStock) {
      throw new ApiError('not_found', 'ProductNotFound', {});
    }
    if (variant.product.sharedStock && !variant.isStockHolder) {
      throw new ApiError('conflict', 'StockIsShared', {});
    }
    return variant;
  }

  /**
   * INV-14: the serials a stock change names, as stored: arriving at most one per unit and held nowhere in the shop,
   * or leaving from this variant's units in stock. Only a serial-numbered product has serials.
   */
  private async serialsOf(
    tx: Transaction,
    tenantId: string,
    variant: StockVariantRow,
    entered: string[] | undefined,
    changeMilli: number,
  ): Promise<string[]> {
    this.refuseSerialsWithout(variant, entered);
    const units = Math.abs(changeMilli) / 1000;
    const format = variant.product.serialFormat;
    return changeMilli > 0
      ? this.serialEntry.arriving(tx, tenantId, entered, format, 'serials', units)
      : this.serialEntry.leaving(
          tx,
          tenantId,
          variant.variantId,
          entered,
          format,
          'serials',
          units,
        );
  }

  private refuseSerialsWithout(variant: StockVariantRow, entered: string[] | undefined): void {
    if (entered && entered.length > 0 && !variant.product.serialTracked) {
      throw new FieldsError([
        { field: 'serials', problem: FieldProblemCode.NotAllowed, messageKey: 'SerialsNotTracked' },
      ]);
    }
  }

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
    const [view] = await this.viewsOf(
      tx,
      tenantId,
      [{ id: productId, ...first.product }],
      rows,
      canSeeCost,
    );
    if (!view) throw new ApiError('not_found', 'ProductNotFound', {});
    return view;
  }

  /**
   * INV-01, INV-24: the stock views of several products from their variants' rows, reading the serials held and what is
   * coming once for all of them. One product's stock screen and the Stock page both come from here.
   */
  private async viewsOf(
    tx: Transaction,
    tenantId: string,
    products: readonly StockedProduct[],
    rows: readonly VariantStockRow[],
    canSeeCost: boolean,
  ): Promise<ProductStockView[]> {
    const serialTracked = new Set(
      products.filter((product) => product.serialTracked).map((product) => product.id),
    );
    const counted = rows.filter((row) => serialTracked.has(row.productId));
    const held =
      counted.length > 0
        ? await this.serials.countHeld(
            tx,
            tenantId,
            counted.map((row) => row.variantId),
          )
        : new Map<string, number>();
    const incoming = await this.store.incoming(
      tx,
      tenantId,
      rows.map((row) => row.variantId),
    );
    return products.map((product) =>
      this.viewOf(
        product,
        rows.filter((row) => row.productId === product.id),
        product.serialTracked ? held : null,
        incoming,
        canSeeCost,
      ),
    );
  }

  private viewOf(
    product: StockedProduct,
    rows: readonly VariantStockRow[],
    held: ReadonlyMap<string, number> | null,
    incoming: ReadonlyMap<string, string>,
    canSeeCost: boolean,
  ): ProductStockView {
    const productId = product.id;
    const pool = product.sharedStock
      ? rows.find((row) => row.isStockHolder && !row.retired)
      : undefined;
    const variants: VariantStockView[] = pool
      ? rows
          .filter((row) => !row.isStockHolder && !row.retired)
          .map((row) => this.packView(row, pool, product.lowStockThreshold, canSeeCost))
      : rows
          .filter((row) => !row.isStockHolder && (!row.retired || milli(row.onHand) > 0))
          .map((row) => ({
            variantId: row.variantId,
            optionIds: optionIdsOfKey(row.combinationKey),
            sku: row.sku,
            retired: row.retired,
            onHand: row.onHand,
            reserved: row.reserved,
            unsellable: row.unsellable,
            reservedExpired: reservedExpired(row),
            available: row.available,
            packAmount: null,
            missingSerials:
              held !== null ? milli(row.onHand) / 1000 - (held.get(row.variantId) ?? 0) : null,
            incoming: incoming.get(row.variantId) ?? NONE_INCOMING,
            state: variantState(row.available, product.lowStockThreshold),
            ...(canSeeCost ? { avgCost: row.avgCost } : {}),
          }));
    const shared: SharedStockView | null = pool
      ? {
          variantId: pool.variantId,
          onHand: pool.onHand,
          reserved: pool.reserved,
          unsellable: pool.unsellable,
          reservedExpired: reservedExpired(pool),
          available: pool.available,
          incoming: incoming.get(pool.variantId) ?? NONE_INCOMING,
          state: variantState(pool.available, product.lowStockThreshold),
          ...(canSeeCost ? { avgCost: pool.avgCost } : {}),
        }
      : null;
    return {
      productId,
      stockTracking: product.stockTracking,
      stockUnit: product.stockUnit,
      lowStockThreshold: product.lowStockThreshold,
      state:
        product.stockTracking === StockTracking.Tracked
          ? productState(variants.filter((row) => !row.retired).map((row) => row.state))
          : product.stockState,
      shared,
      variants,
    };
  }

  /** INV-24: a variant drawing on the shared stock: the whole packs it makes, and a pack's share of the cost. */
  private packView(
    row: VariantStockRow,
    pool: VariantStockRow,
    threshold: string,
    canSeeCost: boolean,
  ): VariantStockView {
    const pack = row.packAmount ?? '0';
    return {
      variantId: row.variantId,
      optionIds: optionIdsOfKey(row.combinationKey),
      sku: row.sku,
      retired: false,
      onHand: null,
      reserved: null,
      unsellable: null,
      reservedExpired: null,
      available: quantityOf(packsOf(pool.available, pack) * 1000),
      missingSerials: null,
      incoming: null,
      packAmount: row.packAmount,
      state: sharedVariantState(pool.available, pack, threshold),
      ...(canSeeCost
        ? { avgCost: pool.avgCost !== null ? packCost(pack, pool.avgCost) : null }
        : {}),
    };
  }
}
