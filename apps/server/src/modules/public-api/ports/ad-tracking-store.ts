import type { SelectAdTrackingSettings, SelectCatalogFeed, Transaction } from '@lytronix/db';

/** LND-15 to LND-17: a shop's ad tracking row. */
export interface AdTrackingStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  find(tx: Transaction, tenantId: string): Promise<SelectAdTrackingSettings | null>;
  lock(tx: Transaction, tenantId: string): Promise<SelectAdTrackingSettings | null>;
  save(
    tx: Transaction,
    values: { tenantId: string; metaPixelId: string | null; metaCapiTokenEnc: Buffer | null },
  ): Promise<SelectAdTrackingSettings>;
  delete(tx: Transaction, tenantId: string): Promise<void>;
  /** SEC-11 (Slice 9.7): one use of the shop's Conversions API token. */
  recordUse(values: {
    tenantId: string;
    action: string;
    orderId: string | null;
    succeeded: boolean;
    at: Date;
  }): Promise<void>;
  /** LIF-19's day-60 deletion only. */
  deleteUses(tx: Transaction, tenantId: string): Promise<void>;
}

/** FED-01, FED-05: each shop's feed link, found by its token's hash before the shop is known. */
export interface CatalogFeedStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  findByHash(tokenHash: Buffer): Promise<string | null>;
  findForTenant(tenantId: string): Promise<SelectCatalogFeed | null>;
  insertFirst(values: {
    tenantId: string;
    tokenHash: Buffer;
    tokenEnc: Buffer;
  }): Promise<SelectCatalogFeed>;
  replace(
    tx: Transaction,
    values: { tenantId: string; tokenHash: Buffer; tokenEnc: Buffer },
  ): Promise<SelectCatalogFeed>;
  deleteForTenant(tenantId: string): Promise<void>;
}
