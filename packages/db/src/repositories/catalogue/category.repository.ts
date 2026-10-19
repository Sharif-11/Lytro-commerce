import { and, asc, count, countDistinct, eq, inArray, isNull, sql } from 'drizzle-orm';
import { categories, productCategories, products, type SelectCategory } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

// PRD-03, PRD-15: a shop's category tree and the products filed in it. Every method runs inside a transaction
// that carries the shop's tenant context, so row-level security applies.
export class CategoryRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async listCategories(tx: Transaction, tenantId: string): Promise<SelectCategory[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(categories)
      .where(eq(categories.tenantId, tenantId))
      .orderBy(asc(categories.depth), asc(categories.sortOrder), sql`lower(${categories.name})`);
  }

  async findCategories(
    tx: Transaction,
    tenantId: string,
    ids: string[],
  ): Promise<SelectCategory[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (ids.length === 0) return [];
    return tx
      .select()
      .from(categories)
      .where(and(eq(categories.tenantId, tenantId), inArray(categories.id, ids)));
  }

  /** Every slug that is `base` or `base-<n>`, so the next free suffix can be chosen (PRD-02). */
  async slugsLike(tx: Transaction, tenantId: string, base: string): Promise<string[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ slug: categories.slug })
      .from(categories)
      .where(
        and(
          eq(categories.tenantId, tenantId),
          sql`(${categories.slug} = ${base} OR ${categories.slug} LIKE ${`${base}-%`})`,
        ),
      );
    return rows.map((row) => row.slug);
  }

  async insertCategory(
    tx: Transaction,
    values: {
      tenantId: string;
      parentId: string | null;
      name: string;
      slug: string;
      depth: number;
      sortOrder: number;
      visible: boolean;
    },
  ): Promise<SelectCategory> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const rows = await tx.insert(categories).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error('insert returned no category row');
    return row;
  }

  async updateCategory(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: {
      name?: string;
      parentId?: string | null;
      depth?: number;
      sortOrder?: number;
      visible?: boolean;
    },
  ): Promise<SelectCategory | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .update(categories)
      .set(patch)
      .where(and(eq(categories.tenantId, tenantId), eq(categories.id, id)))
      .returning();
    return rows[0] ?? null;
  }

  /** A category and every category under it, with each one's depth below it (0 for the category itself). */
  async subtree(
    tx: Transaction,
    tenantId: string,
    id: string,
  ): Promise<{ id: string; level: number }[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{ id: string; level: number }>(sql`
      WITH RECURSIVE tree AS (
        SELECT c.id, 0 AS level FROM tenant.categories c WHERE c.tenant_id = ${tenantId} AND c.id = ${id}
        UNION ALL
        SELECT c.id, tree.level + 1 FROM tenant.categories c
        JOIN tree ON c.parent_id = tree.id
        WHERE c.tenant_id = ${tenantId}
      )
      SELECT id, level FROM tree`);
    return result.rows.map((row) => ({ id: row.id, level: row.level }));
  }

  /** Re-levels a moved category's subtree: each descendant sits `level` below the category's new depth. */
  async setSubtreeDepths(
    tx: Transaction,
    tenantId: string,
    subtree: { id: string; level: number }[],
    rootDepth: number,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    for (const node of subtree) {
      await tx
        .update(categories)
        .set({ depth: rootDepth + node.level })
        .where(and(eq(categories.tenantId, tenantId), eq(categories.id, node.id)));
    }
  }

  async countChildren(tx: Transaction, tenantId: string, id: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ total: count() })
      .from(categories)
      .where(and(eq(categories.tenantId, tenantId), eq(categories.parentId, id)));
    return rows[0]?.total ?? 0;
  }

  /** How many products not archived are filed under the category (PRD-03's refusal names this). */
  async countLiveProducts(tx: Transaction, tenantId: string, id: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ total: countDistinct(productCategories.productId) })
      .from(productCategories)
      .innerJoin(
        products,
        and(
          eq(products.tenantId, productCategories.tenantId),
          eq(products.id, productCategories.productId),
        ),
      )
      .where(
        and(
          eq(productCategories.tenantId, tenantId),
          eq(productCategories.categoryId, id),
          isNull(products.deletedAt),
        ),
      );
    return rows[0]?.total ?? 0;
  }

  /** Products not archived filed under each of the shop's categories, for the category list. */
  async countLiveProductsByCategory(
    tx: Transaction,
    tenantId: string,
  ): Promise<Map<string, number>> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({
        categoryId: productCategories.categoryId,
        total: countDistinct(productCategories.productId),
      })
      .from(productCategories)
      .innerJoin(
        products,
        and(
          eq(products.tenantId, productCategories.tenantId),
          eq(products.id, productCategories.productId),
        ),
      )
      .where(and(eq(productCategories.tenantId, tenantId), isNull(products.deletedAt)))
      .groupBy(productCategories.categoryId);
    return new Map(rows.map((row) => [row.categoryId, row.total]));
  }

  /**
   * PRD-03: takes every product (archived ones too) out of the category. A product whose primary category it was
   * takes another category it is still filed under, or none (Uncategorized).
   */
  async unfileProducts(tx: Transaction, tenantId: string, id: string): Promise<string[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const removed = await tx
      .delete(productCategories)
      .where(and(eq(productCategories.tenantId, tenantId), eq(productCategories.categoryId, id)))
      .returning({ productId: productCategories.productId });
    await tx.execute(sql`
      UPDATE tenant.products p SET primary_category_id = (
        SELECT pc.category_id FROM tenant.product_categories pc
        WHERE pc.tenant_id = p.tenant_id AND pc.product_id = p.id
        ORDER BY pc.category_id LIMIT 1
      ), updated_at = now()
      WHERE p.tenant_id = ${tenantId} AND p.primary_category_id = ${id}`);
    return removed.map((row) => row.productId);
  }

  async deleteCategory(tx: Transaction, tenantId: string, id: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(categories)
      .where(and(eq(categories.tenantId, tenantId), eq(categories.id, id)));
  }
}
