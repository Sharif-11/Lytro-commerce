import { sql, type SQL } from 'drizzle-orm';
import { PublicProductSort, type ItemCondition, type StockState } from '@lytronix/validators';
import type { Transaction, TransactionRunner } from '../../transactions';
import { escapeLike } from '../like';

/** CCH-02, KNOWN-GAPS §66: the shop's catalogue version and the platform library's, together naming what is shown. */
export interface CatalogueVersions {
  shop: number;
  platform: number;
}

/** CCH-11: one product as a public list shows it, with where the next page starts after it. */
export interface PublicProductRow {
  id: string;
  slug: string;
  name: string;
  minPrice: string | null;
  maxPrice: string | null;
  stockState: StockState;
  /** When it was added, as ISO text: a storefront marks a recent one "New" (Slice 12b). */
  createdAt: string;
  /** This row's place in the order asked for, as text, so the next page starts exactly after it. */
  position: string[];
}

/**
 * ATR-18, Slice 12b: one value a list card shows as a swatch -- of the first of a product's splitting attributes whose
 * values on sale have a colour or a picture -- in the attribute's own order.
 */
export interface PublicSwatchRow {
  productId: string;
  optionId: string;
  value: string;
  swatchColor: string | null;
  swatchImageId: string | null;
}

/** PRD-03, Slice 12b: how many active products a category holds, its subcategories' included, as its list counts them. */
export interface CategoryProductCount {
  categoryId: string;
  products: number;
}

/** FED-01, FED-02: one variant on sale of an active product, as a catalog feed row reads it. */
export interface FeedVariantRow {
  productId: string;
  productSlug: string;
  name: string;
  description: string | null;
  condition: ItemCondition;
  variantId: string;
  /** Its own price, or the product's. */
  price: string;
  stockState: StockState;
}

/** FED-02: one of an active product's ready photos, in the order shown. */
export interface FeedImageRow {
  productId: string;
  mediaId: string;
  hash: string;
}

/** FED-02: a value of one of the named attributes, the product's own (no variant) or one variant's. */
export interface FeedAttributeRow {
  productId: string;
  variantId: string | null;
  name: string;
  value: string;
}

/** PRD-09, CCH-11, CCH-12: which of the shop's public products, in what order, from where. */
export interface PublicProductFilter {
  /** A category and every category under it; null is the whole shop. */
  categoryIds: string[] | null;
  /** The words searched for; null lists without searching. */
  search: string | null;
  sort: PublicProductSort;
  /** CCH-08, Slice 12b: only products not sold out. */
  inStock: boolean;
  /** The last row's position on the page before; null starts at the beginning. */
  after: string[] | null;
  limit: number;
}

// CCH-12: how alike a typed word and the closest word of a name must be (pg_trgm's word similarity, 0 to 1). The
// default 0.6 misses a one-letter slip in a short English word ("panjbi" scores 0.57 against "Panjabi").
const WORD_SIMILARITY = '0.5';

interface OrderKey {
  /** The ordered expression, over the inner query's `p`. */
  expression: SQL;
  /** Its type, so a position read back as text compares as what it was. */
  type: SQL;
}

/** A search's words as a prefix query (`word:*`, all of them), letters, marks and digits only; '' when none are left. */
export function prefixQuery(search: string): string {
  return search
    .split(/\s+/u)
    .map((word) => word.replace(/[^\p{L}\p{M}\p{N}]/gu, ''))
    .filter((word) => word.length > 0)
    .map((word) => `${word}:*`)
    .join(' & ');
}

