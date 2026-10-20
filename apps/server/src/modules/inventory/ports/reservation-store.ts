import type { Transaction } from '@lytronix/db';
import type { ReservationStatus } from '@lytronix/validators';
import type { NewReservation, ReservationRecord } from '../types/inventory';

/**
 * INV-15, INV-16: stock held for order lines. The database raises and lowers each level's reserved stock with its
 * active reservations. A reservation holding more than is free comes back as StockRefused('shortfall'), and a fraction
 * of a whole-unit product as StockRefused('whole_units').
 */
export interface ReservationStore {
  insert(tx: Transaction, tenantId: string, row: NewReservation): Promise<ReservationRecord>;
  findReservations(tx: Transaction, tenantId: string, ids: string[]): Promise<ReservationRecord[]>;
  /** These reservations, locked; lock their levels first. */
  lockReservations(tx: Transaction, tenantId: string, ids: string[]): Promise<ReservationRecord[]>;
  listForOrder(tx: Transaction, tenantId: string, orderId: string): Promise<ReservationRecord[]>;
  /** INV-16: active reservations whose time ran out by `now`, earliest first. */
  listDue(
    tx: Transaction,
    tenantId: string,
    now: Date,
    limit: number,
  ): Promise<ReservationRecord[]>;
  /** Resolves those of these still active; the ids it resolved. */
  resolve(
    tx: Transaction,
    tenantId: string,
    ids: string[],
    status: ReservationStatus.Consumed | ReservationStatus.Released,
  ): Promise<string[]>;
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
