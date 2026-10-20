import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { ReservationStatus, SerialStatus, StockReason, StockTracking } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import type { ResolvedActor } from '../../catalogue/services/catalogue-activity';
import type { ReservationStore } from '../ports/reservation-store';
import type { SerialStore } from '../ports/serial-store';
import type { StockBatchStore } from '../ports/stock-batch-store';
import type { StockStore } from '../ports/stock-store';
import { RESERVATION_STORE, SERIAL_STORE, STOCK_BATCH_STORE, STOCK_STORE } from '../tokens';
import type {
  MovementRecord,
  ReferencedMovementRow,
  StockChange,
  StockReturn,
} from '../types/inventory';
import { InventoryLedger } from './inventory-ledger';
import { milli, quantityOf } from './stock-state';

/** Where some of the returned units go back in, and how many of them, in thousandths. */
interface Placement {
  batchId: string | null;
  units: number;
}

/** The order a shipment's batches are taken back in: earliest expiry first, a batch with none last. */
function byExpiry(a: ReferencedMovementRow, b: ReferencedMovementRow): number {
  const left = a.expiresOn ?? '9999-12-31';
  const right = b.expiresOn ?? '9999-12-31';
  return left < right ? -1 : left > right ? 1 : a.id - b.id;
}

/**
 * INV-17, INV-14, INV-24: units of a shipped reservation coming back, inside the caller's transaction (Phase 4's
 * returns call this; there is no route of its own). Each unit is marked sellable or damaged; nothing restocks by
 * itself. A shipment comes back in parts if need be, never more than it shipped less what already came back. The units
 * go back into the batches the shipment took from, the one expiring soonest first unless the shop names one (a batch
 * closed since opens again under its code and expiry), at the sale's unit cost, so the average cost is untouched and
 * the cost of goods sold falls by what they cost. A damaged unit is then written off at that same cost, a loss. A
 * serial-numbered unit comes back by its serial, one sold on that shipment: the sold record is kept as history and the
 * unit returns as a new one. A size of a shared stock brings back the pack amount it was ordered at.
 */
@Injectable()
export class StockReturnService {
  constructor(
    @Inject(RESERVATION_STORE) private readonly reservations: ReservationStore,
    @Inject(STOCK_STORE) private readonly store: StockStore,
    @Inject(STOCK_BATCH_STORE) private readonly batches: StockBatchStore,
    @Inject(SERIAL_STORE) private readonly serials: SerialStore,
    @Inject(InventoryLedger) private readonly ledger: InventoryLedger,
  ) {}

