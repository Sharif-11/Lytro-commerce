import type { SelectTaxClass, Transaction } from '@lytronix/db';

/** TAX-01 (Slice 4.6a): a shop's tax classes and its default; a name already taken is a `UniqueViolation('name')`. */
export interface TaxClassStore {
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  list(tx: Transaction, tenantId: string): Promise<SelectTaxClass[]>;
  find(tx: Transaction, tenantId: string, id: string): Promise<SelectTaxClass | null>;
  lockAll(tx: Transaction, tenantId: string): Promise<number>;
  insert(
    tx: Transaction,
    tenantId: string,
    values: { name: string; rate: string },
  ): Promise<SelectTaxClass>;
  update(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: { name?: string; rate?: string },
  ): Promise<SelectTaxClass | null>;
  delete(tx: Transaction, tenantId: string, id: string): Promise<void>;
  countProducts(tx: Transaction, tenantId: string, id: string): Promise<number>;
  defaultOf(tx: Transaction, tenantId: string): Promise<string | null>;
  setDefault(tx: Transaction, tenantId: string, id: string | null): Promise<void>;
}
