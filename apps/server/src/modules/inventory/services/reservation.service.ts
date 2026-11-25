import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  PlatformSettingKey,
  ReservationStatus,
  StockReason,
  StockTracking,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { StockRefused } from '../../../common/errors/stock-refused';
import type { ResolvedActor } from '../../catalogue/services/catalogue-activity';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import type { ReservationStore } from '../ports/reservation-store';
import type { StockStore } from '../ports/stock-store';
import { RESERVATION_STORE, STOCK_STORE } from '../tokens';
import type {
  MovementRecord,
  NewReservation,
  ReservationRecord,
  ReservationRequest,
  Shipment,
  StockChange,
  StockVariantRow,
} from '../types/inventory';
import { InventoryLedger } from './inventory-ledger';
import { ShortfallFiller } from './shortfall-filler';
import { milli, packsToStock, quantityOf } from './stock-state';

/** INV-16, D3-6: how long an order awaiting online payment holds its stock while no operator has set it. */
export const DEFAULT_RESERVATION_MINUTES = 30;

/** How many reservations whose time ran out one shop lets go of in one pass; the rest go in the next. */
const DUE_PER_PASS = 500;

function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * INV-15, INV-16, PRD-07: stock held for orders, inside the caller's transaction. Phase 4's orders call this; there is
 * no route of its own. A line of a tracked product holds its units, on the shared stock for a size drawing on one
 * (INV-24), and is refused, naming the product, when not that many are free; a made-to-order line holds nothing and is
 * never refused. A reservation is resolved once and whole: shipped as one sale (the units it held, never expired ones),
 * or let go, freeing them. One awaiting online payment is let go by the minute pass once its time runs out.
 *
 * Every writer locks the same way -- products in id order, levels in variant order, then the reservations, then each
 * level's batches and serials -- so two writers wait for each other instead of deadlocking.
 */
@Injectable()
export class ReservationService {
  constructor(
    @Inject(RESERVATION_STORE) private readonly reservations: ReservationStore,
    @Inject(STOCK_STORE) private readonly store: StockStore,
    @Inject(InventoryLedger) private readonly ledger: InventoryLedger,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(ShortfallFiller) private readonly filler: ShortfallFiller,
  ) {}

