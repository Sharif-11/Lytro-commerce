import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { attributeOptions, attributes } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

/** ATR-19 (PD-13, PD-14): one design of a product: its name, its number, and whether it is still offered. */
export interface DesignRow {
  id: string;
  productId: string;
  name: string;
  /** Given once, never reused: the design's place among every design its product ever had. */
  number: number;
  retiredAt: Date | null;
}

// ATR-19: a product's own designs, the values of the one platform photo-designs attribute that belong to a product
// (PHOTO-DESIGNS-PLAN PD-13). Every method sets the shop's tenant context.
export class DesignRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  /** The platform's photo-designs attribute (migration 0129 seeds exactly one). */
  async designAttributeId(tx: Transaction, tenantId: string): Promise<string> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ id: attributes.id })
      .from(attributes)
      .where(and(eq(attributes.photoDesigns, true), isNull(attributes.tenantId)))
      .limit(1);
    if (!row) throw new Error('the photo-designs attribute is missing (migration 0129)');
    return row.id;
  }

  /** These products' designs, in number order; the retired ones too when asked. */
  async listDesigns(
    tx: Transaction,
    tenantId: string,
    productIds: string[],
    withRetired: boolean,
  ): Promise<DesignRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (productIds.length === 0) return [];
    const rows = await tx
      .select({
        id: attributeOptions.id,
        productId: attributeOptions.productId,
        name: attributeOptions.value,
        number: attributeOptions.sortOrder,
        retiredAt: attributeOptions.retiredAt,
      })
      .from(attributeOptions)
      .where(
        and(
          eq(attributeOptions.tenantId, tenantId),
          inArray(attributeOptions.productId, productIds),
          withRetired ? undefined : isNull(attributeOptions.retiredAt),
        ),
      )
      .orderBy(asc(attributeOptions.productId), asc(attributeOptions.sortOrder));
    return rows.flatMap((row) =>
      row.productId === null ? [] : [{ ...row, productId: row.productId }],
    );
  }

  /** A new design of this product; its name must not be another of the product's. */
  async insertDesign(
    tx: Transaction,
    values: {
      tenantId: string;
      productId: string;
      attributeId: string;
      name: string;
      number: number;
    },
  ): Promise<string> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const [row] = await tx
      .insert(attributeOptions)
      .values({
        tenantId: values.tenantId,
        productId: values.productId,
        attributeId: values.attributeId,
        value: values.name,
        sortOrder: values.number,
      })
      .returning({ id: attributeOptions.id });
    if (!row) throw new Error('design insert returned no row');
    return row.id;
  }

  async renameDesign(tx: Transaction, tenantId: string, id: string, name: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(attributeOptions)
      .set({ value: name })
      .where(and(eq(attributeOptions.tenantId, tenantId), eq(attributeOptions.id, id)));
  }

  /** PD-16: designs no photo shows any more stop being offered; past orders keep their names. */
  async retireDesigns(tx: Transaction, tenantId: string, ids: string[]): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (ids.length === 0) return;
    await tx
      .update(attributeOptions)
      .set({ retiredAt: new Date() })
      .where(
        and(
          eq(attributeOptions.tenantId, tenantId),
          inArray(attributeOptions.id, ids),
          isNull(attributeOptions.retiredAt),
        ),
      );
  }
}
