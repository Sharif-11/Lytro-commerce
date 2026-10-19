import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import type { ProductStore } from '../ports/catalogue-stores';
import { PRODUCT_STORE } from '../tokens';

/**
 * CCH-02: moves the shop's catalogue version inside the caller's transaction, for a change outside the catalogue
 * module that still alters what the public catalogue shows (a delivery zone's name, charge or "no delivery").
 */
@Injectable()
export class CatalogueVersion {
  constructor(@Inject(PRODUCT_STORE) private readonly products: ProductStore) {}

  bump(tx: Transaction, tenantId: string): Promise<number> {
    return this.products.bumpVersion(tx, tenantId);
  }
}
