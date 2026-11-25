import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { ReservationStatus } from '@lytronix/validators';
import type { ReservationStore } from '../ports/reservation-store';
import type { StockStore } from '../ports/stock-store';
import { RESERVATION_STORE, STOCK_STORE } from '../tokens';
import type { OrderShortfallRecord } from '../types/inventory';
import { milli, quantityOf } from './stock-state';

/** OB-10: what one fill gave, per order: how much it now holds, and whether it still waits for anything. */
export interface FilledOrder {
  orderId: string;
  covered: boolean;
}

function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * INV-25 (ORDERS-BEYOND-STOCK-PLAN OB-7, OB-8): what an order line can't hold when it is placed waits as a shortfall,
 * and stock that becomes free goes to the waiting lines of that stock, oldest first, inside the caller's transaction.
 * A filled part moves into the line's reservation: the line's reservation for that variant (if it holds some already)
 * is let go and held again with the filled part added, so the database's reserved stock stays the sum of the active
 * reservations (INV-05). A size drawing on a shared stock fills in whole packs (INV-24). Callers lock products first and
 * then call this, which locks each level, then its waiting lines -- the one lock order every stock writer keeps.
 */
@Injectable()
export class ShortfallFiller {
  /**
   * OB-10: the orders each transaction's fills gave to so far, by order (true once it waits for nothing), so a caller
   * whose stock arrived through another module (a purchase receipt) can still say how many orders it went to. Keyed by
   * the transaction itself, so two requests never see each other's; gone with it.
   */
  private readonly given = new WeakMap<Transaction, Map<string, boolean>>();

  constructor(
    @Inject(RESERVATION_STORE) private readonly reservations: ReservationStore,
    @Inject(STOCK_STORE) private readonly store: StockStore,
  ) {}

  /** OB-10: every order this transaction's fills gave stock to, and whether each now waits for nothing. */
  filledIn(tx: Transaction): FilledOrder[] {
    return [...(this.given.get(tx) ?? new Map<string, boolean>())].map(([orderId, covered]) => ({
      orderId,
      covered,
    }));
  }

  /**
   * OB-8: gives the free stock of these variants (the stock each holds: a variant, or a shared stock's holder) to their
   * waiting lines, oldest first; the orders it gave to. The caller refreshes the products' stock state afterwards.
   */
  async fill(tx: Transaction, tenantId: string, variantIds: string[]): Promise<FilledOrder[]> {
    const touched = new Set<string>();
    for (const variantId of [...new Set(variantIds)].sort(byId)) {
      let free = milli((await this.store.lockLevelFigures(tx, tenantId, variantId)).available);
      if (free <= 0) continue;
      for (const waiting of await this.reservations.lockWaiting(tx, tenantId, variantId)) {
        const taken = this.portion(waiting, free);
        if (taken <= 0) continue;
        await this.hold(tx, tenantId, waiting, taken);
        free -= this.inStock(waiting, taken);
        touched.add(waiting.orderId);
        if (free <= 0) break;
      }
    }
    if (touched.size === 0) return [];
    const still = new Set(
      (await this.reservations.listShortfallsForOrders(tx, tenantId, [...touched])).map(
        (row) => row.orderId,
      ),
    );
    const filled = [...touched].map((orderId) => ({ orderId, covered: !still.has(orderId) }));
    const given = this.given.get(tx) ?? new Map<string, boolean>();
    for (const order of filled) given.set(order.orderId, order.covered);
    this.given.set(tx, given);
    return filled;
  }

  /** INV-25, OB-9: whether any line of this order still waits for stock; the first one that does, if so. */
  async firstWaiting(
    tx: Transaction,
    tenantId: string,
    orderIds: string[],
  ): Promise<OrderShortfallRecord | null> {
    const rows = await this.reservations.listShortfallsForOrders(tx, tenantId, orderIds);
    return rows[0] ?? null;
  }

