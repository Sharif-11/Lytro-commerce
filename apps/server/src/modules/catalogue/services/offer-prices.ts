import { Inject, Injectable } from '@nestjs/common';
import type { OfferItemRow, OfferSizeRow, SelectOfferPrice, Transaction } from '@lytronix/db';
import { OfferCutKind, OfferState, type OfferCut } from '@lytronix/validators';
import type { OfferStore } from '../ports/offer-store';
import type { ProductStore } from '../ports/catalogue-stores';
import { OFFER_STORE, PRODUCT_STORE } from '../tokens';
import { CatalogueVersion } from './catalogue-version';

/**
 * OF-2, OF-11, OF-18: the price after the cut, in whole taka rounded down (৳1,011.50 becomes ৳1,011); null when it would
 * fall below ৳1.
 */
export function cutPrice(price: string, cut: OfferCut): number | null {
  const paisa = Math.round(Number(price) * 100);
  const after =
    cut.kind === OfferCutKind.Percent
      ? Math.floor((paisa * (100 - cut.amount)) / 10_000)
      : Math.floor((paisa - cut.amount * 100) / 100);
  return after >= 1 ? after : null;
}

/** OF-2: an offer's cut as its row keeps it. */
export function cutOf(row: { cutKind: OfferCutKind; cutAmount: number }): OfferCut {
  return row.cutKind === OfferCutKind.Taka
    ? { kind: OfferCutKind.Taka, amount: row.cutAmount }
    : { kind: OfferCutKind.Percent, amount: row.cutAmount };
}

/** What a size sells at now: its own price, else its product's. */
export function priceNow(size: OfferSizeRow): string {
  return size.ownPrice ?? size.basePrice;
}

/**
 * OF-6, OF-10: the price struck through beside the offer price -- the regular price it was already on sale from, else
 * the price it sold at.
 */
export function struckPrice(size: OfferSizeRow): string {
  const price = priceNow(size);
  const regular = size.ownRegular ?? size.productRegular;
  return regular !== null && Number(regular) > Number(price) ? regular : price;
}

/** OF-9: the sizes an offer's products and designs cover -- every size of a whole product, every size of a design. */
export function sizesOf(
  items: readonly OfferItemRow[],
  sizes: readonly OfferSizeRow[],
): OfferSizeRow[] {
  const whole = new Set(
    items.filter((item) => item.designOptionId === null).map((item) => item.productId),
  );
  const designs = new Set(
    items
      .filter((item) => item.designOptionId !== null)
      .map((item) => `${item.productId}:${item.designOptionId ?? ''}`),
  );
  return sizes.filter(
    (size) =>
      whole.has(size.productId) ||
      (size.designOptionId !== null && designs.has(`${size.productId}:${size.designOptionId}`)),
  );
}

/** Whole taka as a stored price. */
function taka(amount: number): string {
  return amount.toFixed(2);
}

/**
 * OFFERS-PLAN 4.3 (OF-6, OF-15, OF-17, OF-19): the prices a running offer sets on the sizes it covers, and puts back.
 * Starting saves each size's own price and regular price exactly as they are (null when it takes the product's), sets
 * the offer price and the price struck through beside it; ending writes the saved ones back and drops the rows. The
 * product's own price is never touched, so its other designs sell as before. Every step runs inside the caller's
 * transaction, which is one of the shop's catalogue writes (CatalogueWrites); `settle` then refreshes each product's
 * price range and moves the catalogue version once, clearing the shop's pages from the edge.
 */
@Injectable()
export class OfferPrices {
  constructor(
    @Inject(OFFER_STORE) private readonly store: OfferStore,
    @Inject(PRODUCT_STORE) private readonly products: ProductStore,
    @Inject(CatalogueVersion) private readonly version: CatalogueVersion,
  ) {}

