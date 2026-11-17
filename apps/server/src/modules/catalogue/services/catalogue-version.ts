import { Inject, Injectable } from '@nestjs/common';
import { EdgePurges } from '../../shared/edge-cache/services/edge-purges';
import type { Transaction } from '@lytronix/db';
import type { StockState } from '@lytronix/validators';
import type { ProductStore } from '../ports/catalogue-stores';
import { PRODUCT_STORE } from '../tokens';

/**
 * CCH-02: moves the shop's catalogue version inside the caller's transaction, for a change outside the catalogue
 * module that still alters what the public catalogue shows (a delivery zone's name, charge or "no delivery"; a
 * product's public stock state, INV-19). D9-32: and drops the pages Cloudflare keeps that show it.
 */
@Injectable()
export class CatalogueVersion {
  constructor(
    @Inject(PRODUCT_STORE) private readonly products: ProductStore,
    @Inject(EdgePurges) private readonly edge: EdgePurges,
  ) {}

  /** A change every page of the shop may show (its zones, its photos): the version, and the shop's kept pages. */
  async bump(tx: Transaction, tenantId: string): Promise<number> {
    const version = await this.products.bumpVersion(tx, tenantId);
    await this.edge.shop(tx, tenantId);
    return version;
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
    // D9-32: "sold out", "only a few left" or back in stock, on its pages and cards at once (CCH-08).
    await this.edge.products(tx, tenantId, [productId]);
  }
}
