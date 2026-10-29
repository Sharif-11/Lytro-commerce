import { and, asc, eq, gt, ne, or, sql, type SQL } from 'drizzle-orm';
import { FulfillmentStatus, StatusOverride } from '@lytronix/validators';
import { customers, orders, type SelectCustomer } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

// CUS-01: a shop's customers, one per phone, kept by the orders that name them. Every method sets the shop's tenant
// context. A customer is never deleted, only erased (CUS-09), apart from LIF-19's day-60 deletion (migration 0083).
export class CustomerRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  /**
   * CUS-01: the customer with this phone, made if the shop has none. Its row is not locked here: `recount` locks it, at
   * the end of the order's transaction, so orders from one phone wait for each other only briefly (KNOWN-GAPS §98).
   */
  async claim(tx: Transaction, tenantId: string, phone: string): Promise<string> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [made] = await tx
      .insert(customers)
      .values({ tenantId, phone })
      .onConflictDoNothing({
        target: [customers.tenantId, customers.phone],
        where: sql`${customers.phone} IS NOT NULL`,
      })
      .returning({ id: customers.id });
    if (made) return made.id;
    const [found] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.phone, phone)));
    if (!found) throw new Error('the customer with this phone is gone');
    return found.id;
  }

  /**
   * CUS-01, agreed 2026-10-29: works the customer's figures out again from its orders -- how many it has not cancelled,
   * what the delivered ones came to, when it last ordered, and the latest order's name -- so they always agree. The row
   * is locked first, by a statement of its own, so the count that follows sees every order another transaction
   * committed while this one waited.
   */
  async recount(tx: Transaction, tenantId: string, customerId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)))
      // NO KEY UPDATE: an order naming the customer holds a key share on its row, which this must not wait for.
      .for('no key update');
    const own = and(eq(orders.tenantId, tenantId), eq(orders.customerId, customerId));
    const live = or(
      sql`${orders.statusOverride} IS NULL`,
      ne(orders.statusOverride, StatusOverride.Cancelled),
    );
    await tx
      .update(customers)
      .set({
        orderCount: sql`(SELECT count(*)::int FROM ${orders} WHERE ${and(own, live)})`,
        totalSpent: sql`(SELECT coalesce(sum(${orders.grandTotal}), 0) FROM ${orders}
          WHERE ${and(own, live, eq(orders.fulfillmentStatus, FulfillmentStatus.Delivered))})`,
        lastOrderAt: sql`(SELECT max(${orders.createdAt}) FROM ${orders} WHERE ${own})`,
        name: sql`coalesce((SELECT ${orders.customerName} FROM ${orders} WHERE ${own}
          ORDER BY ${orders.createdAt} DESC, ${orders.id} DESC LIMIT 1), ${customers.name})`,
        updatedAt: new Date(),
      })
      .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)));
  }

  async find(tx: Transaction, tenantId: string, id: string): Promise<SelectCustomer | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.id, id)));
    return row ?? null;
  }

  /** LIF-16: the shop's customers, a batch at a time after the one `afterId` names (null: the first). */
  async listForExport(
    tx: Transaction,
    tenantId: string,
    afterId: string | null,
    limit: number,
  ): Promise<SelectCustomer[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const conditions: (SQL | undefined)[] = [eq(customers.tenantId, tenantId)];
    if (afterId !== null) conditions.push(gt(customers.id, afterId));
    return tx
      .select()
      .from(customers)
      .where(and(...conditions))
      .orderBy(asc(customers.id))
      .limit(limit);
  }

  /** LIF-19: every customer of the shop, after its orders. The database allows this for a lapsed shop only. */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(sql`SELECT set_config('app.erasing_tenant', ${tenantId}, true)`);
    await tx.delete(customers).where(eq(customers.tenantId, tenantId));
  }
}