  /** Takes the units back: the return movements, then the damaged write-offs. */
  async receive(
    tx: Transaction,
    tenantId: string,
    request: StockReturn,
    who: ResolvedActor,
  ): Promise<MovementRecord[]> {
    const sellable = milli(request.sellable);
    const damaged = milli(request.damaged);
    if (sellable < 0 || damaged < 0) throw new Error('a return counts no unit below zero');
    if (sellable + damaged === 0) throw new ApiError('validation_error', 'NothingReturned', {});
    const [found] = await this.reservations.findReservations(tx, tenantId, [request.reservationId]);
    if (!found) throw new ApiError('not_found', 'ReservationNotFound', {});
    // INV-02, PRD-13: stock comes back only to a product still kept in stock, sharing as it did when it shipped.
    const [on] = await this.store.findVariants(tx, tenantId, [found.variantId]);
    if (
      !on ||
      on.product.stockTracking !== StockTracking.Tracked ||
      on.isStockHolder !== on.product.sharedStock
    ) {
      throw new ApiError('conflict', 'ReturnCannotRestock', {});
    }
    // The lock order every stock writer keeps: the product, the level, then the reservation.
    await this.store.lockProducts(tx, tenantId, [found.productId]);
    await this.store.lockLevel(tx, tenantId, found.variantId);
    const [reservation] = await this.reservations.lockReservations(tx, tenantId, [found.id]);
    if (reservation?.status !== ReservationStatus.Consumed) {
      throw new ApiError('conflict', 'ReservationNotShipped', {});
    }

    // INV-24: a size comes back in whole packs, at the pack amount it was ordered at.
    const pack = reservation.packAmount;
    if (pack !== null && (sellable % 1000 !== 0 || damaged % 1000 !== 0)) {
      throw new ApiError('conflict', 'WholePacksOnly', {});
    }
    const inStock = (units: number): number =>
      pack === null ? units : (units / 1000) * milli(pack);
    const back = inStock(sellable + damaged);
    const lost = inStock(damaged);

    const reference = { type: 'reservation', id: reservation.id };
    const moved = await this.store.listReferencing(tx, tenantId, reference);
    const sales = moved.filter((row) => row.reason === StockReason.Sale);
    const backs = moved.filter((row) => row.reason === StockReason.ReturnReceived);
    const shipped = sales.reduce((sum, row) => sum - milli(row.quantityDelta), 0);
    const returned = backs.reduce((sum, row) => sum + milli(row.quantityDelta), 0);
    if (returned + back > shipped) throw new ApiError('conflict', 'MoreThanShipped', {});
    // INV-11, INV-17: what the units cost when they were sold; every part of one sale carries the same cost.
    const saleCost = sales[0]?.unitCost ?? null;

    const placements = on.product.batchTracked
      ? await this.placeInBatches(tx, tenantId, sales, backs, back, request.batchId ?? null)
      : [{ batchId: null, units: back }];
    const named = on.product.serialTracked
      ? await this.soldSerials(tx, tenantId, request, sales, sellable, damaged)
      : this.noSerials(request);

    // Damaged units first in each placement, so the serials and the write-offs line up part by part.
    const ordered = [...named.damaged, ...named.sellable];
    let lostLeft = lost;
    let serialAt = 0;
    const parts = placements.map((placement) => {
      const units = placement.units;
      const serials = named.tracked ? ordered.slice(serialAt, serialAt + units / 1000) : [];
      const lostHere = named.tracked
        ? serials.filter((serial) => named.damaged.includes(serial)).length * 1000
        : Math.min(units, lostLeft);
      serialAt += serials.length;
      lostLeft -= lostHere;
      return { ...placement, serials, lostHere };
    });

    const backIn = await this.apply(
      tx,
      tenantId,
      parts.map((part): StockChange => ({
        variantId: reservation.variantId,
        delta: quantityOf(part.units),
        reason: StockReason.ReturnReceived,
        reference,
        batchId: part.batchId,
        unitCost: saleCost,
        serials: named.tracked ? part.serials : null,
      })),
      who,
    );
    const writingOff = parts.flatMap((part, index): StockChange[] => {
      if (part.lostHere === 0) return [];
      const landed = backIn[index];
      if (!landed) throw new Error('every returned part was recorded as one movement');
      return [
        {
          variantId: reservation.variantId,
          delta: quantityOf(-part.lostHere),
          reason: StockReason.Damaged,
          reference,
          batchId: landed.batchId,
          unitCost: saleCost,
          serials: named.tracked
            ? part.serials.filter((serial) => named.damaged.includes(serial))
            : null,
        },
      ];
    });
    const writtenOff = writingOff.length > 0 ? await this.apply(tx, tenantId, writingOff, who) : [];
    return [...backIn, ...writtenOff];
  }

  /**
   * INV-12: the batches the units go back into: the one named, if the shipment took from it, else the shipment's
   * batches the soonest expiring first, each up to what it gave less what already came back into it (itself, or the
   * batch it reopened as). A sale from before the product kept batches goes into its "no expiry" batch.
   */
  private async placeInBatches(
    tx: Transaction,
    tenantId: string,
    sales: ReferencedMovementRow[],
    backs: ReferencedMovementRow[],
    back: number,
    batchId: string | null,
  ): Promise<Placement[]> {
    const taken = sales.filter((row) => row.batchId !== null).sort(byExpiry);
    if (taken.length === 0) return [{ batchId: null, units: back }];
    if (batchId !== null) {
      const chosen = taken.find((row) => row.batchId === batchId);
      if (!chosen) throw new ApiError('not_found', 'BatchNotFound', {});
      return [{ batchId: await this.openBatchOf(tx, tenantId, chosen), units: back }];
    }
    const placements: Placement[] = [];
    let need = back;
    for (const sale of taken) {
      const cameBack = backs
        .filter(
          (row) =>
            row.batchId === sale.batchId ||
            (row.batchCode === sale.batchCode && row.expiresOn === sale.expiresOn),
        )
        .reduce((sum, row) => sum + milli(row.quantityDelta), 0);
      const take = Math.min(Math.max(-milli(sale.quantityDelta) - cameBack, 0), need);
      if (take <= 0) continue;
      placements.push({ batchId: await this.openBatchOf(tx, tenantId, sale), units: take });
      need -= take;
      if (need === 0) break;
    }
    if (need > 0) throw new Error('a shipment took back no more than its batches gave');
    return placements;
  }

