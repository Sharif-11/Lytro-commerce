import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  notExists,
  exists,
  sql,
  type SQL,
} from 'drizzle-orm';
import {
  catalogueState,
  productAttributes,
  productAttributeValues,
  productCategories,
  productSlugRedirects,
  productVariants,
  products,
  type InsertProduct,
  type SelectProduct,
  type SelectProductAttribute,
  type SelectProductAttributeValue,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

export type ProductPatch = Partial<
  Omit<InsertProduct, 'id' | 'tenantId' | 'slug' | 'createdAt' | 'minPrice' | 'maxPrice'>
>;

export interface ProductListFilter {
  search?: string;
  /** A category id, or 'uncategorized' for products filed in none (PRD-03). */
  categoryId?: string;
  offset: number;
  limit: number;
}

export interface ProductListRow {
  product: SelectProduct;
  variantCount: number;
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

// PRD-01 to PRD-05, PRD-15, LND-04, CCH-02: a shop's products, the categories they are filed in, their
// attributes, their link slugs and the catalogue version. Every method runs inside a transaction that carries
// the shop's tenant context, so row-level security applies.
export class ProductRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  /**
   * Locks the shop's catalogue for the rest of the transaction, so two product creations count against the plan
   * limit one after the other (PRD-04) rather than both seeing room for one more.
   */
  async lockCatalogue(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.insert(catalogueState).values({ tenantId }).onConflictDoNothing();
    await tx.execute(
      sql`SELECT 1 FROM tenant.catalogue_state WHERE tenant_id = ${tenantId} FOR UPDATE`,
    );
  }

  /** CCH-02: one more catalogue version, in the transaction of the write that changed public output. */
  async bumpVersion(tx: Transaction, tenantId: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .insert(catalogueState)
      .values({ tenantId, version: 1 })
      .onConflictDoUpdate({
        target: catalogueState.tenantId,
        set: { version: sql`${catalogueState.version} + 1` },
      })
      .returning({ version: catalogueState.version });
    return rows[0]?.version ?? 1;
  }

  async catalogueVersion(tx: Transaction, tenantId: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ version: catalogueState.version })
      .from(catalogueState)
      .where(eq(catalogueState.tenantId, tenantId));
    return rows[0]?.version ?? 1;
  }

  /** PRD-04: products that count against the plan limit. Archived ones do not. */
  async countLiveProducts(tx: Transaction, tenantId: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ total: count() })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), isNull(products.deletedAt)));
    return rows[0]?.total ?? 0;
  }

  /** PRD-02, LND-04: every slug that is `base` or `base-<n>`, current or kept as a redirect. */
  async slugsLike(tx: Transaction, tenantId: string, base: string): Promise<string[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const pattern = `${escapeLike(base)}-%`;
    const result = await tx.execute<{ slug: string }>(sql`
      SELECT slug FROM tenant.products
      WHERE tenant_id = ${tenantId} AND (slug = ${base} OR slug LIKE ${pattern})
      UNION
      SELECT old_slug FROM tenant.product_slug_redirects
      WHERE tenant_id = ${tenantId} AND (old_slug = ${base} OR old_slug LIKE ${pattern})`);
    return result.rows.map((row) => row.slug);
  }

  /** Which product holds a slug, as its current link or a kept old one (LND-04). */
  async slugHolder(
    tx: Transaction,
    tenantId: string,
    slug: string,
  ): Promise<{ productId: string; current: boolean } | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const current = await tx
      .select({ productId: products.id })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.slug, slug)));
    if (current[0]) return { productId: current[0].productId, current: true };
    const kept = await tx
      .select({ productId: productSlugRedirects.productId })
      .from(productSlugRedirects)
      .where(
        and(eq(productSlugRedirects.tenantId, tenantId), eq(productSlugRedirects.oldSlug, slug)),
      );
    return kept[0] ? { productId: kept[0].productId, current: false } : null;
  }

  async insertProduct(
    tx: Transaction,
    values: InsertProduct & { tenantId: string },
  ): Promise<SelectProduct> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const rows = await tx.insert(products).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error('insert returned no product row');
    return row;
  }

  async findProduct(
    tx: Transaction,
    tenantId: string,
    id: string,
    includeArchived: boolean,
  ): Promise<SelectProduct | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenantId),
          eq(products.id, id),
          includeArchived ? undefined : isNull(products.deletedAt),
        ),
      );
    return rows[0] ?? null;
  }

  async updateProduct(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: ProductPatch & { slug?: string },
  ): Promise<SelectProduct | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .update(products)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id)))
      .returning();
    return rows[0] ?? null;
  }

  /** PRD-13: removes the product for good; its variants, attributes, filing and old slugs go with it. */
  async deleteProduct(tx: Transaction, tenantId: string, id: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(products).where(and(eq(products.tenantId, tenantId), eq(products.id, id)));
  }

  /** PRD-12: the dashboard's list, newest first within the shop's own order, archived ones left out. */
  async listProducts(
    tx: Transaction,
    tenantId: string,
    filter: ProductListFilter,
  ): Promise<{ rows: ProductListRow[]; total: number }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const conditions: (SQL | undefined)[] = [
      eq(products.tenantId, tenantId),
      isNull(products.deletedAt),
    ];
    if (filter.search) {
      conditions.push(sql`${products.name} ILIKE ${`%${escapeLike(filter.search)}%`}`);
    }
    const filed = tx
      .select({ one: sql`1` })
      .from(productCategories)
      .where(
        and(
          eq(productCategories.tenantId, products.tenantId),
          eq(productCategories.productId, products.id),
          filter.categoryId && filter.categoryId !== 'uncategorized'
            ? eq(productCategories.categoryId, filter.categoryId)
            : undefined,
        ),
      );
    if (filter.categoryId === 'uncategorized') conditions.push(notExists(filed));
    else if (filter.categoryId) conditions.push(exists(filed));
    const where = and(...conditions);

    const totals = await tx.select({ total: count() }).from(products).where(where);
    const rows = await tx
      .select()
      .from(products)
      .where(where)
      .orderBy(asc(products.sortOrder), desc(products.createdAt), asc(products.id))
      .limit(filter.limit)
      .offset(filter.offset);
    const counts =
      rows.length === 0
        ? []
        : await tx
            .select({ productId: productVariants.productId, total: count() })
            .from(productVariants)
            .where(
              and(
                eq(productVariants.tenantId, tenantId),
                inArray(
                  productVariants.productId,
                  rows.map((row) => row.id),
                ),
                isNull(productVariants.deletedAt),
              ),
            )
            .groupBy(productVariants.productId);
    const variantsOf = new Map(counts.map((row) => [row.productId, row.total]));
    return {
      rows: rows.map((product) => ({ product, variantCount: variantsOf.get(product.id) ?? 0 })),
      total: totals[0]?.total ?? 0,
    };
  }

  /** PRD-15: the categories each product is filed under. */
  async listCategoryLinks(
    tx: Transaction,
    tenantId: string,
    productIds: string[],
  ): Promise<{ productId: string; categoryId: string }[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (productIds.length === 0) return [];
    return tx
      .select({ productId: productCategories.productId, categoryId: productCategories.categoryId })
      .from(productCategories)
      .where(
        and(
          eq(productCategories.tenantId, tenantId),
          inArray(productCategories.productId, productIds),
        ),
      );
  }

  async replaceCategoryLinks(
    tx: Transaction,
    tenantId: string,
    productId: string,
    categoryIds: string[],
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(productCategories)
      .where(
        and(eq(productCategories.tenantId, tenantId), eq(productCategories.productId, productId)),
      );
    if (categoryIds.length === 0) return;
    await tx
      .insert(productCategories)
      .values(categoryIds.map((categoryId) => ({ tenantId, productId, categoryId })));
  }

  /** ATL-02: the attributes a product uses, with each one's role, in order. */
  async listProductAttributes(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<SelectProductAttribute[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(productAttributes)
      .where(
        and(eq(productAttributes.tenantId, tenantId), eq(productAttributes.productId, productId)),
      )
      .orderBy(asc(productAttributes.sortOrder));
  }

  async listAttributeValues(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<SelectProductAttributeValue[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(productAttributeValues)
      .where(
        and(
          eq(productAttributeValues.tenantId, tenantId),
          eq(productAttributeValues.productId, productId),
        ),
      );
  }

  async insertProductAttributes(
    tx: Transaction,
    rows: (typeof productAttributes.$inferInsert & { tenantId: string })[],
  ): Promise<void> {
    const first = rows[0];
    if (!first) return;
    await this.transactions.setTenantContext(tx, first.tenantId);
    await tx.insert(productAttributes).values(rows);
  }

  async setAttributeOrder(
    tx: Transaction,
    tenantId: string,
    productId: string,
    attributeId: string,
    sortOrder: number,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(productAttributes)
      .set({ sortOrder })
      .where(
        and(
          eq(productAttributes.tenantId, tenantId),
          eq(productAttributes.productId, productId),
          eq(productAttributes.attributeId, attributeId),
        ),
      );
  }

  /** Removes attributes from a product; their informational values go with them. */
  async deleteProductAttributes(
    tx: Transaction,
    tenantId: string,
    productId: string,
    attributeIds: string[],
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (attributeIds.length === 0) return;
    await tx
      .delete(productAttributes)
      .where(
        and(
          eq(productAttributes.tenantId, tenantId),
          eq(productAttributes.productId, productId),
          inArray(productAttributes.attributeId, attributeIds),
        ),
      );
  }

  async insertAttributeValues(
    tx: Transaction,
    rows: (typeof productAttributeValues.$inferInsert & { tenantId: string })[],
  ): Promise<void> {
    const first = rows[0];
    if (!first) return;
    await this.transactions.setTenantContext(tx, first.tenantId);
    await tx.insert(productAttributeValues).values(rows);
  }

  /** LND-04: keeps an old slug pointing at its product after a deliberate change. */
  async insertRedirect(
    tx: Transaction,
    tenantId: string,
    oldSlug: string,
    productId: string,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.insert(productSlugRedirects).values({ tenantId, oldSlug, productId });
  }

  /** A product taking one of its own old slugs back no longer needs it kept as a redirect. */
  async deleteRedirect(tx: Transaction, tenantId: string, oldSlug: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(productSlugRedirects)
      .where(
        and(eq(productSlugRedirects.tenantId, tenantId), eq(productSlugRedirects.oldSlug, oldSlug)),
      );
  }

  async listRedirects(tx: Transaction, tenantId: string, productId: string): Promise<string[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ oldSlug: productSlugRedirects.oldSlug })
      .from(productSlugRedirects)
      .where(
        and(
          eq(productSlugRedirects.tenantId, tenantId),
          eq(productSlugRedirects.productId, productId),
        ),
      )
      .orderBy(asc(productSlugRedirects.createdAt));
    return rows.map((row) => row.oldSlug);
  }

  /**
   * CCH-11: the product's lowest and highest price over its live, active variants (a variant without a price of
   * its own sells at the product's).
   */
  async refreshPriceRange(tx: Transaction, tenantId: string, productId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(sql`
      UPDATE tenant.products p SET
        min_price = r.low, max_price = r.high
      FROM (
        SELECT min(coalesce(v.price, pp.base_price)) AS low, max(coalesce(v.price, pp.base_price)) AS high
        FROM tenant.products pp
        LEFT JOIN tenant.product_variants v
          ON v.tenant_id = pp.tenant_id AND v.product_id = pp.id AND v.deleted_at IS NULL AND v.active
        WHERE pp.tenant_id = ${tenantId} AND pp.id = ${productId}
      ) r
      WHERE p.tenant_id = ${tenantId} AND p.id = ${productId}`);
  }
}