  /** Holds stock for an order's lines, all or none: the reservations made, made-to-order lines left out. */
  async reserve(
    tx: Transaction,
    tenantId: string,
    request: ReservationRequest,
    now = new Date(),
  ): Promise<ReservationRecord[]> {
    if (request.lines.length === 0) return [];
    const variants = new Map(
      (
        await this.store.findVariants(
          tx,
          tenantId,
          request.lines.map((line) => line.variantId),
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
    const expiresAt = request.awaitingPayment
      ? new Date(now.getTime() + (await this.holdMinutes()) * 60_000)
      : null;
    const planned: { row: NewReservation; productName: string }[] = [];
    for (const line of request.lines) {
      const sold = variants.get(line.variantId);
      if (!sold || sold.isStockHolder || sold.product.deletedAt !== null) {
        throw new ApiError('not_found', 'ProductNotFound', {});
      }
      if (sold.retired) throw new ApiError('conflict', 'VariantRetired', {});
      // PRD-07: a made-to-order product holds nothing, so its line is never refused.
      if (sold.product.stockTracking !== StockTracking.Tracked) continue;
      if (milli(line.quantity) <= 0) throw new Error('an order line holds a quantity above zero');
      const ordered = quantityOf(milli(line.quantity));
      let row: NewReservation = {
        orderId: request.orderId,
        orderLineId: line.orderLineId,
        productId: sold.productId,
        variantId: sold.variantId,
        soldVariantId: sold.variantId,
        ordered,
        packAmount: null,
        quantity: ordered,
        expiresAt,
      };
      if (sold.product.sharedStock) {
        const holder = holders.get(sold.productId);
        if (!holder || sold.packAmount === null) {
          throw new Error(
            'a product sharing its stock has a stock holder and a pack amount per variant',
          );
        }
        if (milli(line.quantity) % 1000 !== 0) {
          throw new ApiError('conflict', 'WholePacksOnly', {});
        }
        row = {
          ...row,
          variantId: holder.variantId,
          packAmount: sold.packAmount,
          quantity: packsToStock(ordered, sold.packAmount),
        };
      }
      planned.push({ row, productName: sold.product.name });
    }
    await this.store.lockProducts(tx, tenantId, [
      ...new Set(planned.map(({ row }) => row.productId)),
    ]);
    planned.sort((a, b) => byId(a.row.variantId, b.row.variantId));
    const made: ReservationRecord[] = [];
    for (const { row: asked, productName } of planned) {
      // INV-25 (ORDERS-BEYOND-STOCK OB-7): the line holds what is free and waits for the rest; the order is never
      // refused for stock. A size drawing on a shared stock holds whole packs (INV-24).
      const free = Math.max(
        0,
        milli((await this.store.lockLevelFigures(tx, tenantId, asked.variantId)).available),
      );
      const pack = asked.packAmount ?? null;
      const wanted = milli(asked.ordered);
      const holds =
        pack === null
          ? Math.min(wanted, free)
          : Math.min(wanted, Math.floor(free / milli(pack)) * 1000);
      if (holds < wanted) {
        await this.reservations.insertShortfall(tx, tenantId, {
          orderId: asked.orderId,
          orderLineId: asked.orderLineId,
          productId: asked.productId,
          variantId: asked.variantId,
          soldVariantId: asked.soldVariantId,
          packAmount: pack,
          quantity: quantityOf(wanted - holds),
        });
      }
      if (holds <= 0) continue;
      const row: NewReservation = {
        ...asked,
        ordered: quantityOf(holds),
        quantity: pack === null ? quantityOf(holds) : packsToStock(quantityOf(holds), pack),
      };
      try {
        made.push(await this.reservations.insert(tx, tenantId, row));
      } catch (error) {
        if (error instanceof StockRefused && error.kind === 'shortfall') {
          throw new ApiError(
            'conflict',
            'NotEnoughStockForOrder',
            { productId: row.productId, variantId: row.soldVariantId },
            undefined,
            { product: productName },
          );
        }
        if (error instanceof StockRefused && error.kind === 'whole_units') {
          throw new ApiError('conflict', 'WholeUnitsOnly', {});
        }
        throw error;
      }
    }
    // CCH-08, INV-08: what is held is no longer available, which can turn a product low or out.
    await this.ledger.refresh(tx, tenantId, [...new Set(made.map((row) => row.productId))], true);
    return made;
  }

  /**
   * ORD-11: holds an edited order's items afresh, all or none: what the order holds is let go and its lines held again,
   * so an edit asking for more than is free is refused and, with the caller's transaction, leaves the order as it was.
   * Every product the old and the new lines name is locked first, in one pass, as every writer locks.
   */
  async replaceForOrder(
    tx: Transaction,
    tenantId: string,
    request: ReservationRequest,
    now = new Date(),
  ): Promise<ReservationRecord[]> {
    const active = (await this.reservations.listForOrder(tx, tenantId, request.orderId)).filter(
      (row) => row.status === ReservationStatus.Active,
    );
    const ordered = await this.store.findVariants(
      tx,
      tenantId,
      request.lines.map((line) => line.variantId),
    );
    await this.store.lockProducts(tx, tenantId, [
      ...new Set([...active.map((row) => row.productId), ...ordered.map((row) => row.productId)]),
    ]);
    await this.lockLevels(tx, tenantId, active);
    // OB-13: what the order held stays its own to hold again, so nothing is given to other waiting lines in between;
    // what it waits for is worked out afresh with its new lines.
    await this.letGo(tx, tenantId, active, false);
    await this.reservations.deleteShortfallsForOrder(tx, tenantId, request.orderId);
    const made = await this.reserve(tx, tenantId, request, now);
    // OB-8: what the edit no longer holds goes to the oldest lines waiting for it.
    await this.fillAndRefresh(tx, tenantId, active);
    return made;
  }

  /**
   * INV-25 (OB-9): refuses, naming the product, while any line of these orders still waits for stock: an order that is
   * short can't be booked with a courier, handed over or shipped.
   */
  async assertNotWaiting(tx: Transaction, tenantId: string, orderIds: string[]): Promise<void> {
    const waiting = await this.filler.firstWaiting(tx, tenantId, orderIds);
    if (!waiting) return;
    const [product] = await this.store.findVariants(tx, tenantId, [waiting.soldVariantId]);
    throw new ApiError(
      'conflict',
      'OrderShortOfStock',
      { productId: waiting.productId, variantId: waiting.soldVariantId },
      undefined,
      { product: product?.product.name ?? '' },
    );
  }

  /** INV-25: what these orders' lines wait for, oldest first. */
  listShortfalls(tx: Transaction, tenantId: string, orderIds: string[]) {
    return this.reservations.listShortfallsForOrders(tx, tenantId, orderIds);
  }

  /**
   * INV-25 (ORDERS-BEYOND-STOCK OB-12, the owner on #448): for each of this order's waiting lines, what older orders
   * wait for on the same stock -- stock goes to them first (OB-8), so covering this line takes theirs too. How many
   * orders, and how much in this line's own unit (whole packs, rounded up, for a size drawing on a shared stock).
   */
  async aheadOf(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<Map<string, { orders: number; quantity: string }>> {
    const own = await this.reservations.listShortfallsForOrders(tx, tenantId, [orderId]);
    const ahead = new Map<string, { orders: number; quantity: string }>();
    if (own.length === 0) return ahead;
    const all = await this.reservations.listWaitingOn(tx, tenantId, [
      ...new Set(own.map((row) => row.variantId)),
    ]);
    const inStock = (row: { quantity: string; packAmount: string | null }): number =>
      row.packAmount === null
        ? milli(row.quantity)
        : Math.round((milli(row.quantity) * milli(row.packAmount)) / 1000);
    for (const line of own) {
      const before = all.filter(
        (row) =>
          row.variantId === line.variantId &&
          row.orderId !== orderId &&
          (row.createdAt < line.createdAt ||
            (row.createdAt.getTime() === line.createdAt.getTime() && row.id < line.id)),
      );
      if (before.length === 0) continue;
      const stock = before.reduce((sum, row) => sum + inStock(row), 0);
      const units =
        line.packAmount === null
          ? stock
          : Math.ceil(stock / milli(line.packAmount)) * 1000;
      const orders = new Set(before.map((row) => row.orderId)).size;
      const had = ahead.get(line.orderLineId);
      ahead.set(line.orderLineId, {
        orders: Math.max(orders, had?.orders ?? 0),
        quantity: quantityOf(units + (had ? milli(had.quantity) : 0)),
      });
    }
    return ahead;
  }

  /**
   * INV-15, INV-14: ships these reservations, each whole, as one sale of the units it held (INV-12: earliest expiry
   * first, never an expired batch), at the cost of the moment (INV-11). A serial-numbered product names the serial of
   * every unit shipped, and those units are sold to the order. A reservation that expiry left without enough sellable
   * stock under it is refused, and the order decides what happens next.
   */
  async consume(
    tx: Transaction,
    tenantId: string,
    shipments: Shipment[],
    who: ResolvedActor,
  ): Promise<MovementRecord[]> {
    if (shipments.length === 0) return [];
    const serials = new Map(
      shipments.map((shipment) => [shipment.reservationId, shipment.serials ?? []]),
    );
    if (serials.size !== shipments.length) throw new Error('a reservation ships once');
    const held = await this.lockActive(tx, tenantId, [...serials.keys()]);
    // INV-25 (OB-9): the backstop -- an order that still waits for stock never leaves.
    await this.assertNotWaiting(tx, tenantId, [...new Set(held.map((row) => row.orderId))]);
    const variants = new Map(
      (
        await this.store.findVariants(
          tx,
          tenantId,
          held.map((row) => row.variantId),
        )
      ).map((row): [string, StockVariantRow] => [row.variantId, row]),
    );
    const changes: StockChange[] = held.map((reservation) => {
      const named = serials.get(reservation.id) ?? [];
      const serialTracked = variants.get(reservation.variantId)?.product.serialTracked ?? false;
      if (serialTracked && named.length !== milli(reservation.quantity) / 1000) {
        throw new ApiError('conflict', 'SerialPerUnitShipped', {});
      }
      return {
        variantId: reservation.variantId,
        delta: quantityOf(-milli(reservation.quantity)),
        reason: StockReason.Sale,
        reference: { type: 'reservation', id: reservation.id },
        serials: named,
        orderId: reservation.orderId,
      };
    });
    await this.reservations.resolve(
      tx,
      tenantId,
      held.map((row) => row.id),
      ReservationStatus.Consumed,
    );
    try {
      return await this.ledger.apply(tx, tenantId, changes, who);
    } catch (error) {
      if (error instanceof ApiError && error.messageKey === 'NotEnoughStock') {
        throw new ApiError('conflict', 'ReservedStockExpired', {});
      }
      throw error;
    }
  }

  /** INV-15: lets these reservations go, each whole, freeing what they held; nothing moves on hand. */
  async release(tx: Transaction, tenantId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const held = await this.lockActive(tx, tenantId, [...new Set(ids)]);
    await this.letGo(tx, tenantId, held);
  }

  /** INV-15: lets go of everything an order still holds (it was cancelled); how many reservations that was. */
  async releaseOrder(tx: Transaction, tenantId: string, orderId: string): Promise<number> {
    const active = (await this.reservations.listForOrder(tx, tenantId, orderId)).filter(
      (row) => row.status === ReservationStatus.Active,
    );
    await this.lockLevels(tx, tenantId, active);
    // INV-25 (OB-13): a cancelled order waits for nothing.
    await this.reservations.deleteShortfallsForOrder(tx, tenantId, orderId);
    return this.letGo(tx, tenantId, active);
  }

  /** An order's reservations, oldest first, resolved ones included. */
  listForOrder(tx: Transaction, tenantId: string, orderId: string): Promise<ReservationRecord[]> {
    return this.reservations.listForOrder(tx, tenantId, orderId);
  }

  /**
   * INV-16: lets go of the shop's reservations whose time ran out by `now`; how many. One a shipment resolved first is
   * left as it is, so running this twice changes nothing.
   */
  async releaseDue(tx: Transaction, tenantId: string, now: Date): Promise<number> {
    const due = await this.reservations.listDue(tx, tenantId, now, DUE_PER_PASS);
    await this.lockLevels(tx, tenantId, due);
    return this.letGo(tx, tenantId, due);
  }

  /**
   * INV-16, D3-6: the operator's setting, else the default -- also a payment session's lifetime (PAY-03), so a session
   * and the stock it pays for run out together.
   */
  async holdMinutes(): Promise<number> {
    const setting = await this.settings.current(PlatformSettingKey.ReservationExpiryMinutes);
    return typeof setting?.value === 'number' ? setting.value : DEFAULT_RESERVATION_MINUTES;
  }

  /** These reservations, each still holding its stock, locked after their levels. */
  private async lockActive(
    tx: Transaction,
    tenantId: string,
    ids: string[],
  ): Promise<ReservationRecord[]> {
    const found = await this.reservations.findReservations(tx, tenantId, ids);
    if (found.length !== ids.length) throw new ApiError('not_found', 'ReservationNotFound', {});
    await this.lockLevels(tx, tenantId, found);
    const locked = await this.reservations.lockReservations(tx, tenantId, ids);
    if (locked.some((row) => row.status !== ReservationStatus.Active)) {
      throw new ApiError('conflict', 'ReservationResolved', {});
    }
    return locked;
  }

  /** The products, then the levels, that these reservations hold stock on. */
  private async lockLevels(
    tx: Transaction,
    tenantId: string,
    rows: ReservationRecord[],
  ): Promise<void> {
    await this.store.lockProducts(tx, tenantId, [...new Set(rows.map((row) => row.productId))]);
    for (const variantId of [...new Set(rows.map((row) => row.variantId))].sort(byId)) {
      await this.store.lockLevel(tx, tenantId, variantId);
    }
  }

  /**
   * Lets these reservations go. With `fill` (every path but an edit holding its own again), what they held goes to the
   * oldest lines waiting for that stock (OB-8) before the products' stock state is worked out again.
   */
  private async letGo(
    tx: Transaction,
    tenantId: string,
    rows: ReservationRecord[],
    fill = true,
  ): Promise<number> {
    const released = new Set(
      await this.reservations.resolve(
        tx,
        tenantId,
        rows.map((row) => row.id),
        ReservationStatus.Released,
      ),
    );
    const freed = rows.filter((row) => released.has(row.id));
    if (fill) await this.fillAndRefresh(tx, tenantId, freed);
    else {
      await this.ledger.refresh(
        tx,
        tenantId,
        [...new Set(freed.map((row) => row.productId))],
        true,
      );
    }
    return released.size;
  }

  /** OB-8: gives the stock these rows stood on to its oldest waiting lines, then works out the products' state again. */
  private async fillAndRefresh(
    tx: Transaction,
    tenantId: string,
    rows: Pick<ReservationRecord, 'productId' | 'variantId'>[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await this.filler.fill(
      tx,
      tenantId,
      rows.map((row) => row.variantId),
    );
    await this.ledger.refresh(tx, tenantId, [...new Set(rows.map((row) => row.productId))], true);
  }
}
