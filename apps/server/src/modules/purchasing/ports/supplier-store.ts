import type { SupplierPatch, Transaction } from '@lytronix/db';
import type { SupplierRecord } from '../types/purchasing';

/**
 * PUR-01: a shop's suppliers. A name already taken by a live supplier, ignoring case, is a `UniqueViolation('name')`.
 * A supplier is archived, never deleted, except by LIF-19's day-60 deletion.
 */
export interface SupplierStore {
  insertSupplier(
    tx: Transaction,
    tenantId: string,
    values: Pick<SupplierRecord, 'name' | 'phone' | 'email' | 'address' | 'notes'>,
  ): Promise<SupplierRecord>;
  /** PUR-07: a new supplier of this name, or null when a live one has it (another writer may just have added it). */
  insertSupplierIfFree(
    tx: Transaction,
    tenantId: string,
    values: Pick<SupplierRecord, 'name' | 'phone' | 'email' | 'address' | 'notes'>,
  ): Promise<SupplierRecord | null>;
  findSupplier(tx: Transaction, tenantId: string, id: string): Promise<SupplierRecord | null>;
  /** PUR-07: the live supplier of this name, ignoring case. */
  findLiveByName(tx: Transaction, tenantId: string, name: string): Promise<SupplierRecord | null>;
  updateSupplier(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: SupplierPatch,
  ): Promise<SupplierRecord | null>;
  listSuppliers(
    tx: Transaction,
    tenantId: string,
    filter: { archived: boolean; search: string | null },
    page: { offset: number; limit: number },
  ): Promise<{ rows: SupplierRecord[]; total: number }>;
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
