import { Inject, Injectable } from '@nestjs/common';
import type { CatalogueDataStore, CatalogueTransactions } from '../ports/catalogue-stores';
import { CATALOGUE_DATA_STORE, CATALOGUE_TRANSACTIONS } from '../tokens';

/**
 * LIF-19: the day-60 deletion job's catalogue step: every product, category, own attribute and value, option set
 * and size chart, and the shop's settings row (its delivery rate and default payment policy), in one transaction.
 * Safe to run again: a second run finds nothing to delete.
 */
@Injectable()
export class CatalogueEraser {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(CATALOGUE_DATA_STORE) private readonly data: CatalogueDataStore,
  ) {}

  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.transactions.run((tx) => this.data.deleteAllForTenant(tx, tenantId));
  }
}
