import { and, asc, count, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { suppliers, type InsertSupplier, type SelectSupplier } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';
import { escapeLike } from '../like';
import { isEmptyPatch } from '../patch';

/** The details a supplier's update may change; `archivedAt` archives it (a time) or brings it back (null). */
export type SupplierPatch = Partial<
  Pick<SelectSupplier, 'name' | 'phone' | 'email' | 'address' | 'notes' | 'archivedAt'>
>;

// PUR-01: a shop's suppliers. Every method sets the shop's tenant context. A supplier is archived, never deleted, so a
// past purchase still shows its name; only LIF-19's day-60 deletion removes the rows.
export class SupplierRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async insertSupplier(
    tx: Transaction,
    values: Omit<InsertSupplier, 'id' | 'createdAt' | 'updatedAt' | 'archivedAt'>,
  ): Promise<SelectSupplier> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const [row] = await tx.insert(suppliers).values(values).returning();
    if (!row) throw new Error('insert returned no supplier row');
    return row;
  }

  /**
   * PUR-07: a new live supplier of this name, unless a live one has it already (ignoring case): then nothing is made
   * and null comes back. A writer adding the same name at the same moment waits for the first and makes nothing. The
   * live-name index is the only unique rule a new supplier can meet (its id is new), so any conflict is that one.
   */
  async insertSupplierIfFree(
    tx: Transaction,
    values: Omit<InsertSupplier, 'id' | 'createdAt' | 'updatedAt' | 'archivedAt'>,
  ): Promise<SelectSupplier | null> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const [row] = await tx.insert(suppliers).values(values).onConflictDoNothing().returning();
    return row ?? null;
  }

  async findSupplier(
    tx: Transaction,
    tenantId: string,
    id: string,
  ): Promise<SelectSupplier | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.id, id)));
    return row ?? null;
  }

  /** PUR-07: the live supplier of this name, ignoring case, if there is one. */
  async findLiveByName(
    tx: Transaction,
    tenantId: string,
    name: string,
  ): Promise<SelectSupplier | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.tenantId, tenantId),
          isNull(suppliers.archivedAt),
          sql`lower(${suppliers.name}) = lower(${name})`,
        ),
      );
    return row ?? null;
  }

  async updateSupplier(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: SupplierPatch,
  ): Promise<SelectSupplier | null> {
    if (isEmptyPatch(patch)) return this.findSupplier(tx, tenantId, id);
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .update(suppliers)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.id, id)))
      .returning();
    return row ?? null;
  }

  /** The live suppliers, or the archived ones, by name A to Z; `search` finds a name containing it, ignoring case. */
  async listSuppliers(
    tx: Transaction,
    tenantId: string,
    filter: { archived: boolean; search: string | null },
    page: { offset: number; limit: number },
  ): Promise<{ rows: SelectSupplier[]; total: number }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const conditions = [
      eq(suppliers.tenantId, tenantId),
      filter.archived ? isNotNull(suppliers.archivedAt) : isNull(suppliers.archivedAt),
    ];
    if (filter.search !== null) {
      conditions.push(sql`${suppliers.name} ILIKE ${`%${escapeLike(filter.search)}%`}`);
    }
    const where = and(...conditions);
    const rows = await tx
      .select()
      .from(suppliers)
      .where(where)
      .orderBy(asc(sql`lower(${suppliers.name})`), asc(suppliers.id))
      .offset(page.offset)
      .limit(page.limit);
    const counted = await tx.select({ total: count() }).from(suppliers).where(where);
    return { rows, total: counted[0]?.total ?? 0 };
  }

  /** LIF-19: a lapsed shop's suppliers, at day 60, after its purchases. */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(suppliers).where(eq(suppliers.tenantId, tenantId));
  }
}
