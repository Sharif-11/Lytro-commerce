import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import type { CustomerStore } from '../ports/customer-store';
import { CUSTOMER_STORE } from '../tokens';
import type { CustomerRecord } from '../types/customers';

/** LIF-16: how many customers the export reads at a time. */
const EXPORT_BATCH = 500;

/**
 * CUS-01, agreed 2026-10-29: a shop's customers, one per phone number, kept by the orders that name them. An order made,
 * changed, cancelled or deleted works its customer's figures out again inside the order's own transaction: how many
 * orders it has not cancelled, what its delivered orders came to, when it last ordered, and the latest order's name.
 * The customers list, search and privacy erasure arrive with Slice 4.4 (CUS-02, CUS-09).
 */
@Injectable()
export class CustomerService {
  constructor(@Inject(CUSTOMER_STORE) private readonly store: CustomerStore) {}

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
