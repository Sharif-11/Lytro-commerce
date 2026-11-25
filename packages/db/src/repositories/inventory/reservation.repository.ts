import { and, asc, desc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { ReservationStatus } from '@lytronix/validators';
import {
  stockReservations,
  stockShortfalls,
  type InsertStockReservation,
  type InsertStockShortfall,
  type SelectStockReservation,
  type SelectStockShortfall,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

/** Stock to hold for an order line; the trigger checks it is free and raises the level's reserved stock. */
export type NewReservation = Omit<
  InsertStockReservation,
  'id' | 'tenantId' | 'status' | 'createdAt' | 'resolvedAt'
>;

/** INV-25: what an order line waits for. */
export type NewShortfall = Omit<InsertStockShortfall, 'id' | 'tenantId' | 'createdAt'>;

// INV-15, INV-16: stock held for order lines. Every method sets the shop's tenant context. The database keeps each
// level's reserved stock equal to its active reservations, refuses one larger than what is free, and lets a
// reservation be resolved once, shipped or let go.
export class ReservationRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async insert(
    tx: Transaction,
    tenantId: string,
    row: NewReservation,
  ): Promise<SelectStockReservation> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [made] = await tx
      .insert(stockReservations)
      .values({ tenantId, ...row })
      .returning();
    if (!made) throw new Error('a reservation insert returns its row');
    return made;
  }

  async findReservations(
    tx: Transaction,
    tenantId: string,
    ids: string[],
  ): Promise<SelectStockReservation[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (ids.length === 0) return [];
    return tx
      .select()
      .from(stockReservations)
      .where(and(eq(stockReservations.tenantId, tenantId), inArray(stockReservations.id, ids)));
  }

  /** These reservations, locked; lock their levels first, as every stock writer does. */
  async lockReservations(
    tx: Transaction,
    tenantId: string,
    ids: string[],
  ): Promise<SelectStockReservation[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (ids.length === 0) return [];
    return tx
      .select()
      .from(stockReservations)
      .where(and(eq(stockReservations.tenantId, tenantId), inArray(stockReservations.id, ids)))
      .orderBy(asc(stockReservations.id))
      .for('update');
  }

  /** An order's reservations, oldest first, resolved ones included. */
  async listForOrder(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<SelectStockReservation[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(stockReservations)
      .where(and(eq(stockReservations.tenantId, tenantId), eq(stockReservations.orderId, orderId)))
      .orderBy(asc(stockReservations.createdAt), asc(stockReservations.id));
  }

  /** INV-16: the active reservations whose time ran out by `now`, at most `limit`, earliest first. */
  async listDue(
    tx: Transaction,
    tenantId: string,
    now: Date,
    limit: number,
  ): Promise<SelectStockReservation[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(stockReservations)
      .where(
        and(
          eq(stockReservations.tenantId, tenantId),
          eq(stockReservations.status, ReservationStatus.Active),
          isNotNull(stockReservations.expiresAt),
          lte(stockReservations.expiresAt, now),
        ),
      )
      .orderBy(asc(stockReservations.expiresAt), asc(stockReservations.id))
      .limit(limit);
  }

  /** Resolves those of these reservations still active; the ids it resolved. */
  async resolve(
    tx: Transaction,
    tenantId: string,
    ids: string[],
    status: ReservationStatus.Consumed | ReservationStatus.Released,
  ): Promise<string[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (ids.length === 0) return [];
    const rows = await tx
      .update(stockReservations)
      .set({ status, resolvedAt: new Date() })
      .where(
        and(
          eq(stockReservations.tenantId, tenantId),
          inArray(stockReservations.id, ids),
          eq(stockReservations.status, ReservationStatus.Active),
        ),
      )
      .returning({ id: stockReservations.id });
    return rows.map((row) => row.id);
  }

  /** LIF-19: a lapsed shop's reservations, at day 60; the trigger lets this through for an archived or deleted shop. */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(sql`SELECT set_config('app.erasing_tenant', ${tenantId}, true)`);
    await tx.delete(stockShortfalls).where(eq(stockShortfalls.tenantId, tenantId));
    await tx.delete(stockReservations).where(eq(stockReservations.tenantId, tenantId));
  }

  /** INV-25 (OB-7): records what an order line waits for. */
  async insertShortfall(
    tx: Transaction,
    tenantId: string,
    row: NewShortfall,
  ): Promise<SelectStockShortfall> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [made] = await tx
      .insert(stockShortfalls)
      .values({ tenantId, ...row })
      .returning();
    if (!made) throw new Error('a shortfall insert returns its row');
    return made;
  }

  /** INV-25: what these orders' lines wait for, oldest first. */
  async listShortfallsForOrders(
    tx: Transaction,
    tenantId: string,
    orderIds: string[],
  ): Promise<SelectStockShortfall[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (orderIds.length === 0) return [];
    return tx
      .select()
      .from(stockShortfalls)
      .where(
        and(eq(stockShortfalls.tenantId, tenantId), inArray(stockShortfalls.orderId, orderIds)),
      )
      .orderBy(asc(stockShortfalls.createdAt), asc(stockShortfalls.id));
  }

  /** OB-8: the lines waiting for one stock, oldest first, locked; lock its level first, as every writer does. */
  async lockWaiting(
    tx: Transaction,
    tenantId: string,
    variantId: string,
  ): Promise<SelectStockShortfall[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(stockShortfalls)
      .where(and(eq(stockShortfalls.tenantId, tenantId), eq(stockShortfalls.variantId, variantId)))
      .orderBy(asc(stockShortfalls.createdAt), asc(stockShortfalls.id))
      .for('update');
  }

  /** INV-25 (ORDERS-BEYOND-STOCK OB-12): every line waiting on these stocks, oldest first, for reading only. */
  async listWaitingOn(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<SelectStockShortfall[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (variantIds.length === 0) return [];
    return tx
      .select()
      .from(stockShortfalls)
      .where(
        and(eq(stockShortfalls.tenantId, tenantId), inArray(stockShortfalls.variantId, variantIds)),
      )
      .orderBy(asc(stockShortfalls.createdAt), asc(stockShortfalls.id));
  }

  /** INV-25 (ORDERS-BEYOND-STOCK Q3): one stock's active reservations, newest first, locked; lock its level first. */
  async lockHeldNewestFirst(
    tx: Transaction,
    tenantId: string,
    variantId: string,
  ): Promise<SelectStockReservation[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(stockReservations)
      .where(
        and(
          eq(stockReservations.tenantId, tenantId),
          eq(stockReservations.variantId, variantId),
          eq(stockReservations.status, ReservationStatus.Active),
        ),
      )
      .orderBy(desc(stockReservations.createdAt), desc(stockReservations.id))
      .for('update');
  }

  /** OB-8: what a line still waits for after a fill; nothing left takes the row away. */
  async setShortfall(
    tx: Transaction,
    tenantId: string,
    id: string,
    quantity: string,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    const where = and(eq(stockShortfalls.tenantId, tenantId), eq(stockShortfalls.id, id));
    if (Number(quantity) <= 0) await tx.delete(stockShortfalls).where(where);
    else await tx.update(stockShortfalls).set({ quantity }).where(where);
  }

  /** OB-13: an edited or cancelled order waits for nothing it asked for before; how many rows went. */
  async deleteShortfallsForOrder(
    tx: Transaction,
    tenantId: string,
    orderId: string,
  ): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .delete(stockShortfalls)
      .where(and(eq(stockShortfalls.tenantId, tenantId), eq(stockShortfalls.orderId, orderId)))
      .returning({ id: stockShortfalls.id });
    return rows.length;
  }
}
