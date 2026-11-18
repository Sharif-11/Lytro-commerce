import type { Transaction } from '@lytronix/db';
import type { BrandHoldings, BrandRecord, BrandValues, ImageSize } from '../types/brand';

/** BRN-02, BRN-05: tenant.brand_identities, and what decides whether the identity may show. */
export interface BrandStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  find(tx: Transaction, tenantId: string): Promise<BrandRecord | null>;
  /** Throws MediaNotAttachable when an image is not a ready image of the shop's. */
  save(tx: Transaction, tenantId: string, values: BrandValues): Promise<BrandRecord>;
  deleteForTenant(tx: Transaction, tenantId: string): Promise<void>;
  holdings(tx: Transaction, tenantId: string): Promise<BrandHoldings>;
  /** SB-5: the shop's own icon (shop settings), every plan's; null for none. */
  shopIcon(tx: Transaction, tenantId: string): Promise<string | null>;
  /** SB-5: sets the shop's own icon; refused as MediaNotAttachable as `save` is. */
  setShopIcon(tx: Transaction, tenantId: string, mediaId: string | null): Promise<void>;
  /** The size of one of the shop's images; null when it has none by that id. */
  imageSize(tx: Transaction, tenantId: string, mediaId: string): Promise<ImageSize | null>;
}
