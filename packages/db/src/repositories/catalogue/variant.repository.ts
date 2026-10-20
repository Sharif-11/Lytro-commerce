import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import {
  productVariants,
  variantAttributeValues,
  type InsertProductVariant,
  type SelectProductVariant,
  type SelectVariantAttributeValue,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

export type VariantPatch = Partial<
  Pick<
    InsertProductVariant,
    | 'sku'
    | 'barcode'
    | 'price'
    | 'weightKg'
    | 'deliveryCharge'
    | 'deliveryMode'
    | 'packAmount'
    | 'active'
    | 'deletedAt'
  >
>;

// INV-24: every read of "the product's variants" leaves out the stock-holder variant, which holds a shared stock and is
// never sold, listed or counted. Only findStockHolder reaches it.
const sellable = eq(productVariants.isStockHolder, false);

// ATR-04 to ATR-06, ATR-13, ATL-04: a product's variants and the options that make each one distinct. Every
// method runs inside a transaction that carries the shop's tenant context, so row-level security applies.
export class VariantRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  /** A product's variants, oldest first; retired ones only when asked (to bring one back). Never its stock holder. */
  async listVariants(
    tx: Transaction,
    tenantId: string,
    productId: string,
    includeRetired: boolean,
  ): Promise<SelectProductVariant[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(productVariants)
      .where(
        and(
          eq(productVariants.tenantId, tenantId),
          eq(productVariants.productId, productId),
          sellable,
          includeRetired ? undefined : isNull(productVariants.deletedAt),
        ),
      )
      .orderBy(asc(productVariants.createdAt), asc(productVariants.id));
  }

  async findVariant(
    tx: Transaction,
    tenantId: string,
    productId: string,
    id: string,
  ): Promise<SelectProductVariant | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(productVariants)
      .where(
        and(
          eq(productVariants.tenantId, tenantId),
          eq(productVariants.productId, productId),
          eq(productVariants.id, id),
          sellable,
          isNull(productVariants.deletedAt),
        ),
      );
    return rows[0] ?? null;
  }

  /** INV-24: the product's stock-holder variant, retired or not; null for a product that never shared its stock. */
  async findStockHolder(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<SelectProductVariant | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(productVariants)
      .where(
        and(
          eq(productVariants.tenantId, tenantId),
          eq(productVariants.productId, productId),
          eq(productVariants.isStockHolder, true),
        ),
      );
    return rows[0] ?? null;
  }

  /** INV-24: a product that stops sharing its stock keeps no pack amounts, on any of its variants. */
  async clearPackAmounts(tx: Transaction, tenantId: string, productId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(productVariants)
      .set({ packAmount: null })
      .where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.productId, productId)));
  }

  async listVariantValues(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<SelectVariantAttributeValue[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (variantIds.length === 0) return [];
    return tx
      .select()
      .from(variantAttributeValues)
      .where(
        and(
          eq(variantAttributeValues.tenantId, tenantId),
          inArray(variantAttributeValues.variantId, variantIds),
        ),
      );
  }

  async insertVariant(
    tx: Transaction,
    values: InsertProductVariant & { tenantId: string },
  ): Promise<SelectProductVariant> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const rows = await tx.insert(productVariants).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error('insert returned no variant row');
    return row;
  }

  async updateVariant(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: VariantPatch,
  ): Promise<SelectProductVariant | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .update(productVariants)
      .set(patch)
      .where(and(eq(productVariants.tenantId, tenantId), eq(productVariants.id, id)))
      .returning();
    return rows[0] ?? null;
  }

  /**
   * Retires variants no longer offered. Their option rows go (a retired variant names nothing); the variant row
   * stays, with its combination key, so stock history keeps its subject and the same combination can come back.
   */
  async retireVariants(tx: Transaction, tenantId: string, ids: string[]): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (ids.length === 0) return;
    await tx
      .delete(variantAttributeValues)
      .where(
        and(
          eq(variantAttributeValues.tenantId, tenantId),
          inArray(variantAttributeValues.variantId, ids),
        ),
      );
    await tx
      .update(productVariants)
      .set({ deletedAt: new Date() })
      .where(and(eq(productVariants.tenantId, tenantId), inArray(productVariants.id, ids)));
  }

  async insertVariantValues(
    tx: Transaction,
    rows: (typeof variantAttributeValues.$inferInsert & { tenantId: string })[],
  ): Promise<void> {
    const first = rows[0];
    if (!first) return;
    await this.transactions.setTenantContext(tx, first.tenantId);
    await tx.insert(variantAttributeValues).values(rows);
  }
}
