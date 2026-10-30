import type { Transaction } from '@lytronix/db';
import type { DomainRow, DomainToCheck, FeatureHoldings } from '../types/domain';

/** TEN-09 to TEN-14, DWN-10: control.tenant_domains, and the shop's plan features and add-ons that let a domain serve. */
export interface DomainStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  /** The shop's domain, whatever its state but removed. */
  current(tx: Transaction, tenantId: string): Promise<DomainRow | null>;
  /** The shop an active domain belongs to under this name, its active twin included. */
  activeOwner(tx: Transaction, hostname: string): Promise<string | null>;
  /** Throws UniqueViolation('domain') when the shop already has one. */
  insert(
    tx: Transaction,
    values: { tenantId: string; hostname: string; twin: string },
  ): Promise<DomainRow>;
  update(tx: Transaction, id: string, patch: Partial<DomainRow>): Promise<DomainRow>;
  /** Every waiting or active domain, with its shop's address. */
  listToCheck(): Promise<DomainToCheck[]>;
  holdings(tx: Transaction, tenantId: string): Promise<FeatureHoldings>;
  /** LIF-19: the deleted shop's domain, removed. Safe to run again. */
  removeAllForTenant(tenantId: string, at: Date): Promise<void>;
}
