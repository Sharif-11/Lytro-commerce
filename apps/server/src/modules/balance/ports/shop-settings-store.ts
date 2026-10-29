import type { Transaction } from '@lytronix/db';

/**
 * RAT-14: a tenant's own extra-delivery-charge-per-kg rate; SUP-01: when its link was first shared; SFT-16: whether its
 * shared storefront is on.
 */
export interface ShopSettingsStore {
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  get(
    tx: Transaction,
    tenantId: string,
  ): Promise<{
    extraDeliveryChargePerKg: string;
    linkSharedAt: Date | null;
    storefrontEnabled: boolean;
  } | null>;
  set(tx: Transaction, tenantId: string, extraDeliveryChargePerKg: string): Promise<void>;
  /** SFT-16: the shared storefront switched on or off. */
  setStorefrontEnabled(tx: Transaction, tenantId: string, enabled: boolean): Promise<void>;
  markLinkShared(tx: Transaction, tenantId: string, at: Date): Promise<void>;
}
