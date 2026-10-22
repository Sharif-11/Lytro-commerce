import type { Transaction } from '@lytronix/db';

/** RAT-14: a tenant's own extra-delivery-charge-per-kg rate; SUP-01: when its link was first shared. */
export interface ShopSettingsStore {
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  get(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ extraDeliveryChargePerKg: string; linkSharedAt: Date | null } | null>;
  set(tx: Transaction, tenantId: string, extraDeliveryChargePerKg: string): Promise<void>;
  markLinkShared(tx: Transaction, tenantId: string, at: Date): Promise<void>;
}
