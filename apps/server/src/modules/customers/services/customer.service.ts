import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { AuditAction, bdMobileNumber, type CustomerListQuery } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import type { CustomerStore } from '../ports/customer-store';
import { CUSTOMER_STORE } from '../tokens';
import type {
  CustomerListItem,
  CustomerPage,
  CustomerRecord,
  CustomerView,
} from '../types/customers';

/** LIF-16: how many customers the export reads at a time. */
const EXPORT_BATCH = 500;

function listItemOf(customer: CustomerRecord, hasAccount: boolean): CustomerListItem {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    orderCount: customer.orderCount,
    totalSpent: customer.totalSpent,
    lastOrderAt: customer.lastOrderAt,
    firstOrderAt: customer.createdAt,
    hasAccount,
  };
}

/**
 * CUS-01, agreed 2026-10-29: a shop's customers, one per phone number, kept by the orders that name them. An order made,
 * changed, cancelled or deleted works its customer's figures out again inside the order's own transaction: how many
 * orders it has not cancelled, what its delivered orders came to, when it last ordered, and the latest order's name.
 * Staff list and search them and open one (CUS-02, Slice 4.4a); at a privacy request one is erased (CUS-09).
 */
@Injectable()
export class CustomerService {
  constructor(
    @Inject(CUSTOMER_STORE) private readonly store: CustomerStore,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  /** CUS-02: the shop's customers, who last ordered first, searched by any part of the name or phone. */
  list(tenantId: string, query: CustomerListQuery): Promise<CustomerPage> {
    const search = query.q !== undefined ? (bdMobileNumber(query.q) ?? query.q) : null;
    return this.store.run(tenantId, async (tx) => {
      const { rows, total } = await this.store.list(tx, tenantId, search, {
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      });
      const accounts = await this.store.phonesWithAccount(
        tx,
        tenantId,
        rows.flatMap((row) => (row.phone !== null ? [row.phone] : [])),
      );
      return {
        customers: rows.map((row) =>
          listItemOf(row, row.phone !== null && accounts.has(row.phone)),
        ),
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      };
    });
  }

  /** CUS-01, CUS-02: one customer, and where its latest delivery went; an erased one is gone. */
  get(tenantId: string, id: string): Promise<CustomerView> {
    return this.store.run(tenantId, async (tx) => {
      const customer = await this.store.find(tx, tenantId, id);
      if (!customer || customer.erasedAt !== null) {
        throw new ApiError('not_found', 'CustomerNotFound', {});
      }
      const account =
        customer.phone !== null ? await this.store.accountOf(tx, tenantId, customer.phone) : null;
      return {
        ...listItemOf(customer, account !== null),
        lastAddress: await this.store.lastAddress(tx, tenantId, customer.id),
        account,
      };
    });
  }

  /**
   * CUS-09, agreed 2026-10-30: deletes a customer at a privacy request -- its name and phone, and its orders' names,
   * phones, addresses and shopper's notes, their totals kept -- refused while any of its orders is not yet delivered,
   * returned or cancelled, so no parcel loses its address on the way. The activity entry names no personal detail.
   */
  async erase(tenantId: string, id: string, actor: CatalogueActor): Promise<void> {
    const who = await this.activity.resolve(tenantId, actor);
    await this.store.run(tenantId, async (tx) => {
      const customer = await this.store.lockForErasure(tx, tenantId, id);
      if (!customer) throw new ApiError('not_found', 'CustomerNotFound', {});
      const open = await this.store.openOrderNumbers(tx, tenantId, customer.id);
      if (open.length > 0) {
        throw new ApiError('conflict', 'CustomerHasOpenOrders', { orders: open }, undefined, {
          count: open.length,
        });
      }
      const orders = await this.store.erase(tx, tenantId, customer.id, new Date());
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.CustomerErased,
        { type: 'customer', id: customer.id },
        { orders },
      );
    });
  }

  /** The customer this phone names, made if the shop has none; not locked until its figures are worked out. */
  claimWithin(tx: Transaction, tenantId: string, phone: string): Promise<string> {
    return this.store.claim(tx, tenantId, phone);
  }

  /**
   * Works these customers' figures out again from their orders, once each, locking each first. Called at the end of an
   * order's transaction, after its stock is held, so every order locks the same way: stock, customers, the counter.
   */
  async recountWithin(
    tx: Transaction,
    tenantId: string,
    customerIds: readonly (string | null)[],
  ): Promise<void> {
    // In id order, so two orders changing customers at once wait for each other instead of deadlocking.
    const ids = [...new Set(customerIds)].flatMap((id) => (id !== null ? [id] : [])).sort();
    for (const id of ids) await this.store.recount(tx, tenantId, id);
  }

  /** CUS-01 (Slice 4.8a): how many orders the customer has, inside the caller's transaction; null once erased. */
  async orderCountWithin(tx: Transaction, tenantId: string, id: string): Promise<number | null> {
    const customer = await this.store.find(tx, tenantId, id);
    return customer && customer.erasedAt === null ? customer.orderCount : null;
  }

  /** LIF-16: every customer of the shop, for its data export. */
  listAll(tenantId: string): Promise<CustomerRecord[]> {
    return this.store.run(tenantId, async (tx) => {
      const all: CustomerRecord[] = [];
      let after: string | null = null;
      for (;;) {
        const batch = await this.store.listForExport(tx, tenantId, after, EXPORT_BATCH);
        all.push(...batch);
        const last = batch.at(-1);
        if (!last || batch.length < EXPORT_BATCH) return all;
        after = last.id;
      }
    });
  }

  /** LIF-19: the day-60 deletion job's customers step; runs after the orders step, and is safe to run again. */
  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.store.run(tenantId, (tx) => this.store.deleteAllForTenant(tx, tenantId));
  }
}
