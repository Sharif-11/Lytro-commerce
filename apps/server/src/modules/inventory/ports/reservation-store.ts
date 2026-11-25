import type { Transaction } from '@lytronix/db';
import type { ReservationStatus } from '@lytronix/validators';
import type {
  NewReservation,
  NewShortfall,
  OrderShortfallRecord,
  ReservationRecord,
} from '../types/inventory';

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
  /** INV-25 (OB-7): records what an order line waits for. */
  insertShortfall(
    tx: Transaction,
    tenantId: string,
    row: NewShortfall,
  ): Promise<OrderShortfallRecord>;
  /** INV-25: what these orders' lines wait for, oldest first. */
  listShortfallsForOrders(
    tx: Transaction,
    tenantId: string,
    orderIds: string[],
  ): Promise<OrderShortfallRecord[]>;
  /** OB-8: the lines waiting for one stock, oldest first, locked; lock its level first. */
  lockWaiting(
    tx: Transaction,
    tenantId: string,
    variantId: string,
  ): Promise<OrderShortfallRecord[]>;
  /** Q3: one stock's active reservations, newest first, locked; lock its level first. */
  lockHeldNewestFirst(
    tx: Transaction,
    tenantId: string,
    variantId: string,
  ): Promise<ReservationRecord[]>;
  /** OB-8: what a line still waits for after a fill; nothing left takes the row away. */
  setShortfall(tx: Transaction, tenantId: string, id: string, quantity: string): Promise<void>;
  /** OB-13: drops what an order waits for; how many rows went. */
  deleteShortfallsForOrder(tx: Transaction, tenantId: string, orderId: string): Promise<number>;
}
