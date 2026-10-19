import { eq } from 'drizzle-orm';
import {
  attributeOptions,
  attributes,
  catalogueState,
  categories,
  optionSets,
  products,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

// LIF-19: a deleted shop's catalogue, removed at day 60 with the rest of its business data.
export class CatalogueDataRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  /**
   * Deletes every catalogue row of the shop, children first. Products take their variants, values, attributes,
   * category links, old slugs, size charts and delivery limits with them; categories take their suggestions and
   * charts. The shop's own values on platform attributes go before its attributes, since an option names its
   * attribute. Platform rows (tenant_id NULL) are never touched.
   */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(products).where(eq(products.tenantId, tenantId));
    await tx.delete(categories).where(eq(categories.tenantId, tenantId));
    await tx.delete(attributeOptions).where(eq(attributeOptions.tenantId, tenantId));
    await tx.delete(attributes).where(eq(attributes.tenantId, tenantId));
    await tx.delete(optionSets).where(eq(optionSets.tenantId, tenantId));
    await tx.delete(catalogueState).where(eq(catalogueState.tenantId, tenantId));
  }
}