// PRD-09, CCH-11, CCH-12, LND-04: what the public catalogue reads -- the versions, the shop's active products a page at
// a time, a product by its link, current or old. A list's own query reads only the columns kept on the product row and
// pages by position, never by offset; the swatches its page shows are one read more, for that page's products only. Each method sets the shop's tenant context
// itself, so row-level security applies.
export class PublicCatalogueRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async versions(tx: Transaction, tenantId: string): Promise<CatalogueVersions> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{ shop: string | null; platform: string | null }>(sql`
      SELECT
        (SELECT version FROM tenant.catalogue_state WHERE tenant_id = ${tenantId}) AS shop,
        (SELECT version FROM control.platform_catalogue_state WHERE id = 1) AS platform`);
    const row = result.rows[0];
    return { shop: Number(row?.shop ?? 1), platform: Number(row?.platform ?? 1) };
  }

  async listProducts(
    tx: Transaction,
    tenantId: string,
    filter: PublicProductFilter,
  ): Promise<PublicProductRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const where: SQL[] = [sql`p.tenant_id = ${tenantId}`, sql`p.active`, sql`p.deleted_at IS NULL`];
    if (filter.inStock) where.push(sql`p.stock_state <> 'out'`);
    if (filter.categoryIds !== null) {
      const ids = filter.categoryIds.length > 0 ? filter.categoryIds : [null];
      where.push(sql`EXISTS (
        SELECT 1 FROM tenant.product_categories pc
        WHERE pc.tenant_id = p.tenant_id AND pc.product_id = p.id
          AND pc.category_id IN (${sql.join(
            ids.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}))`);
    }
    let score = sql`0::float8`;
    if (filter.search !== null) {
      const match = await this.matchOf(tx, where, filter.search);
      where.push(match.condition);
      score = match.score;
    }
    const { keys, descending } = this.orderOf(filter.sort, score);
    const columns = keys.map(
      (key, index) => sql`${key.expression} AS ${sql.raw(`k${String(index)}`)}`,
    );
    const names = keys.map((_, index) => sql.raw(`s.k${String(index)}`));
    const conditions: SQL[] = [];
    if (filter.after !== null) {
      const after = filter.after;
      const values = keys.map((key, index) => sql`${after[index] ?? null}::${key.type}`);
      conditions.push(
        sql`(${sql.join(names, sql`, `)}) ${descending ? sql`<` : sql`>`} (${sql.join(values, sql`, `)})`,
      );
    }
    const direction = descending ? sql`DESC` : sql`ASC`;
    const result = await tx.execute<{
      id: string;
      slug: string;
      name: string;
      min_price: string | null;
      max_price: string | null;
      stock_state: StockState;
      created_at: string;
      position: string[];
    }>(sql`
      SELECT s.id, s.slug, s.name, s.min_price, s.max_price, s.stock_state,
        to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
        ARRAY[${sql.join(
          names.map((name) => sql`${name}::text`),
          sql`, `,
        )}] AS position
      FROM (
        SELECT p.id, p.slug, p.name, p.min_price, p.max_price, p.stock_state, p.created_at,
          ${sql.join(columns, sql`, `)}
        FROM tenant.products p
        WHERE ${sql.join(where, sql` AND `)}
      ) s
      ${conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``}
      ORDER BY ${sql.join(
        names.map((name) => sql`${name} ${direction}`),
        sql`, `,
      )}
      LIMIT ${filter.limit}`);
    return result.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      minPrice: row.min_price,
      maxPrice: row.max_price,
      stockState: row.stock_state,
      createdAt: row.created_at,
      position: row.position,
    }));
  }

  /**
   * ATR-18, Slice 12b: the swatches of these products' cards -- per product, the values of its first splitting attribute
   * (in the product's attribute order) that a variant on sale uses and that have a colour or a picture, in that
   * attribute's order.
   */
  async listSwatches(
    tx: Transaction,
    tenantId: string,
    productIds: readonly string[],
  ): Promise<PublicSwatchRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (productIds.length === 0) return [];
    const result = await tx.execute<{
      product_id: string;
      option_id: string;
      value: string;
      swatch_color: string | null;
      swatch_image_id: string | null;
    }>(sql`
      WITH used AS (
        SELECT DISTINCT vav.product_id, vav.attribute_id, o.id AS option_id, o.value, o.swatch_color,
          o.swatch_image_id, o.sort_order, pa.sort_order AS attribute_order
        FROM tenant.variant_attribute_values vav
        JOIN tenant.product_variants v ON v.tenant_id = vav.tenant_id AND v.id = vav.variant_id
          AND v.active AND v.deleted_at IS NULL AND NOT v.is_stock_holder
        JOIN tenant.product_attributes pa ON pa.tenant_id = vav.tenant_id AND pa.product_id = vav.product_id
          AND pa.attribute_id = vav.attribute_id
        JOIN tenant.attribute_options o ON o.id = vav.option_id
        WHERE vav.tenant_id = ${tenantId}
          AND vav.product_id IN (${sql.join(
            productIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
          AND (o.swatch_color IS NOT NULL OR o.swatch_image_id IS NOT NULL)
      ),
      first AS (
        SELECT DISTINCT ON (product_id) product_id, attribute_id
        FROM used
        ORDER BY product_id, attribute_order, attribute_id
      )
      SELECT u.product_id, u.option_id, u.value, u.swatch_color, u.swatch_image_id
      FROM used u
      JOIN first f ON f.product_id = u.product_id AND f.attribute_id = u.attribute_id
      ORDER BY u.product_id, u.sort_order, u.value, u.option_id`);
    return result.rows.map((row) => ({
      productId: row.product_id,
      optionId: row.option_id,
      value: row.value,
      swatchColor: row.swatch_color,
      swatchImageId: row.swatch_image_id,
    }));
  }

  /**
   * PRD-03, Slice 12b: each of the shop's categories with the number of active products in it or any category under it
   * -- the same products its list shows (`listProducts` with that category's scope), a hidden subcategory's included.
   * A category holding none is left out.
   */
  async countCategoryProducts(tx: Transaction, tenantId: string): Promise<CategoryProductCount[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{ category_id: string; products: number }>(sql`
      WITH RECURSIVE scope (root, id) AS (
        SELECT c.id, c.id FROM tenant.categories c WHERE c.tenant_id = ${tenantId}
        UNION ALL
        SELECT s.root, c.id FROM tenant.categories c
        JOIN scope s ON c.parent_id = s.id
        WHERE c.tenant_id = ${tenantId}
      )
      SELECT s.root AS category_id, count(DISTINCT pc.product_id)::int AS products
      FROM scope s
      JOIN tenant.product_categories pc ON pc.tenant_id = ${tenantId} AND pc.category_id = s.id
      JOIN tenant.products p ON p.tenant_id = pc.tenant_id AND p.id = pc.product_id
        AND p.active AND p.deleted_at IS NULL
      GROUP BY s.root`);
    return result.rows.map((row) => ({ categoryId: row.category_id, products: row.products }));
  }

  /**
   * CCH-12: what a search matches, and how well. Its words, each as a whole word or the start of one, in the name or
   * the description, the name counting more; only when nothing matches that way (a slip of the finger, a piece from
   * the middle of a word) the name's three-letter pieces, by how alike its closest word is. Matching words first keeps
   * a broad search cheap: similarity is worked out only for the few products a typo leaves.
   */
  private async matchOf(
    tx: Transaction,
    where: SQL[],
    search: string,
  ): Promise<{ condition: SQL; score: SQL }> {
    const words = prefixQuery(search);
    if (words !== '') {
      const query = sql`to_tsquery('simple', ${words})`;
      const condition = sql`p.search_vector @@ ${query}`;
      const found = await tx.execute<{ any: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1 FROM tenant.products p WHERE ${sql.join([...where, condition], sql` AND `)}
        ) AS any`);
      if (found.rows[0]?.any === true) {
        return { condition, score: sql`ts_rank(p.search_vector, ${query})::float8` };
      }
    }
    await tx.execute(
      sql`SELECT set_config('pg_trgm.word_similarity_threshold', ${WORD_SIMILARITY}, true)`,
    );
    return {
      condition: sql`(p.name ILIKE ${`%${escapeLike(search)}%`} OR ${search} <% p.name)`,
      score: sql`word_similarity(${search}, p.name)::float8`,
    };
  }

  /** FED-01: every variant on sale of every active product, newest product first, each product's variants in order. */
  async listFeedVariants(tx: Transaction, tenantId: string): Promise<FeedVariantRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{
      product_id: string;
      slug: string;
      name: string;
      description: string | null;
      item_condition: ItemCondition;
      variant_id: string;
      price: string;
      stock_state: StockState;
    }>(sql`
      SELECT p.id AS product_id, p.slug, p.name, p.description, p.item_condition, v.id AS variant_id,
        coalesce(v.price, p.base_price)::text AS price, v.stock_state
      FROM tenant.products p
      JOIN tenant.product_variants v ON v.tenant_id = p.tenant_id AND v.product_id = p.id
      WHERE p.tenant_id = ${tenantId} AND p.active AND p.deleted_at IS NULL
        AND v.active AND v.deleted_at IS NULL AND NOT v.is_stock_holder
      ORDER BY p.created_at DESC, p.id, v.created_at, v.id`);
    return result.rows.map((row) => ({
      productId: row.product_id,
      productSlug: row.slug,
      name: row.name,
      description: row.description,
      condition: row.item_condition,
      variantId: row.variant_id,
      price: row.price,
      stockState: row.stock_state,
    }));
  }

  /** FED-02: the ready photos of every active product, each product's in the order shown. */
  async listFeedImages(tx: Transaction, tenantId: string): Promise<FeedImageRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{ product_id: string; media_id: string; hash: string }>(sql`
      SELECT pi.product_id, m.id AS media_id, m.hash
      FROM tenant.product_images pi
      JOIN tenant.media m ON m.tenant_id = pi.tenant_id AND m.id = pi.media_id AND m.status = 'ready'
      JOIN tenant.products p ON p.tenant_id = pi.tenant_id AND p.id = pi.product_id
        AND p.active AND p.deleted_at IS NULL
      WHERE pi.tenant_id = ${tenantId}
      ORDER BY pi.product_id, pi.sort_order`);
    return result.rows.map((row) => ({
      productId: row.product_id,
      mediaId: row.media_id,
      hash: row.hash,
    }));
  }

  /**
   * FED-02: the values of the attributes with these names (lower case), the platform's or the shop's own -- a
   * product's own, and each variant's.
   */
  async listFeedAttributes(
    tx: Transaction,
    tenantId: string,
    names: readonly string[],
  ): Promise<FeedAttributeRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const wanted = sql`ARRAY[${sql.join(
      names.map((name) => sql`${name}`),
      sql`, `,
    )}]::text[]`;
    const result = await tx.execute<{
      product_id: string;
      variant_id: string | null;
      name: string;
      value: string;
    }>(sql`
      SELECT pav.product_id, NULL::uuid AS variant_id, lower(a.name) AS name,
        coalesce(o.value, pav.text_value) AS value, coalesce(o.sort_order, 0) AS position
      FROM tenant.product_attribute_values pav
      JOIN tenant.attributes a ON a.id = pav.attribute_id
      LEFT JOIN tenant.attribute_options o ON o.id = pav.option_id
      WHERE pav.tenant_id = ${tenantId} AND lower(a.name) = ANY(${wanted})
        AND coalesce(o.value, pav.text_value) IS NOT NULL
      UNION ALL
      SELECT vav.product_id, vav.variant_id, lower(a.name), o.value, o.sort_order
      FROM tenant.variant_attribute_values vav
      JOIN tenant.attributes a ON a.id = vav.attribute_id
      JOIN tenant.attribute_options o ON o.id = vav.option_id
      WHERE vav.tenant_id = ${tenantId} AND lower(a.name) = ANY(${wanted})
      ORDER BY 1, 2 NULLS FIRST, 3, 5, 4`);
    return result.rows.map((row) => ({
      productId: row.product_id,
      variantId: row.variant_id,
      name: row.name,
      value: row.value,
    }));
  }

  /** LND-04: the active product a link names, by its current slug or an old one; with its current slug. */
  async findBySlug(
    tx: Transaction,
    tenantId: string,
    slug: string,
  ): Promise<{ productId: string; slug: string } | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{ id: string; slug: string }>(sql`
      SELECT p.id, p.slug FROM tenant.products p
      WHERE p.tenant_id = ${tenantId} AND p.slug = ${slug} AND p.active AND p.deleted_at IS NULL
      UNION ALL
      SELECT p.id, p.slug FROM tenant.product_slug_redirects r
      JOIN tenant.products p ON p.tenant_id = r.tenant_id AND p.id = r.product_id
      WHERE r.tenant_id = ${tenantId} AND r.old_slug = ${slug} AND p.active AND p.deleted_at IS NULL
      LIMIT 1`);
    const row = result.rows[0];
    return row ? { productId: row.id, slug: row.slug } : null;
  }

  /**
   * Each order's keys, in one direction, so the indexes (migration 0068) serve them as one range: featured is the
   * shop's position then newest (the position negated), price is the lowest price a product sells at.
   */
  private orderOf(sort: PublicProductSort, score: SQL): { keys: OrderKey[]; descending: boolean } {
    const id: OrderKey = { expression: sql`p.id`, type: sql`uuid` };
    const created: OrderKey = { expression: sql`p.created_at`, type: sql`timestamptz` };
    const price: OrderKey = { expression: sql`p.min_price`, type: sql`numeric` };
    switch (sort) {
      case PublicProductSort.Featured:
        return {
          keys: [{ expression: sql`(-p.sort_order)`, type: sql`integer` }, created, id],
          descending: true,
        };
      case PublicProductSort.Newest:
        return { keys: [created, id], descending: true };
      case PublicProductSort.PriceLow:
        return { keys: [price, id], descending: false };
      case PublicProductSort.PriceHigh:
        return { keys: [price, id], descending: true };
      case PublicProductSort.Relevance:
        return { keys: [{ expression: score, type: sql`float8` }, id], descending: true };
    }
  }
}
