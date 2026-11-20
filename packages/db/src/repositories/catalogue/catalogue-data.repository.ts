import { eq } from 'drizzle-orm';
import {
  attributeOptions,
  attributes,
  cardFactRuns,
  catalogueState,
  categories,
  comboParts,
  offers,
  optionSets,
  productCardFacts,
  products,
  shopSettings,
  taxClasses,
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
    // CMB-01: combos' parts first, since a part's variant is never deleted while a combo names it.
    await tx.delete(comboParts).where(eq(comboParts.tenantId, tenantId));
    // OFFERS-PLAN: the shop's offers, with what each holds and the prices each set.
    await tx.delete(offers).where(eq(offers.tenantId, tenantId));
    // SB-10: the cards' kept facts, and when they were last worked out.
    await tx.delete(productCardFacts).where(eq(productCardFacts.tenantId, tenantId));
    await tx.delete(cardFactRuns).where(eq(cardFactRuns.tenantId, tenantId));
    await tx.delete(products).where(eq(products.tenantId, tenantId));
    // TAX-01 (Slice 4.6a): the tax classes, once no product names them and the shop's default no longer does.
    await tx
      .update(shopSettings)
      .set({ defaultTaxClassId: null })
      .where(eq(shopSettings.tenantId, tenantId));
    await tx.delete(taxClasses).where(eq(taxClasses.tenantId, tenantId));
    await tx.delete(categories).where(eq(categories.tenantId, tenantId));
    await tx.delete(attributeOptions).where(eq(attributeOptions.tenantId, tenantId));
    await tx.delete(attributes).where(eq(attributes.tenantId, tenantId));
    await tx.delete(optionSets).where(eq(optionSets.tenantId, tenantId));
    await tx.delete(catalogueState).where(eq(catalogueState.tenantId, tenantId));
  }
}