  /** OF-6: the offer's prices set on these sizes (each not yet in a running offer). */
  async apply(
    tx: Transaction,
    tenantId: string,
    offer: { id: string; cutKind: OfferCutKind; cutAmount: number },
    sizes: readonly OfferSizeRow[],
  ): Promise<void> {
    if (sizes.length === 0) return;
    const cut = cutOf(offer);
    const rows = sizes.map((size) => {
      const offered = cutPrice(priceNow(size), cut);
      // The caller has refused any product the cut takes below ৳1 (OF-18); the table's check stands behind it.
      return {
        size,
        offerPrice: taka(offered ?? 0),
      };
    });
    await this.store.insertPrices(
      tx,
      rows.map(({ size, offerPrice }) => ({
        tenantId,
        variantId: size.variantId,
        offerId: offer.id,
        productId: size.productId,
        priceBefore: size.ownPrice,
        regularBefore: size.ownRegular,
        priceAtStart: priceNow(size),
        offerPrice,
      })),
    );
    await this.store.setSizePrices(
      tx,
      tenantId,
      rows.map(({ size, offerPrice }) => ({
        variantId: size.variantId,
        price: offerPrice,
        regularPrice: struckPrice(size),
      })),
    );
  }

  /** OF-6: each size's own price and regular price back as they were, and the offer's rows for them gone. */
  async restore(
    tx: Transaction,
    tenantId: string,
    rows: readonly SelectOfferPrice[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await this.store.setSizePrices(
      tx,
      tenantId,
      rows.map((row) => ({
        variantId: row.variantId,
        price: row.priceBefore,
        regularPrice: row.regularBefore,
      })),
    );
    await this.store.deletePrices(
      tx,
      tenantId,
      rows.map((row) => row.variantId),
    );
  }

  /** OF-15: a new cut on a running offer, worked out again from what each size sold at when the offer took it. */
  async recut(
    tx: Transaction,
    tenantId: string,
    rows: readonly SelectOfferPrice[],
    cut: OfferCut,
  ): Promise<void> {
    const changed = rows.map((row) => ({
      variantId: row.variantId,
      offerPrice: taka(cutPrice(row.priceAtStart, cut) ?? 0),
    }));
    await this.store.setOfferPrices(tx, tenantId, changed);
    await this.store.setSizePrices(
      tx,
      tenantId,
      changed.map((row) => ({ variantId: row.variantId, price: row.offerPrice })),
    );
  }

  /**
   * OF-19: sizes added to a product since its offer started -- a new size of a design in the offer, or of a product in
   * it whole -- join it at its cut. Called after a product's sizes are saved, inside that save.
   */
  async joinNewSizes(tx: Transaction, tenantId: string, productId: string): Promise<boolean> {
    const holders = (await this.store.holders(tx, tenantId, [productId], null)).filter(
      (holder) => holder.offerState === OfferState.Running,
    );
    if (holders.length === 0) return false;
    const taken = new Set(
      (await this.store.pricesOfProducts(tx, tenantId, [productId])).map((row) => row.variantId),
    );
    const sizes = (await this.store.sizes(tx, tenantId, [productId])).filter(
      (size) => !taken.has(size.variantId),
    );
    let joined = false;
    for (const offerId of new Set(holders.map((holder) => holder.offerId))) {
      const offer = await this.store.find(tx, tenantId, offerId);
      if (!offer) continue;
      const items = holders
        .filter((holder) => holder.offerId === offerId)
        .map((holder) => ({ productId: holder.productId, designOptionId: holder.designOptionId }));
      const cut = cutOf(offer);
      // A size the cut would take below ৳1 keeps its own price rather than refuse the seller's save.
      const fresh = sizesOf(items, sizes).filter((size) => cutPrice(priceNow(size), cut) !== null);
      await this.apply(tx, tenantId, offer, fresh);
      joined ||= fresh.length > 0;
    }
    return joined;
  }

  /** Each product's price range again, and the catalogue version moved once (the shop's pages leave the edge). */
  async settle(tx: Transaction, tenantId: string, productIds: Iterable<string>): Promise<void> {
    for (const productId of new Set(productIds)) {
      await this.products.refreshPriceRange(tx, tenantId, productId);
    }
    await this.version.bump(tx, tenantId);
  }
}
