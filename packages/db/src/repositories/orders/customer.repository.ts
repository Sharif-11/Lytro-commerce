import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { FulfillmentStatus, FulfilmentType, StatusOverride } from '@lytronix/validators';
import {
  customers,
  idempotencyKeys,
  orders,
  paymentSessions,
  shopperCodes,
  shoppers,
  type SelectCustomer,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';
import { escapeLike } from '../like';

// CUS-09: what an order no longer holds once its customer is erased, by the names its stored replies use.
const ERASED_REPLY_FIELDS = ['customerName', 'customerPhone', 'deliveryAddress', 'shopperNote'];
// CUS-09, agreed 2026-10-30: an order is finished, and its customer may be erased, once delivered or returned.
const FINISHED: FulfillmentStatus[] = [FulfillmentStatus.Delivered, FulfillmentStatus.Returned];

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

  /**
   * CUS-02: a page of the shop's customers, who last ordered first, with how many match in all; by any part of the name
   * or phone. Erased customers are gone from the list.
   */
  async list(
    tx: Transaction,
    tenantId: string,
    search: string | null,
    page: { offset: number; limit: number },
  ): Promise<{ rows: SelectCustomer[]; total: number }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const conditions: (SQL | undefined)[] = [
      eq(customers.tenantId, tenantId),
      isNull(customers.erasedAt),
    ];
    if (search !== null) {
      const pattern = `%${escapeLike(search)}%`;
      conditions.push(or(ilike(customers.name, pattern), ilike(customers.phone, pattern)));
    }
    const where = and(...conditions);
    const rows = await tx
      .select()
      .from(customers)
      .where(where)
      .orderBy(sql`${customers.lastOrderAt} DESC NULLS LAST`, desc(customers.id))
      .offset(page.offset)
      .limit(page.limit);
    const counted = await tx.select({ total: count() }).from(customers).where(where);
    return { rows, total: counted[0]?.total ?? 0 };
  }

  /** CUS-14 (Slice 4.4b): the shopper's account of the customer's phone, and since when, or null with none. */
  async accountOf(
    tx: Transaction,
    tenantId: string,
    phone: string,
  ): Promise<{ createdAt: Date } | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ createdAt: shoppers.createdAt })
      .from(shoppers)
      .where(and(eq(shoppers.tenantId, tenantId), eq(shoppers.phone, phone)));
    return row ?? null;
  }

  /** CUS-02 (Slice 4.8b): which of these phones have a shopper's account. */
  async phonesWithAccount(
    tx: Transaction,
    tenantId: string,
    phones: string[],
  ): Promise<Set<string>> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (phones.length === 0) return new Set();
    const rows = await tx
      .select({ phone: shoppers.phone })
      .from(shoppers)
      .where(and(eq(shoppers.tenantId, tenantId), inArray(shoppers.phone, phones)));
    return new Set(rows.map((row) => row.phone));
  }

  /** CUS-01: where the customer's latest delivery order went -- its thana and address -- or null with none. */
  async lastAddress(
    tx: Transaction,
    tenantId: string,
    customerId: string,
  ): Promise<{ locationId: number; deliveryAddress: string } | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ locationId: orders.locationId, deliveryAddress: orders.deliveryAddress })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.customerId, customerId),
          eq(orders.fulfilmentType, FulfilmentType.Delivery),
        ),
      )
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(1);
    if (!row || row.locationId === null || row.deliveryAddress === null) return null;
    return { locationId: row.locationId, deliveryAddress: row.deliveryAddress };
  }

  /**
   * CUS-09: the customer, not yet erased, locked until the transaction ends. FOR UPDATE waits for an order still being
   * made with it, whose key share on this row it conflicts with, so that order is seen by what follows.
   */
  async lockForErasure(
    tx: Transaction,
    tenantId: string,
    id: string,
  ): Promise<SelectCustomer | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(customers)
      .where(
        and(eq(customers.tenantId, tenantId), eq(customers.id, id), isNull(customers.erasedAt)),
      )
      .for('update');
    return row ?? null;
  }

  /** CUS-09, agreed 2026-10-30: the numbers of the customer's orders still open -- not finished, not cancelled. */
  async openOrderNumbers(tx: Transaction, tenantId: string, customerId: string): Promise<string[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ orderNumber: orders.orderNumber })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.customerId, customerId),
          notInArray(orders.fulfillmentStatus, FINISHED),
          or(
            sql`${orders.statusOverride} IS NULL`,
            ne(orders.statusOverride, StatusOverride.Cancelled),
          ),
        ),
      )
      .orderBy(asc(orders.createdAt), asc(orders.id));
    return rows.flatMap((row) => (row.orderNumber !== null ? [row.orderNumber] : []));
  }

  /**
   * CUS-09: erases the customer at a privacy request -- its name and phone, its shopper's account (Slice 4.4b), and on
   * each of its orders the name, phone, address and shopper's note, the totals, items and thana kept -- and the same
   * details in the replies stored for its orders' idempotency keys (D4-8). How many orders it held.
   */
  async erase(tx: Transaction, tenantId: string, id: string, now: Date): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [customer] = await tx
      .select({ phone: customers.phone })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.id, id)));
    // Slice 4.4b: the shopper's account of this phone goes too -- its sign-ins and saved addresses with it -- and the
    // sign-up codes sent to the phone.
    if (customer?.phone) {
      await tx
        .delete(shoppers)
        .where(and(eq(shoppers.tenantId, tenantId), eq(shoppers.phone, customer.phone)));
      await tx
        .delete(shopperCodes)
        .where(and(eq(shopperCodes.tenantId, tenantId), eq(shopperCodes.phone, customer.phone)));
    }
    const erased = await tx
      .update(orders)
      .set({
        customerName: null,
        customerPhone: null,
        deliveryAddress: null,
        shopperNote: null,
        customerErasedAt: now,
        updatedAt: now,
      })
      .where(and(eq(orders.tenantId, tenantId), eq(orders.customerId, id)))
      .returning({ id: orders.id });
    const ids = erased.map((row) => row.id);
    if (ids.length > 0) {
      // Slice 5.3: the numbers its shopper paid from, on its orders' payment sessions.
      await tx
        .update(paymentSessions)
        .set({ senderNumber: null, updatedAt: now })
        .where(and(eq(paymentSessions.tenantId, tenantId), inArray(paymentSessions.orderId, ids)));
      await tx
        .update(idempotencyKeys)
        .set({
          responseBody: sql`(SELECT jsonb_object_agg(field, CASE WHEN field IN (${sql.join(
            ERASED_REPLY_FIELDS.map((field) => sql`${field}`),
            sql`, `,
          )})
            THEN 'null'::jsonb ELSE value END) FROM jsonb_each(${idempotencyKeys.responseBody}) AS reply(field, value))`,
        })
        .where(
          and(
            eq(idempotencyKeys.tenantId, tenantId),
            inArray(sql<string>`${idempotencyKeys.responseBody} ->> 'id'`, ids),
          ),
        );
    }
    await tx
      .update(customers)
      .set({ name: null, phone: null, erasedAt: now, updatedAt: now })
      .where(and(eq(customers.tenantId, tenantId), eq(customers.id, id)));
    return ids.length;
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
