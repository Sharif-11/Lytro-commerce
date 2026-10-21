import { sql, type SQL } from 'drizzle-orm';
import { PublicProductSort, type StockState } from '@lytronix/validators';
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
  /** This row's place in the order asked for, as text, so the next page starts exactly after it. */
  position: string[];
}

/** PRD-09, CCH-11, CCH-12: which of the shop's public products, in what order, from where. */
export interface PublicProductFilter {
  /** A category and every category under it; null is the whole shop. */
  categoryIds: string[] | null;
  /** The words searched for; null lists without searching. */
  search: string | null;
  sort: PublicProductSort;
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
// a time, a product by its link, current or old. Every product query reads only the columns kept on the product row,
// so a list never joins variants, and pages by position, never by offset. Each method sets the shop's tenant context
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
      position: string[];
    }>(sql`
      SELECT s.id, s.slug, s.name, s.min_price, s.max_price, s.stock_state,
        ARRAY[${sql.join(
          names.map((name) => sql`${name}::text`),
          sql`, `,
        )}] AS position
      FROM (
        SELECT p.id, p.slug, p.name, p.min_price, p.max_price, p.stock_state, ${sql.join(columns, sql`, `)}
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
      position: row.position,
    }));
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
