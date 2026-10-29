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
  listForExport(
    tx: Transaction,
    tenantId: string,
    afterId: string | null,
    limit: number,
  ): Promise<CustomerRecord[]>;
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
