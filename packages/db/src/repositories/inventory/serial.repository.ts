import { and, count, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { SerialStatus } from '@lytronix/validators';
import { serialNumbers, type SelectSerialNumber } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

// The statuses of a unit the shop still holds.
const HELD = [SerialStatus.InStock, SerialStatus.Reserved];

/** A serial arriving with its unit, or added later to a unit already held (no movement). */
export interface NewSerial {
  variantId: string;
  serial: string;
  receivedMovementId: number | null;
}

// INV-14: a shop's serial-numbered units. Every method sets the shop's tenant context. The database keeps a variant
// from holding more serials than units, a serial unique among the units held, and a row that has left unchanged.
export class SerialRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  /** How many serials each of these variants holds. */
  async countHeld(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<Map<string, number>> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (variantIds.length === 0) return new Map();
    const rows = await tx
      .select({ variantId: serialNumbers.variantId, held: count() })
      .from(serialNumbers)
      .where(
        and(
          eq(serialNumbers.tenantId, tenantId),
          inArray(serialNumbers.variantId, variantIds),
          inArray(serialNumbers.status, HELD),
        ),
      )
      .groupBy(serialNumbers.variantId);
    return new Map(rows.map((row) => [row.variantId, row.held]));
  }

  /** A variant's held serials, locked; lock the variant's level first, as every stock writer does. */
  async lockHeld(
    tx: Transaction,
    tenantId: string,
    variantId: string,
  ): Promise<SelectSerialNumber[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(serialNumbers)
      .where(
        and(
          eq(serialNumbers.tenantId, tenantId),
          eq(serialNumbers.variantId, variantId),
          inArray(serialNumbers.status, HELD),
        ),
      )
      .orderBy(serialNumbers.serial)
      .for('update');
  }

  /** INV-14: which of these serials a unit the shop holds already has, whatever its variant. */
  async findHeld(
    tx: Transaction,
    tenantId: string,
    serials: string[],
  ): Promise<SelectSerialNumber[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (serials.length === 0) return [];
    return tx
      .select()
      .from(serialNumbers)
      .where(
        and(
          eq(serialNumbers.tenantId, tenantId),
          inArray(serialNumbers.serial, serials),
          inArray(serialNumbers.status, HELD),
        ),
      );
  }

  async insertSerials(tx: Transaction, tenantId: string, rows: NewSerial[]): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (rows.length === 0) return;
    await tx.insert(serialNumbers).values(rows.map((row) => ({ tenantId, ...row })));
  }

  /** INV-14: these units left by this movement: sold with the order they went to, or written off. */
  async markLeft(
    tx: Transaction,
    tenantId: string,
    ids: string[],
    movementId: number,
    soldOrderId: string | null,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (ids.length === 0) return;
    await tx
      .update(serialNumbers)
      .set({
        status: soldOrderId !== null ? SerialStatus.Sold : SerialStatus.WrittenOff,
        leftMovementId: movementId,
        soldOrderId,
        updatedAt: new Date(),
      })
      .where(and(eq(serialNumbers.tenantId, tenantId), inArray(serialNumbers.id, ids)));
  }

  /** INV-17: these sold units came back; each returns as a new in-stock serial, so the sold row stays as history. */
  async markReturned(tx: Transaction, tenantId: string, ids: string[]): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (ids.length === 0) return;
    await tx
      .update(serialNumbers)
      .set({ status: SerialStatus.Returned, updatedAt: new Date() })
      .where(and(eq(serialNumbers.tenantId, tenantId), inArray(serialNumbers.id, ids)));
  }

  /** A variant's serials, newest first, those of one status when asked, else the ones it holds. */
  async listSerials(
    tx: Transaction,
    tenantId: string,
    variantId: string,
    status: SerialStatus | null,
    page: { offset: number; limit: number },
  ): Promise<{ rows: SelectSerialNumber[]; total: number }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const which = and(
      eq(serialNumbers.tenantId, tenantId),
      eq(serialNumbers.variantId, variantId),
      status !== null ? eq(serialNumbers.status, status) : inArray(serialNumbers.status, HELD),
    );
    const rows = await tx
      .select()
      .from(serialNumbers)
      .where(which)
      .orderBy(desc(serialNumbers.createdAt), desc(serialNumbers.id))
      .offset(page.offset)
      .limit(page.limit);
    const totals = await tx.select({ total: count() }).from(serialNumbers).where(which);
    return { rows, total: totals[0]?.total ?? 0 };
  }

  /** INV-09, INV-14: the serials that came in or went out with these movements. */
  async listForMovements(
    tx: Transaction,
    tenantId: string,
    movementIds: number[],
  ): Promise<SelectSerialNumber[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (movementIds.length === 0) return [];
    return tx
      .select()
      .from(serialNumbers)
      .where(
        and(
          eq(serialNumbers.tenantId, tenantId),
          or(
            inArray(serialNumbers.receivedMovementId, movementIds),
            inArray(serialNumbers.leftMovementId, movementIds),
          ),
        ),
      )
      .orderBy(serialNumbers.serial);
  }

  async findSerial(
    tx: Transaction,
    tenantId: string,
    id: string,
  ): Promise<SelectSerialNumber | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(serialNumbers)
      .where(and(eq(serialNumbers.tenantId, tenantId), eq(serialNumbers.id, id)));
    return rows[0] ?? null;
  }

  async updateSerial(tx: Transaction, tenantId: string, id: string, serial: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(serialNumbers)
      .set({ serial, updatedAt: new Date() })
      .where(and(eq(serialNumbers.tenantId, tenantId), eq(serialNumbers.id, id)));
  }

  async deleteSerial(tx: Transaction, tenantId: string, id: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(serialNumbers)
      .where(and(eq(serialNumbers.tenantId, tenantId), eq(serialNumbers.id, id)));
  }

  /** LIF-19: a lapsed shop's serials, at day 60; the guard lets this through for an archived or deleted shop only. */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(sql`SELECT set_config('app.erasing_tenant', ${tenantId}, true)`);
    await tx.delete(serialNumbers).where(eq(serialNumbers.tenantId, tenantId));
  }
}
