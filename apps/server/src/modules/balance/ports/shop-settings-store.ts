import type { Transaction } from '@lytronix/db';

/** RAT-14: a tenant's own extra-delivery-charge-per-kg rate. */
export interface ShopSettingsStore {
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  get(tx: Transaction, tenantId: string): Promise<{ extraDeliveryChargePerKg: string } | null>;
  set(tx: Transaction, tenantId: string, extraDeliveryChargePerKg: string): Promise<void>;
}
