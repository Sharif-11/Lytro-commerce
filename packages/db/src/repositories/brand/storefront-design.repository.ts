import { eq, sql } from 'drizzle-orm';
import { storefrontDesigns, tenants, type SelectStorefrontDesign } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

/** SB-16: a category or product a design points at, as it is now; `shown` is whether shoppers can reach it. */
// A type, not an interface, so it reads as the row type `execute` takes.
export type StorefrontTargetRow = {
  id: string;
  slug: string;
  name: string;
  shown: boolean;
};

/** SB-9: what the shop has on sale now, for the announcement that writes itself. */
export interface StorefrontSaleSummary {
  /** Active products with a saving of at least 1%. */
  products: number;
  /** The biggest of their savings, in whole percent; 0 for none. */
  bestDiscount: number;
}

/**
 * SB-12, SB-14: what a write leaves -- the three copies, and every photo any of them names (`storefrontMediaIds` of
 * each), so the media library counts the uses without reading the documents.
 */
export interface StorefrontDesignValues {
  draft: unknown;
  published: unknown;
  previous: unknown;
  mediaIds: string[];
  draftSavedAt: Date | null;
  publishedAt: Date | null;
}

// SB-12, SB-14 (STOREFRONT-BUILDER-PLAN, 2026-11-18): a shop's storefront design, one row per shop that has ever saved
// one. The service decides what each step leaves; this keeps it, one shop at a time.
export class StorefrontDesignRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async get(tx: Transaction, tenantId: string): Promise<SelectStorefrontDesign | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(storefrontDesigns)
      .where(eq(storefrontDesigns.tenantId, tenantId))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * The row, held until the transaction ends, so a save and a publish from two screens happen one after the other; a
   * shop with no row yet gets an empty one first, so there is always a row to hold.
   */
  async lock(tx: Transaction, tenantId: string): Promise<SelectStorefrontDesign> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.insert(storefrontDesigns).values({ tenantId }).onConflictDoNothing();
    const rows = await tx
      .select()
      .from(storefrontDesigns)
      .where(eq(storefrontDesigns.tenantId, tenantId))
      .for('update');
    const row = rows[0];
    if (!row) throw new Error('the storefront design row was not made');
    return row;
  }

  /** Writes the three copies whole, as the service decided them. */
  async write(
    tx: Transaction,
    tenantId: string,
    values: StorefrontDesignValues,
  ): Promise<SelectStorefrontDesign> {
    await this.transactions.setTenantContext(tx, tenantId);
    const set = { ...values, updatedAt: sql`now()` };
    const rows = await tx
      .insert(storefrontDesigns)
      .values({ tenantId, ...set })
      .onConflictDoUpdate({ target: storefrontDesigns.tenantId, set })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('the storefront design was not saved');
    return row;
  }

  /** SB-11: the shop's type (a preset key), which picks its starting theme; null until chosen. */
  async businessType(tx: Transaction, tenantId: string): Promise<string | null> {
    const rows = await tx
      .select({ businessType: tenants.businessType })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return rows[0]?.businessType ?? null;
  }

  /**
   * SB-16: the categories and products of these that the shop still has -- a category shown when it and every category
   * above it are visible, a product when it is active. One deleted is left out.
   */
  async targets(
    tx: Transaction,
    tenantId: string,
    categoryIds: readonly string[],
    productIds: readonly string[],
  ): Promise<{ categories: StorefrontTargetRow[]; products: StorefrontTargetRow[] }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const list = (ids: readonly string[]) =>
      sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      );
    const categories =
      categoryIds.length === 0
        ? []
        : (
            await tx.execute<StorefrontTargetRow>(sql`
              WITH RECURSIVE up (id, start) AS (
                SELECT c.id, c.id FROM tenant.categories c
                WHERE c.tenant_id = ${tenantId} AND c.id IN (${list(categoryIds)})
                UNION ALL
                SELECT c.parent_id, up.start FROM tenant.categories c
                JOIN up ON c.id = up.id
                WHERE c.tenant_id = ${tenantId} AND c.parent_id IS NOT NULL
              )
              SELECT c.id, c.slug, c.name,
                bool_and(a.visible) AS shown
              FROM tenant.categories c
              JOIN up ON up.start = c.id
              JOIN tenant.categories a ON a.tenant_id = c.tenant_id AND a.id = up.id
              WHERE c.tenant_id = ${tenantId}
              GROUP BY c.id, c.slug, c.name`)
          ).rows;
    const products =
      productIds.length === 0
        ? []
        : (
            await tx.execute<StorefrontTargetRow>(sql`
              SELECT p.id, p.slug, p.name, p.active AS shown
              FROM tenant.products p
              WHERE p.tenant_id = ${tenantId} AND p.id IN (${list(productIds)}) AND p.deleted_at IS NULL`)
          ).rows;
    return { categories, products };
  }

  /** SB-9: how many active products are on sale, and the biggest saving among them. */
  async sale(tx: Transaction, tenantId: string): Promise<StorefrontSaleSummary> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{ products: number; best: number | null }>(sql`
      SELECT count(*)::int AS products, max(p.best_discount)::int AS best
      FROM tenant.products p
      WHERE p.tenant_id = ${tenantId} AND p.active AND p.deleted_at IS NULL AND p.best_discount > 0`);
    const row = result.rows[0];
    return { products: row?.products ?? 0, bestDiscount: row?.best ?? 0 };
  }

  /** LIF-19: removes the shop's design at day 60. */
  async deleteForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(storefrontDesigns).where(eq(storefrontDesigns.tenantId, tenantId));
  }
}
