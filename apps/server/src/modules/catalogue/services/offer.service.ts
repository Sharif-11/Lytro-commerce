import { Inject, Injectable } from '@nestjs/common';
import type {
  OfferHolderRow,
  OfferItemRow,
  OfferSizeRow,
  SelectOffer,
  SelectOfferPrice,
  Transaction,
} from '@lytronix/db';
import {
  AuditAction,
  FieldProblemCode,
  OfferState,
  ServerFieldProblemCode,
  type CreateOfferInput,
  type OfferCut,
  type OfferItem,
  type OfferPickableQuery,
  type OfferPreviewInput,
  type UpdateOfferInput,
  OFFER_PICKABLE_PAGE_SIZE,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import type { ImageView } from '../../../common/media-links';
import type { CatalogueTransactions } from '../ports/catalogue-stores';
import type { OfferStore } from '../ports/offer-store';
import { CATALOGUE_TRANSACTIONS, OFFER_STORE } from '../tokens';
import type { CatalogueActor } from '../types/catalogue';
import { CatalogueActivity, type ResolvedActor } from './catalogue-activity';
import { CatalogueImages } from './catalogue-images';
import { CatalogueWrites } from './catalogue-writes';
import { OfferPrices, cutOf, cutPrice, priceNow, sizesOf, struckPrice } from './offer-prices';
import { nextFreeSlug, slugOf } from './slug';

/** A low and high price across the sizes something covers. */
export interface PriceSpan {
  low: string;
  high: string;
}

/** OF-7, OF-16: the other offer that already holds a product or design. */
export interface OfferHolderView {
  offerId: string;
  name: string;
}

/** OFFERS-PLAN: an offer as the Offers list shows it. */
export interface OfferSummaryView {
  id: string;
  name: string;
  slug: string;
  state: OfferState;
  cut: OfferCut;
  products: number;
  designs: number;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface OffersView {
  offers: OfferSummaryView[];
}

/**
 * OF-2, OF-9, OF-10: one product (or one of its designs) in an offer, with its prices across the sizes it covers --
 * what they sell at without the offer (`price`), the price struck through beside the offer price (`was`) and the offer
 * price (`offer`; null when the cut takes some size below ৳1, `belowOne`). An ended offer's show only `price`, its
 * prices now (OF-12).
 */
export interface OfferItemView {
  productId: string;
  designId: string | null;
  name: string;
  designName: string | null;
  designNumber: number | null;
  /** How many designs the product has, so a screen can say "2 of 5 designs". */
  designCount: number;
  image: ImageView | null;
  active: boolean;
  stockState: string;
  price: PriceSpan | null;
  was: PriceSpan | null;
  offer: PriceSpan | null;
  belowOne: boolean;
  heldBy: OfferHolderView | null;
}

export interface OfferView extends OfferSummaryView {
  items: OfferItemView[];
}

/** OF-2: a new offer's or a change's prices before anything is saved. */
export interface OfferPreviewView {
  items: OfferItemView[];
}

/** OF-25: a design in the picker. */
export interface OfferPickDesignView {
  designId: string;
  name: string;
  number: number;
  image: ImageView | null;
  price: string | null;
  heldBy: OfferHolderView | null;
}

/** OF-25: a product in the picker, its designs, and the offer that holds it whole (if one does). */
export interface OfferPickView {
  productId: string;
  name: string;
  image: ImageView | null;
  price: PriceSpan | null;
  regularPrice: string | null;
  active: boolean;
  stockState: string;
  isCombo: boolean;
  heldBy: OfferHolderView | null;
  designs: OfferPickDesignView[];
}

export interface OfferPickableView {
  products: OfferPickView[];
  more: boolean;
}

function spanOf(values: readonly number[]): PriceSpan | null {
  if (values.length === 0) return null;
  return {
    low: Math.min(...values).toFixed(2),
    high: Math.max(...values).toFixed(2),
  };
}

function itemKey(item: { productId: string; designOptionId: string | null }): string {
  return `${item.productId}:${item.designOptionId ?? ''}`;
}

function rowsOf(items: readonly OfferItem[]): OfferItemRow[] {
  return items.map((item) => ({ productId: item.productId, designOptionId: item.designId }));
}

function summaryOf(
  row: SelectOffer,
  counts: { products: number; designs: number },
): OfferSummaryView {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    state: row.state,
    cut: cutOf(row),
    products: counts.products,
    designs: counts.designs,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** OF-16: whether a holder's product or design is the same as, or inside, the item's (or the other way round). */
function overlaps(
  item: { productId: string; designOptionId: string | null },
  holder: OfferHolderRow,
): boolean {
  if (item.productId !== holder.productId) return false;
  return (
    item.designOptionId === null ||
    holder.designOptionId === null ||
    item.designOptionId === holder.designOptionId
  );
}

/**
 * OFFERS-PLAN (the owner, 2026-11-18 and 19): a shop's offers -- a name, a cut, products or some of their designs --
 * made ready, run, changed while running, ended, run again, deleted. Every change is one of the shop's catalogue
 * writes, so it waits its turn with product saves; prices are set and put back by OfferPrices, and each change goes in
 * the shop's activity log.
 */
@Injectable()
export class OfferService {
  constructor(
    @Inject(OFFER_STORE) private readonly store: OfferStore,
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(CatalogueWrites) private readonly writes: CatalogueWrites,
    @Inject(OfferPrices) private readonly prices: OfferPrices,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(CatalogueImages) private readonly images: CatalogueImages,
  ) {}

  list(tenantId: string): Promise<OffersView> {
    return this.transactions.run(async (tx) => this.listWithin(tx, tenantId));
  }

  read(tenantId: string, id: string): Promise<OfferView> {
    return this.transactions.run(async (tx) => {
      const offer = await this.store.find(tx, tenantId, id);
      if (!offer) throw new ApiError('not_found', 'OfferNotFound', {});
      return this.viewWithin(tx, tenantId, offer);
    });
  }

  /** OF-2: the prices a cut gives these products before anything is saved, and any held by another offer. */
  preview(tenantId: string, input: OfferPreviewInput): Promise<OfferPreviewView> {
    return this.transactions.run(async (tx) => {
      const items = rowsOf(input.items);
      await this.checkItems(tx, tenantId, items);
      const holders = await this.store.holders(
        tx,
        tenantId,
        items.map((item) => item.productId),
        input.offerId ?? null,
      );
      return { items: await this.itemViews(tx, tenantId, items, { cut: input.cut, holders }) };
    });
  }

  async create(
    tenantId: string,
    input: CreateOfferInput,
    actor: CatalogueActor,
  ): Promise<OfferView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.writes.run(tenantId, async (tx) => {
      const items = rowsOf(input.items);
      await this.checkItems(tx, tenantId, items);
      await this.refuseHeld(tx, tenantId, items, null);
      const sizes = sizesOf(
        items,
        await this.store.sizes(
          tx,
          tenantId,
          items.map((item) => item.productId),
        ),
      );
      if (input.start) await this.refuseBelowOne(tx, tenantId, sizes, input.cut);
      const slug = nextFreeSlug(
        slugOf(input.name, 'offer'),
        await this.store.slugsLike(tx, tenantId, slugOf(input.name, 'offer')),
      );
      const offer = await this.store.insert(tx, {
        tenantId,
        name: input.name,
        slug,
        cutKind: input.cut.kind,
        cutAmount: input.cut.amount,
        state: input.start ? OfferState.Running : OfferState.Waiting,
        startedAt: input.start ? new Date() : null,
        endedAt: null,
      });
      await this.store.replaceItems(tx, tenantId, offer.id, items);
      if (input.start) {
        await this.prices.apply(tx, tenantId, offer, sizes);
        await this.prices.settle(
          tx,
          tenantId,
          items.map((item) => item.productId),
        );
      }
      await this.record(
        tx,
        tenantId,
        who,
        input.start ? AuditAction.OfferStarted : AuditAction.OfferSaved,
        offer,
      );
      return this.viewWithin(tx, tenantId, offer);
    });
  }

  /** OF-15: a new name, cut or set of products -- on a running offer, in the shop at once. */
  async update(
    tenantId: string,
    id: string,
    input: UpdateOfferInput,
    actor: CatalogueActor,
  ): Promise<OfferView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.writes.run(tenantId, async (tx) => {
      const offer = await this.lockLive(tx, tenantId, id);
      const before = await this.store.items(tx, tenantId, offer.id);
      const items = input.items ? rowsOf(input.items) : before;
      const cut = input.cut ?? cutOf(offer);
      if (input.items) {
        await this.checkItems(tx, tenantId, items);
        await this.refuseHeld(tx, tenantId, items, offer.id);
      }
      const running = offer.state === OfferState.Running;
      const set = running ? await this.store.prices(tx, tenantId, offer.id) : [];
      const touched = new Set([...before, ...items].map((item) => item.productId));
      const sizes = sizesOf(items, await this.store.sizes(tx, tenantId, [...touched]));
      if (running) await this.refuseBelowOne(tx, tenantId, sizes, cut, set);
      const changed = await this.store.update(tx, tenantId, offer.id, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.cut ? { cutKind: input.cut.kind, cutAmount: input.cut.amount } : {}),
      });
      if (!changed) throw new ApiError('not_found', 'OfferNotFound', {});
      if (input.items) await this.store.replaceItems(tx, tenantId, offer.id, items);
      if (running) {
        const wanted = new Set(sizes.map((size) => size.variantId));
        const kept = set.filter((row) => wanted.has(row.variantId));
        await this.prices.restore(
          tx,
          tenantId,
          set.filter((row) => !wanted.has(row.variantId)),
        );
        if (input.cut) await this.prices.recut(tx, tenantId, kept, cut);
        const had = new Set(set.map((row) => row.variantId));
        await this.prices.apply(
          tx,
          tenantId,
          changed,
          sizes.filter((size) => !had.has(size.variantId)),
        );
        await this.prices.settle(tx, tenantId, touched);
      }
      await this.record(tx, tenantId, who, AuditAction.OfferSaved, changed);
      return this.viewWithin(tx, tenantId, changed);
    });
  }

  /** OF-14: a waiting offer starts -- its prices in the shop at once. */
  async start(tenantId: string, id: string, actor: CatalogueActor): Promise<OfferView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.writes.run(tenantId, async (tx) => {
      const offer = await this.lockLive(tx, tenantId, id);
      if (offer.state !== OfferState.Waiting) {
        throw new ApiError('conflict', 'OfferAlreadyStarted', {});
      }
      const items = await this.store.items(tx, tenantId, offer.id);
      if (items.length === 0) throw new ApiError('conflict', 'OfferHasNoProducts', {});
      await this.refuseHeld(tx, tenantId, items, offer.id);
      const sizes = sizesOf(
        items,
        await this.store.sizes(
          tx,
          tenantId,
          items.map((item) => item.productId),
        ),
      );
      await this.refuseBelowOne(tx, tenantId, sizes, cutOf(offer));
      const started = await this.store.update(tx, tenantId, offer.id, {
        state: OfferState.Running,
        startedAt: new Date(),
      });
      if (!started) throw new ApiError('not_found', 'OfferNotFound', {});
      await this.prices.apply(tx, tenantId, started, sizes);
      await this.prices.settle(
        tx,
        tenantId,
        items.map((item) => item.productId),
      );
      await this.record(tx, tenantId, who, AuditAction.OfferStarted, started);
      return this.viewWithin(tx, tenantId, started);
    });
  }

  /** OF-3, OF-20: every price the offer set goes back as it was; orders already placed keep theirs. */
  async end(tenantId: string, id: string, actor: CatalogueActor): Promise<OfferView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.writes.run(tenantId, async (tx) => {
      const offer = await this.lockLive(tx, tenantId, id);
      if (offer.state !== OfferState.Running) throw new ApiError('conflict', 'OfferNotRunning', {});
      const set = await this.store.prices(tx, tenantId, offer.id);
      await this.prices.restore(tx, tenantId, set);
      const ended = await this.store.update(tx, tenantId, offer.id, {
        state: OfferState.Ended,
        endedAt: new Date(),
      });
      if (!ended) throw new ApiError('not_found', 'OfferNotFound', {});
      const items = await this.store.items(tx, tenantId, offer.id);
      await this.prices.settle(tx, tenantId, [
        ...set.map((row) => row.productId),
        ...items.map((item) => item.productId),
      ]);
      await this.record(tx, tenantId, who, AuditAction.OfferEnded, ended);
      return this.viewWithin(tx, tenantId, ended);
    });
  }

  /** OF-14: Run it again -- a waiting copy, the same name, cut and products still in the shop. */
  async copy(tenantId: string, id: string, actor: CatalogueActor): Promise<OfferView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.writes.run(tenantId, async (tx) => {
      const source = await this.store.find(tx, tenantId, id);
      if (!source) throw new ApiError('not_found', 'OfferNotFound', {});
      const items = await this.store.items(tx, tenantId, source.id);
      if (items.length === 0) throw new ApiError('conflict', 'OfferHasNoProducts', {});
      await this.refuseHeld(tx, tenantId, items, source.id);
      const base = slugOf(source.name, 'offer');
      const copy = await this.store.insert(tx, {
        tenantId,
        name: source.name,
        slug: nextFreeSlug(base, await this.store.slugsLike(tx, tenantId, base)),
        cutKind: source.cutKind,
        cutAmount: source.cutAmount,
        state: OfferState.Waiting,
        startedAt: null,
        endedAt: null,
      });
      await this.store.replaceItems(tx, tenantId, copy.id, items);
      await this.record(tx, tenantId, who, AuditAction.OfferSaved, copy);
      return this.viewWithin(tx, tenantId, copy);
    });
  }

  /** OF-14: a waiting or ended offer deleted; a running one is ended first. */
  async remove(tenantId: string, id: string, actor: CatalogueActor): Promise<OffersView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.writes.run(tenantId, async (tx) => {
      const offer = await this.store.lock(tx, tenantId, id);
      if (!offer) throw new ApiError('not_found', 'OfferNotFound', {});
      if (offer.state === OfferState.Running) {
        throw new ApiError('conflict', 'OfferRunningCannotDelete', {});
      }
      await this.store.delete(tx, tenantId, offer.id);
      await this.record(tx, tenantId, who, AuditAction.OfferDeleted, offer);
      return this.listWithin(tx, tenantId);
    });
  }

  /** OF-25: a page of the picker's products, each with its designs and the offer (other than `offerId`) holding it. */
  pickable(tenantId: string, query: OfferPickableQuery): Promise<OfferPickableView> {
    return this.transactions.run(async (tx) => {
      const rows = await this.store.pickable(tx, tenantId, {
        search: query.search ?? null,
        categoryId: query.categoryId ?? null,
        offset: query.offset,
        limit: OFFER_PICKABLE_PAGE_SIZE,
      });
      const page = rows.slice(0, OFFER_PICKABLE_PAGE_SIZE);
      const ids = page.map((row) => row.productId);
      const designs = await this.store.designs(tx, tenantId, ids);
      const designPrices = await this.store.designPrices(tx, tenantId, ids);
      const holders = await this.store.holders(tx, tenantId, ids, query.offerId ?? null);
      const images = await this.images.viewsOf(tx, tenantId, [
        ...page.map((row) => row.coverMediaId),
        ...designs.map((design) => design.coverMediaId),
      ]);
      const holderOf = (productId: string, designId: string | null): OfferHolderView | null => {
        const found = holders.find(
          (holder) =>
            overlaps({ productId, designOptionId: designId }, holder) &&
            (designId !== null || holder.designOptionId === null),
        );
        return found ? { offerId: found.offerId, name: found.offerName } : null;
      };
      return {
        products: page.map((row) => {
          const own = designs.filter((design) => design.productId === row.productId);
          return {
            productId: row.productId,
            name: row.name,
            image: row.coverMediaId === null ? null : (images.get(row.coverMediaId) ?? null),
            price:
              row.minPrice === null
                ? null
                : { low: row.minPrice, high: row.maxPrice ?? row.minPrice },
            regularPrice: row.minRegularPrice,
            active: row.active,
            stockState: row.stockState,
            isCombo: row.isCombo,
            heldBy: holderOf(row.productId, null),
            designs:
              own.length < 2
                ? []
                : own.map((design) => ({
                    designId: design.designId,
                    name: design.name,
                    number: design.number,
                    image:
                      design.coverMediaId === null
                        ? null
                        : (images.get(design.coverMediaId) ?? null),
                    price: designPrices.get(design.designId) ?? null,
                    heldBy: holderOf(row.productId, design.designId),
                  })),
          };
        }),
        more: rows.length > OFFER_PICKABLE_PAGE_SIZE,
      };
    });
  }

  private async listWithin(tx: Transaction, tenantId: string): Promise<OffersView> {
    const rows = await this.store.list(tx, tenantId);
    return { offers: rows.map((row) => summaryOf(row, row)) };
  }

  /** The offer, locked for this change; not found, or ended (OF-14: an ended offer is run again, not changed). */
  private async lockLive(tx: Transaction, tenantId: string, id: string): Promise<SelectOffer> {
    const offer = await this.store.lock(tx, tenantId, id);
    if (!offer) throw new ApiError('not_found', 'OfferNotFound', {});
    if (offer.state === OfferState.Ended)
      throw new ApiError('conflict', 'OfferEndedCannotChange', {});
    return offer;
  }

  /** Each product is the shop's and not deleted, and each design one of its own product's. */
  private async checkItems(
    tx: Transaction,
    tenantId: string,
    items: readonly OfferItemRow[],
  ): Promise<void> {
    const productIds = [...new Set(items.map((item) => item.productId))];
    const found = new Set(
      (await this.store.products(tx, tenantId, productIds)).map((row) => row.productId),
    );
    const designs = new Set(
      (await this.store.designs(tx, tenantId, productIds)).map(
        (row) => `${row.productId}:${row.designId}`,
      ),
    );
    const missing = items.some(
      (item) =>
        !found.has(item.productId) || (item.designOptionId !== null && !designs.has(itemKey(item))),
    );
    if (missing) {
      throw new FieldsError([
        {
          field: 'items',
          problem: ServerFieldProblemCode.NotFound,
          messageKey: 'OfferItemsChanged',
        },
      ]);
    }
  }

  /** OF-7, OF-16: refuses a product or design another waiting or running offer holds, naming both. */
  private async refuseHeld(
    tx: Transaction,
    tenantId: string,
    items: readonly OfferItemRow[],
    offerId: string | null,
  ): Promise<void> {
    const holders = await this.store.holders(
      tx,
      tenantId,
      items.map((item) => item.productId),
      offerId,
    );
    for (const item of items) {
      const holder = holders.find((each) => overlaps(item, each));
      if (!holder) continue;
      const product = (await this.store.products(tx, tenantId, [item.productId]))[0];
      throw new FieldsError(
        [
          {
            field: 'items',
            problem: ServerFieldProblemCode.Taken,
            messageKey: 'OfferItemHeld',
            params: { product: product?.name ?? '', offer: holder.offerName },
          },
        ],
        'conflict',
      );
    }
  }

  /**
   * OF-18: refuses a cut that takes any size below ৳1, naming the products. A size a running offer already set is
   * worked out from what it sold at when the offer took it (`set`).
   */
  private async refuseBelowOne(
    tx: Transaction,
    tenantId: string,
    sizes: readonly OfferSizeRow[],
    cut: OfferCut,
    set: readonly SelectOfferPrice[] = [],
  ): Promise<void> {
    const startOf = new Map(set.map((row) => [row.variantId, row.priceAtStart]));
    const low = [
      ...new Set(
        sizes
          .filter((size) => cutPrice(startOf.get(size.variantId) ?? priceNow(size), cut) === null)
          .map((size) => size.productId),
      ),
    ];
    if (low.length === 0) return;
    const names = (await this.store.products(tx, tenantId, low)).map((row) => row.name);
    throw new FieldsError([
      {
        field: 'cut',
        problem: FieldProblemCode.TooLarge,
        messageKey: 'OfferCutTooBig',
        params: { products: names.join(', ') },
      },
    ]);
  }

  private async viewWithin(
    tx: Transaction,
    tenantId: string,
    offer: SelectOffer,
  ): Promise<OfferView> {
    const items = await this.store.items(tx, tenantId, offer.id);
    const state = offer.state;
    const views = await this.itemViews(tx, tenantId, items, {
      cut: state === OfferState.Ended ? null : cutOf(offer),
      set: state === OfferState.Running ? await this.store.prices(tx, tenantId, offer.id) : [],
      holders:
        state === OfferState.Waiting
          ? await this.store.holders(
              tx,
              tenantId,
              items.map((item) => item.productId),
              offer.id,
            )
          : [],
    });
    return {
      ...summaryOf(offer, {
        products: new Set(items.map((item) => item.productId)).size,
        designs: items.filter((item) => item.designOptionId !== null).length,
      }),
      items: views,
    };
  }

  /**
   * OF-2, OF-10, OF-12: each item with its prices. A running offer's sizes show what the offer set (`set`); otherwise
   * each size's price now, and with a cut, the offer price it would get. No cut (an ended offer): prices now only.
   */
  private async itemViews(
    tx: Transaction,
    tenantId: string,
    items: readonly OfferItemRow[],
    context: {
      cut: OfferCut | null;
      set?: readonly SelectOfferPrice[];
      holders?: readonly OfferHolderRow[];
    },
  ): Promise<OfferItemView[]> {
    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = new Map(
      (await this.store.products(tx, tenantId, productIds)).map((row) => [row.productId, row]),
    );
    const designs = await this.store.designs(tx, tenantId, productIds);
    const sizes = await this.store.sizes(tx, tenantId, productIds);
    const set = new Map((context.set ?? []).map((row) => [row.variantId, row]));
    const images = await this.images.viewsOf(tx, tenantId, [
      ...[...products.values()].map((row) => row.coverMediaId),
      ...designs.map((row) => row.coverMediaId),
    ]);
    const views: OfferItemView[] = [];
    for (const item of items) {
      const product = products.get(item.productId);
      if (!product) continue;
      const own = designs.filter((design) => design.productId === item.productId);
      const design = own.find((each) => each.designId === item.designOptionId) ?? null;
      const covered = sizesOf([item], sizes);
      const prices: number[] = [];
      const was: number[] = [];
      const offered: number[] = [];
      let belowOne = false;
      for (const size of covered) {
        const row = set.get(size.variantId);
        if (row) {
          prices.push(Number(row.priceAtStart));
          was.push(Number(size.ownRegular ?? size.productRegular ?? row.priceAtStart));
          offered.push(Number(row.offerPrice));
          continue;
        }
        prices.push(Number(priceNow(size)));
        if (context.cut === null) continue;
        was.push(Number(struckPrice(size)));
        const after = cutPrice(priceNow(size), context.cut);
        if (after === null) belowOne = true;
        else offered.push(after);
      }
      const holder = (context.holders ?? []).find((each) => overlaps(item, each));
      const cover = design?.coverMediaId ?? product.coverMediaId;
      views.push({
        productId: item.productId,
        designId: item.designOptionId,
        name: product.name,
        designName: design?.name ?? null,
        designNumber: design?.number ?? null,
        designCount: own.length,
        image: cover === null ? null : (images.get(cover) ?? null),
        active: product.active,
        stockState: product.stockState,
        price: spanOf(prices),
        was: context.cut === null && set.size === 0 ? null : spanOf(was),
        offer: belowOne ? null : context.cut === null && set.size === 0 ? null : spanOf(offered),
        belowOne,
        heldBy: holder ? { offerId: holder.offerId, name: holder.offerName } : null,
      });
    }
    // The seller's own list: by name, a product's designs in their order.
    return views.sort(
      (a, b) => a.name.localeCompare(b.name) || (a.designNumber ?? 0) - (b.designNumber ?? 0),
    );
  }

  private record(
    tx: Transaction,
    tenantId: string,
    who: ResolvedActor,
    action: AuditAction,
    offer: SelectOffer,
  ): Promise<void> {
    return this.activity.record(
      tx,
      tenantId,
      who,
      action,
      { type: 'offer', id: offer.id },
      {
        name: offer.name,
        cut: `${String(offer.cutAmount)} ${offer.cutKind}`,
      },
    );
  }
}
