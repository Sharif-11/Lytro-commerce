import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import type { StockState } from '@lytronix/validators';
import type { ProductStore } from '../ports/catalogue-stores';
import { PRODUCT_STORE } from '../tokens';

/**
 * CCH-02: moves the shop's catalogue version inside the caller's transaction, for a change outside the catalogue
 * module that still alters what the public catalogue shows (a delivery zone's name, charge or "no delivery"; a
 * product's public stock state, INV-19).
 */
@Injectable()
export class CatalogueVersion {
  constructor(@Inject(PRODUCT_STORE) private readonly products: ProductStore) {}

  bump(tx: Transaction, tenantId: string): Promise<number> {
    return this.products.bumpVersion(tx, tenantId);
  }

  /**
   * CCH-08, INV-19: sets the public stock state of a product (null leaves it) and of the variants named, and moves the
   * version once when anything changed.
   */
  async setStockStates(
    tx: Transaction,
    tenantId: string,
    productId: string,
    change: {
      product: StockState | null;
      variants: readonly { variantId: string; state: StockState }[];
    },
  ): Promise<void> {
    if (change.product === null && change.variants.length === 0) return;
    if (change.product !== null) {
      await this.products.updateProduct(tx, tenantId, productId, { stockState: change.product });
    }
    if (change.variants.length > 0) {
      await this.products.setVariantStockStates(tx, tenantId, change.variants);
    }
    await this.products.bumpVersion(tx, tenantId);
  }
}