  /**
   * INV-12, INV-13: the open batch the sale's batch is now: itself, or, closed since, the open batch with its code, or
   * a new one with its code and expiry -- never the "no expiry" batch, which would make an expired lot sellable. A
   * batch that has expired takes its units back expired.
   */
  private async openBatchOf(
    tx: Transaction,
    tenantId: string,
    sale: ReferencedMovementRow,
  ): Promise<string | null> {
    if (!sale.batchClosed) return sale.batchId;
    if (sale.batchCode === null && sale.expiresOn === null) return null;
    const open = await this.batches.lockOpenBatches(tx, tenantId, sale.variantId);
    const same = open.find((batch) =>
      sale.batchCode !== null
        ? batch.batchCode === sale.batchCode
        : batch.batchCode === null && !batch.isDefault && batch.expiresOn === sale.expiresOn,
    );
    if (same) return same.id;
    const made = await this.batches.insertBatch(tx, tenantId, {
      variantId: sale.variantId,
      batchCode: sale.batchCode,
      expiresOn: sale.expiresOn,
      isDefault: false,
    });
    return made.id;
  }

  /**
   * INV-14: the serial of every unit coming back, each one sold on this shipment and not back yet; their sold records
   * are marked returned, kept as the sale's history.
   */
  private async soldSerials(
    tx: Transaction,
    tenantId: string,
    request: StockReturn,
    sales: ReferencedMovementRow[],
    sellable: number,
    damaged: number,
  ): Promise<{ tracked: true; sellable: string[]; damaged: string[] }> {
    const named = {
      sellable: request.serials?.sellable ?? [],
      damaged: request.serials?.damaged ?? [],
    };
    if (named.sellable.length * 1000 !== sellable || named.damaged.length * 1000 !== damaged) {
      throw new ApiError('conflict', 'SerialPerUnitReturned', {});
    }
    const all = [...named.damaged, ...named.sellable];
    if (new Set(all).size !== all.length) throw new ApiError('conflict', 'SerialRepeated', {});
    const saleIds = new Set(sales.map((row) => row.id));
    const sold = new Map(
      (
        await this.serials.listForMovements(
          tx,
          tenantId,
          sales.map((row) => row.id),
        )
      )
        .filter(
          (row) =>
            row.status === SerialStatus.Sold &&
            row.leftMovementId !== null &&
            saleIds.has(row.leftMovementId),
        )
        .map((row) => [row.serial, row.id]),
    );
    const ids = all.map((serial) => sold.get(serial));
    if (ids.some((id) => id === undefined)) throw new ApiError('not_found', 'SerialNotFound', {});
    await this.serials.markReturned(
      tx,
      tenantId,
      ids.filter((id): id is string => id !== undefined),
    );
    return { tracked: true, ...named };
  }

  private noSerials(request: StockReturn): { tracked: false; sellable: []; damaged: [] } {
    const named = (request.serials?.sellable.length ?? 0) + (request.serials?.damaged.length ?? 0);
    if (named > 0) throw new ApiError('conflict', 'SerialsNotTracked', {});
    return { tracked: false, sellable: [], damaged: [] };
  }

  /** The ledger, with a product no longer kept in stock answered as such. */
  private async apply(
    tx: Transaction,
    tenantId: string,
    changes: StockChange[],
    who: ResolvedActor,
  ): Promise<MovementRecord[]> {
    try {
      return await this.ledger.apply(tx, tenantId, changes, who);
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.messageKey === 'MadeToOrderHasNoStock' || error.messageKey === 'ProductNotFound')
      ) {
        throw new ApiError('conflict', 'ReturnCannotRestock', {});
      }
      throw error;
    }
  }
}