  /**
   * INV-25 (ORDERS-BEYOND-STOCK Q3, the owner 2026-11-25: "accept it"): a count that found fewer than are held for
   * orders is still the truth. Before `need` thousandths of this stock leave, the newest orders give up what they hold
   * of it, into their lines' shortfalls, until enough is free; the oldest keep theirs. A size drawing on a shared stock
   * gives up whole packs. The caller has locked the level; the orders given up are returned.
   */
  async giveUp(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    need: number,
  ): Promise<string[]> {
    let free = milli((await this.store.lockLevelFigures(tx, tenantId, variantId)).available);
    const orders = new Set<string>();
    if (free >= need) return [];
    for (const held of await this.reservations.lockHeldNewestFirst(tx, tenantId, variantId)) {
      if (free >= need) break;
      const ordered = milli(held.ordered);
      const pack = held.packAmount === null ? null : milli(held.packAmount);
      const missing = need - free;
      const back =
        pack === null ? Math.min(ordered, missing) : Math.min(ordered, Math.ceil(missing / pack) * 1000);
      await this.reservations.resolve(tx, tenantId, [held.id], ReservationStatus.Released);
      if (ordered - back > 0) {
        await this.reservations.insert(tx, tenantId, {
          orderId: held.orderId,
          orderLineId: held.orderLineId,
          productId: held.productId,
          variantId: held.variantId,
          soldVariantId: held.soldVariantId,
          ordered: quantityOf(ordered - back),
          packAmount: held.packAmount,
          quantity: quantityOf(
            pack === null ? ordered - back : Math.round(((ordered - back) * pack) / 1000),
          ),
          expiresAt: held.expiresAt,
        });
      }
      const waiting = (
        await this.reservations.listShortfallsForOrders(tx, tenantId, [held.orderId])
      ).find(
        (row) => row.orderLineId === held.orderLineId && row.soldVariantId === held.soldVariantId,
      );
      if (waiting) {
        await this.reservations.setShortfall(
          tx,
          tenantId,
          waiting.id,
          quantityOf(milli(waiting.quantity) + back),
        );
      } else {
        await this.reservations.insertShortfall(tx, tenantId, {
          orderId: held.orderId,
          orderLineId: held.orderLineId,
          productId: held.productId,
          variantId: held.variantId,
          soldVariantId: held.soldVariantId,
          packAmount: held.packAmount,
          quantity: quantityOf(back),
        });
      }
      free += pack === null ? back : Math.round((back * pack) / 1000);
      orders.add(held.orderId);
    }
    return [...orders];
  }

  /** How many of the ordered variant (thousandths) this much free stock can give the line: whole packs on a shared stock. */
  private portion(waiting: OrderShortfallRecord, free: number): number {
    const wanted = milli(waiting.quantity);
    if (waiting.packAmount === null) return Math.min(wanted, free);
    const packs = Math.floor(free / milli(waiting.packAmount)) * 1000;
    return Math.min(wanted, packs);
  }

  /** The stock (thousandths) that `ordered` thousandths of the ordered variant use. */
  private inStock(waiting: OrderShortfallRecord, ordered: number): number {
    return waiting.packAmount === null
      ? ordered
      : Math.round((ordered * milli(waiting.packAmount)) / 1000);
  }

  /** Moves `taken` (thousandths of the ordered variant) from the line's shortfall into its reservation. */
  private async hold(
    tx: Transaction,
    tenantId: string,
    waiting: OrderShortfallRecord,
    taken: number,
  ): Promise<void> {
    const current = (await this.reservations.listForOrder(tx, tenantId, waiting.orderId)).find(
      (row) =>
        row.status === ReservationStatus.Active &&
        row.orderLineId === waiting.orderLineId &&
        row.soldVariantId === waiting.soldVariantId,
    );
    const ordered = taken + (current ? milli(current.ordered) : 0);
    if (current) {
      await this.reservations.resolve(tx, tenantId, [current.id], ReservationStatus.Released);
    }
    await this.reservations.insert(tx, tenantId, {
      orderId: waiting.orderId,
      orderLineId: waiting.orderLineId,
      productId: waiting.productId,
      variantId: waiting.variantId,
      soldVariantId: waiting.soldVariantId,
      ordered: quantityOf(ordered),
      packAmount: waiting.packAmount,
      quantity: quantityOf(this.inStock(waiting, ordered)),
      expiresAt: current?.expiresAt ?? null,
    });
    await this.reservations.setShortfall(
      tx,
      tenantId,
      waiting.id,
      quantityOf(milli(waiting.quantity) - taken),
    );
  }
}
