import type { Transaction } from '@lytronix/db';
import type { CustomerRecord } from '../types/customers';

/** CUS-01: a shop's customers, one per phone, kept by its orders. A customer is erased, never deleted (CUS-09). */
export interface CustomerStore {
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** The customer with this phone, made if new; not locked (`recount` locks it). */
  claim(tx: Transaction, tenantId: string, phone: string): Promise<string>;
  /** Locks the customer, then works its figures out again from its orders. */
  recount(tx: Transaction, tenantId: string, customerId: string): Promise<void>;
  find(tx: Transaction, tenantId: string, id: string): Promise<CustomerRecord | null>;
  /** CUS-02: a page of the shop's customers not erased, who last ordered first, by part of the name or phone. */
  list(
    tx: Transaction,
    tenantId: string,
    search: string | null,
    page: { offset: number; limit: number },
  ): Promise<{ rows: CustomerRecord[]; total: number }>;
  /** CUS-01: the thana and address of the customer's latest delivery order. */
  lastAddress(
    tx: Transaction,
    tenantId: string,
    customerId: string,
  ): Promise<{ locationId: number; deliveryAddress: string } | null>;
  /** CUS-14 (Slice 4.4b): the shopper's account of this phone, and since when. */
  accountOf(tx: Transaction, tenantId: string, phone: string): Promise<{ createdAt: Date } | null>;
  /** CUS-09: the customer, not erased, locked against every order naming it until the transaction ends. */
  lockForErasure(tx: Transaction, tenantId: string, id: string): Promise<CustomerRecord | null>;
  /** CUS-09: the numbers of the customer's orders not yet delivered, returned or cancelled. */
  openOrderNumbers(tx: Transaction, tenantId: string, customerId: string): Promise<string[]>;
  /** CUS-09: erases the customer and its orders' personal details; how many orders it held. */
  erase(tx: Transaction, tenantId: string, id: string, now: Date): Promise<number>;
  listForExport(
    tx: Transaction,
    tenantId: string,
    afterId: string | null,
    limit: number,
  ): Promise<CustomerRecord[]>;
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
