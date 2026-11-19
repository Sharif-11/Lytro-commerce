import { sql, type SQL } from 'drizzle-orm';
import {
  MEASURED_STOCK_UNITS,
  ProductKind,
  PublicProductSort,
  StockState,
  StockTracking,
  type ItemCondition,
} from '@lytronix/validators';
import type { Transaction, TransactionRunner } from '../../transactions';
import { escapeLike } from '../like';
import { counted } from '../orders/sales.repository';

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
  /** SB-21: the regular price struck through beside the lowest price; null when that is not on sale. */
  minRegularPrice: string | null;
  /** SB-10: the biggest saving of any variant, in whole percent; 0 when nothing is on sale. */
  bestDiscount: number;
  stockState: StockState;
  /** When it was added, as ISO text: a storefront marks a recent one "New" (Slice 12b). */
  createdAt: string;
  /** This row's place in the order asked for, as text, so the next page starts exactly after it. */
  position: string[];
  /**
   * STOREFRONT-BUILDER-PLAN DC-1, DC-5: the design this card shows, for a product with two or more designs when the
   * list spreads them; null for a product's own card. Its prices, saving and stock above are then the design's own.
   */
  designId: string | null;
  /** DC-5: the design's cover -- its first photo -- for a design's card; null otherwise. */
  designCover: string | null;
  /** DC-5, SB-10: "Only N left" for a design's card, by the product's rules; null otherwise or when not low. */
  designLeft: number | null;
}

/** SB-10: what a storefront card's badges say about one product, beyond its own row. */
export interface PublicCardFacts {
  productId: string;
  /** "Only N left": its whole units left to sell while under its low-stock level; null otherwise. */
  left: number | null;
  /** "Ordered N times": the delivered orders that held it, ever (Slice 4.7's counted orders). */
  ordered: number;
  /** "Best seller": among the shop's `top` most sold over the window asked. */
  bestSeller: boolean;
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
  /** ATR-19 (PD-23): its design, for a design product's variant; null otherwise. */
  designId: string | null;
}

/** FED-02: one of an active product's ready photos, in the order shown. */
export interface FeedImageRow {
  productId: string;
  mediaId: string;
  hash: string;
  /** ATR-19 (PD-23): the design it shows, or null for a plain photo. */
  designId: string | null;
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
  /** SB-9: only products on sale (a saving of at least 1%, SB-21). */
  onSale: boolean;
  /** SB-9: only these products (a row of hand-picked ones); null for any. */
  ids: readonly string[] | null;
  /** DC-1: each design of a product with two or more its own card (the storefront asks when the shop has it on). */
  designs: boolean;
  /**
   * OFFERS-PLAN OF-8, OF-9: only one offer's cards -- every card of a product it holds whole, a design's own card for a
   * design it holds, and a product's own card for either; null for any.
   */
  offerItems?: readonly { productId: string; designOptionId: string | null }[] | null;
  /** SB-9: where the best-selling order's window starts (its units are counted from here); unused by other orders. */
  soldSince: Date;
  /** The last row's position on the page before; null starts at the beginning. */
  after: string[] | null;
  limit: number;
}

// SB-9, SB-10: the open ends of the windows sales are counted over.
const EVER = new Date(0);
const FAR_FUTURE = new Date('9999-12-31T00:00:00Z');

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
/** DC-1, DC-5: the figures a card shows -- a design's own for a design's card (`designCards`), else the product's. */
export interface CardFigures {
  design: SQL;
  /** The design's number (its place among the product's designs); 0 for a product's own card. */
  number: SQL;
  price: SQL;
  high: SQL;
  regular: SQL;
  discount: SQL;
  stock: SQL;
  cover: SQL;
  /** SB-9: the units sold over the best-selling window (that order's joins only). */
  units: SQL;
}

export const PRODUCT_CARD: CardFigures = {
  design: sql`NULL::uuid`,
  number: sql`0`,
  price: sql`p.min_price`,
  high: sql`p.max_price`,
  regular: sql`p.min_regular_price`,
  discount: sql`p.best_discount`,
  stock: sql`p.stock_state`,
  cover: sql`NULL::uuid`,
  units: sql`coalesce(sold.units, 0)`,
};

export const DESIGN_CARD: CardFigures = {
  design: sql`c.design_id`,
  number: sql`coalesce(c.design_number, 0)`,
  price: sql`coalesce(c.low, p.min_price)`,
  high: sql`coalesce(c.high, p.max_price)`,
  regular: sql`CASE WHEN c.design_id IS NULL THEN p.min_regular_price ELSE c.regular END`,
  discount: sql`coalesce(c.discount, p.best_discount)`,
  stock: sql`coalesce(c.stock, p.stock_state)`,
  cover: sql`c.cover`,
  units: sql`CASE WHEN c.design_id IS NULL THEN coalesce(sold.units, 0) ELSE coalesce(sold_design.units, 0) END`,
};

/**
 * DC-1, DC-5: each design of a product with two or more designs on sale, as its own card -- worked out from the
 * design's live variants as a product's own figures are (`refreshPriceRange`, the stock state of 0068): its lowest and
 * highest price, the regular price struck through beside the lowest, its biggest saving, its best variant's stock
 * state and the units it has, and its cover (its first photo). A product with one design or none has no row here and
 * keeps its own card.
 */
export function designCards(tenantId: string): SQL {
  return sql`WITH dv AS (
      SELECT v.product_id, va.option_id AS design_id, o.sort_order::integer AS design_number,
        coalesce(v.price, pp.base_price) AS price,
        coalesce(v.regular_price, pp.regular_price) AS regular,
        v.stock_state,
        coalesce((SELECT sum(sl.available) FROM tenant.stock_levels sl
          WHERE sl.tenant_id = v.tenant_id AND sl.variant_id = v.id), 0) AS available
      FROM tenant.product_variants v
      JOIN tenant.products pp ON pp.tenant_id = v.tenant_id AND pp.id = v.product_id
      JOIN tenant.variant_attribute_values va ON va.tenant_id = v.tenant_id AND va.variant_id = v.id
      JOIN tenant.attribute_options o ON o.tenant_id = va.tenant_id AND o.id = va.option_id
        AND o.product_id = v.product_id AND o.retired_at IS NULL
      WHERE v.tenant_id = ${tenantId} AND v.active AND v.deleted_at IS NULL AND NOT v.is_stock_holder
    ), de AS (
      SELECT dv.*,
        CASE WHEN dv.regular > dv.price THEN floor((dv.regular - dv.price) * 100 / dv.regular) ELSE 0 END AS discount
      FROM dv
    ), dc AS (
      SELECT de.product_id, de.design_id, de.design_number, min(de.price) AS low, max(de.price) AS high,
        coalesce(max(de.discount), 0)::integer AS discount,
        (CASE
          WHEN bool_or(de.stock_state = 'in') THEN 'in'
          WHEN bool_or(de.stock_state = 'low') THEN 'low'
          ELSE 'out'
        END)::tenant.stock_state AS stock,
        sum(de.available) AS available
      FROM de
      GROUP BY de.product_id, de.design_id, de.design_number
    ), cards AS (
      SELECT dc.*,
        (SELECT min(de.regular) FROM de
          WHERE de.product_id = dc.product_id AND de.design_id = dc.design_id AND de.price = dc.low
            AND de.discount >= 1) AS regular,
        (SELECT pi.media_id FROM tenant.product_images pi
          WHERE pi.tenant_id = ${tenantId} AND pi.product_id = dc.product_id AND pi.design_option_id = dc.design_id
          ORDER BY pi.sort_order LIMIT 1) AS cover
      FROM dc
      WHERE dc.product_id IN (SELECT dc2.product_id FROM dc dc2 GROUP BY dc2.product_id HAVING count(*) >= 2)
    )`;
}

/**
 * DC-6, DC-7: a card's place in the seller's order, as `placed.position` -- its own row; for a design's card with none,
 * its product's (placed while design cards were off); for a product's own card with none, its first design's. Null when
 * the seller has not placed it.
 */
/**
 * DC-8: a product's cards while design cards are on, as `c` -- each of its designs' (from `designCards`) and its own
 * (a row of nulls, so the product's figures show) -- with `m.mode`, its way; `shownCard` says which of them show.
 */
export function candidateCards(): SQL {
  return sql`LEFT JOIN tenant.storefront_product_cards m ON m.tenant_id = p.tenant_id AND m.product_id = p.id
    LEFT JOIN LATERAL (
      SELECT cd.product_id, cd.design_id, cd.design_number, cd.low, cd.high, cd.discount, cd.stock, cd.available,
        cd.regular, cd.cover
      FROM cards cd WHERE cd.product_id = p.id
      UNION ALL
      SELECT p.id, NULL::uuid, NULL::integer, NULL::numeric, NULL::numeric, NULL::integer, NULL::tenant.stock_state,
        NULL::numeric, NULL::numeric, NULL::uuid
    ) c ON true`;
}

/**
 * DC-8: whether a candidate card shows -- a design's unless its product is set to one card; a product's own when it
 * has no designs to spread, or is set to one card or both.
 */
export const SHOWN_CARD: SQL = sql`CASE
    WHEN c.design_id IS NULL THEN coalesce(m.mode, 'designs') <> 'designs'
      OR NOT EXISTS (SELECT 1 FROM cards cx WHERE cx.product_id = p.id)
    ELSE coalesce(m.mode, 'designs') <> 'compact'
  END`;

export function placedCard(card: CardFigures): SQL {
  return sql`LEFT JOIN LATERAL (
      SELECT cp.position FROM tenant.storefront_card_positions cp
      WHERE cp.tenant_id = p.tenant_id AND cp.product_id = p.id
        AND (${card.design} IS NULL OR cp.design_option_id IS NULL OR cp.design_option_id = ${card.design})
      ORDER BY (cp.design_option_id IS NOT DISTINCT FROM ${card.design}) DESC, cp.position
      LIMIT 1
    ) placed ON true`;
}

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
    if (filter.ids !== null) {
      const ids = filter.ids.length > 0 ? filter.ids : [null];
      where.push(
        sql`p.id IN (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      );
    }
    if (filter.offerItems !== undefined && filter.offerItems !== null) {
      const items = filter.offerItems;
      const design = filter.designs ? sql`c.design_id` : sql`NULL::uuid`;
      where.push(
        items.length === 0
          ? sql`false`
          : sql`EXISTS (
            SELECT 1 FROM (VALUES ${sql.join(
              items.map((item) => sql`(${item.productId}::uuid, ${item.designOptionId}::uuid)`),
              sql`, `,
            )}) AS oi(product_id, design_id)
            WHERE oi.product_id = p.id
              AND (oi.design_id IS NULL OR ${design} IS NULL OR oi.design_id = ${design}))`,
      );
    }
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
    // DC-1, DC-5: what a card shows -- a design's own figures for a design's card, else the product's.
    const card = filter.designs ? DESIGN_CARD : PRODUCT_CARD;
    if (filter.designs) where.push(SHOWN_CARD);
    if (filter.inStock) where.push(sql`${card.stock} <> 'out'`);
    if (filter.onSale) where.push(sql`${card.discount} > 0`);
    const { keys, descending } = this.orderOf(filter.sort, score, card);
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
    // SB-9: the units each product (and, for a design's card, each design) sold over the window, for the
    // best-selling order only.
    const selling = filter.sort === PublicProductSort.BestSelling;
    const sold = selling
      ? sql`LEFT JOIN (
          SELECT l.product_id, sum(l.quantity - l.returned_quantity) AS units
          FROM tenant.orders o
          JOIN tenant.order_lines l ON l.tenant_id = o.tenant_id AND l.order_id = o.id
          WHERE ${counted(tenantId, { from: filter.soldSince, to: FAR_FUTURE })}
            AND l.returned_quantity < l.quantity AND l.product_id IS NOT NULL
          GROUP BY l.product_id
        ) sold ON sold.product_id = p.id`
      : sql``;
    const soldDesign =
      selling && filter.designs
        ? sql`LEFT JOIN (
          SELECT l.product_id, va.option_id AS design_id, sum(l.quantity - l.returned_quantity) AS units
          FROM tenant.orders o
          JOIN tenant.order_lines l ON l.tenant_id = o.tenant_id AND l.order_id = o.id
          JOIN tenant.variant_attribute_values va ON va.tenant_id = l.tenant_id AND va.variant_id = l.variant_id
          JOIN tenant.attribute_options ao ON ao.tenant_id = va.tenant_id AND ao.id = va.option_id
            AND ao.product_id = l.product_id
          WHERE ${counted(tenantId, { from: filter.soldSince, to: FAR_FUTURE })}
            AND l.returned_quantity < l.quantity AND l.product_id IS NOT NULL
          GROUP BY l.product_id, va.option_id
        ) sold_design ON sold_design.product_id = p.id AND sold_design.design_id = c.design_id`
        : sql``;
    const measured = sql.join(
      MEASURED_STOCK_UNITS.map((unit) => sql`${unit}`),
      sql`, `,
    );
    const result = await tx.execute<{
      id: string;
      slug: string;
      name: string;
      min_price: string | null;
      max_price: string | null;
      min_regular_price: string | null;
      best_discount: number;
      stock_state: StockState;
      created_at: string;
      position: string[];
      design_id: string | null;
      design_cover: string | null;
      design_left: string | null;
    }>(sql`
      ${filter.designs ? designCards(tenantId) : sql``}
      SELECT s.id, s.slug, s.name, s.min_price, s.max_price, s.min_regular_price, s.best_discount, s.stock_state,
        to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
        s.design_id, s.design_cover, s.design_left,
        ARRAY[${sql.join(
          names.map((name) => sql`${name}::text`),
          sql`, `,
        )}] AS position
      FROM (
        SELECT p.id, p.slug, p.name, ${card.price} AS min_price, ${card.high} AS max_price,
          ${card.regular} AS min_regular_price, ${card.discount} AS best_discount, ${card.stock} AS stock_state,
          p.created_at, ${card.design} AS design_id, ${card.cover} AS design_cover,
          ${
            filter.designs
              ? sql`CASE WHEN c.stock = ${StockState.Low} AND p.stock_tracking = ${StockTracking.Tracked}
                    AND NOT p.shared_stock AND p.kind <> ${ProductKind.Combo} AND p.stock_unit NOT IN (${measured})
                  THEN floor(c.available) END`
              : sql`NULL::numeric`
          } AS design_left,
          ${sql.join(columns, sql`, `)}
        FROM tenant.products p
        ${filter.designs ? candidateCards() : sql``}
        ${placedCard(card)}
        ${sold}
        ${soldDesign}
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
      minRegularPrice: row.min_regular_price,
      bestDiscount: row.best_discount,
      stockState: row.stock_state,
      createdAt: row.created_at,
      position: row.position,
      designId: row.design_id,
      designCover: row.design_cover,
      designLeft: row.design_left === null ? null : Number(row.design_left),
    }));
  }

  /**
   * SB-10: what these products' cards say beyond their own rows, in one read for the page -- the units left of one
   * under its low-stock level (whole units of counted stock of its own; never a combo's, a shared stock's or a weighed
   * one's), the delivered orders that ever held it, and whether it is among the shop's `top` most sold since `since`.
   */
  async cardFacts(
    tx: Transaction,
    tenantId: string,
    productIds: readonly string[],
    since: Date,
    top: number,
  ): Promise<PublicCardFacts[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (productIds.length === 0) return [];
    const ids = sql.join(
      productIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );
    const measured = sql.join(
      MEASURED_STOCK_UNITS.map((unit) => sql`${unit}`),
      sql`, `,
    );
    const result = await tx.execute<{
      product_id: string;
      left: string | null;
      ordered: number;
      best_seller: boolean;
    }>(sql`
      WITH best AS (
        SELECT l.product_id
        FROM tenant.orders o
        JOIN tenant.order_lines l ON l.tenant_id = o.tenant_id AND l.order_id = o.id
        WHERE ${counted(tenantId, { from: since, to: FAR_FUTURE })}
          AND l.returned_quantity < l.quantity AND l.product_id IS NOT NULL
        GROUP BY l.product_id
        ORDER BY sum(l.quantity - l.returned_quantity) DESC, count(DISTINCT o.id) DESC, l.product_id
        LIMIT ${top}
      )
      SELECT p.id AS product_id,
        CASE WHEN p.stock_state = ${StockState.Low} AND p.stock_tracking = ${StockTracking.Tracked}
            AND NOT p.shared_stock AND p.kind <> ${ProductKind.Combo} AND p.stock_unit NOT IN (${measured})
          THEN (SELECT floor(sum(sl.available)) FROM tenant.product_variants v
            JOIN tenant.stock_levels sl ON sl.tenant_id = v.tenant_id AND sl.variant_id = v.id
            WHERE v.tenant_id = p.tenant_id AND v.product_id = p.id AND v.active AND v.deleted_at IS NULL
              AND NOT v.is_stock_holder)
        END AS left,
        (SELECT count(DISTINCT o.id)::int FROM tenant.order_lines l
          JOIN tenant.orders o ON o.tenant_id = l.tenant_id AND o.id = l.order_id
          WHERE l.tenant_id = p.tenant_id AND l.product_id = p.id AND l.returned_quantity < l.quantity
            AND ${counted(tenantId, { from: EVER, to: FAR_FUTURE })}) AS ordered,
        EXISTS (SELECT 1 FROM best b WHERE b.product_id = p.id) AS best_seller
      FROM tenant.products p
      WHERE p.tenant_id = ${tenantId} AND p.id IN (${ids})`);
    return result.rows.map((row) => ({
      productId: row.product_id,
      left: row.left === null ? null : Number(row.left),
      ordered: row.ordered,
      bestSeller: row.best_seller,
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
   * SB-9: each category's cover for a storefront that shows a category without a picture of its own -- the first photo
   * of the first active product in it or any category under it, in the shop's order (newest first within it). A
   * category holding none is left out.
   */
  async categoryCovers(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ categoryId: string; mediaId: string }[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{ category_id: string; media_id: string }>(sql`
      WITH RECURSIVE scope (root, id) AS (
        SELECT c.id, c.id FROM tenant.categories c WHERE c.tenant_id = ${tenantId}
        UNION ALL
        SELECT s.root, c.id FROM tenant.categories c
        JOIN scope s ON c.parent_id = s.id
        WHERE c.tenant_id = ${tenantId}
      )
      SELECT DISTINCT ON (s.root) s.root AS category_id, pi.media_id
      FROM scope s
      JOIN tenant.product_categories pc ON pc.tenant_id = ${tenantId} AND pc.category_id = s.id
      JOIN tenant.products p ON p.tenant_id = pc.tenant_id AND p.id = pc.product_id
        AND p.active AND p.deleted_at IS NULL
      JOIN tenant.product_images pi ON pi.tenant_id = p.tenant_id AND pi.product_id = p.id
      ORDER BY s.root, p.sort_order, p.created_at DESC, p.id, pi.sort_order`);
    return result.rows.map((row) => ({ categoryId: row.category_id, mediaId: row.media_id }));
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
      design_id: string | null;
    }>(sql`
      SELECT p.id AS product_id, p.slug, p.name, p.description, p.item_condition, v.id AS variant_id,
        coalesce(v.price, p.base_price)::text AS price, v.stock_state,
        (SELECT o.id FROM tenant.variant_attribute_values va
          JOIN tenant.attribute_options o ON o.id = va.option_id AND o.product_id = p.id
          WHERE va.tenant_id = v.tenant_id AND va.variant_id = v.id LIMIT 1) AS design_id
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
      designId: row.design_id,
    }));
  }

  /** FED-02: the ready photos of every active product, each product's in the order shown. */
  async listFeedImages(tx: Transaction, tenantId: string): Promise<FeedImageRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{
      product_id: string;
      media_id: string;
      hash: string;
      design_option_id: string | null;
    }>(sql`
      SELECT pi.product_id, m.id AS media_id, m.hash, pi.design_option_id
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
      designId: row.design_option_id,
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
   * Each order's keys, in one direction, each ending with the card's design so no two cards tie. Featured is the
   * seller's order (DC-6, DC-7): the cards they have not placed first, newest first, then the placed ones by their
   * place. Price is the lowest price a card sells at; discount and units are its own.
   */
  private orderOf(
    sort: PublicProductSort,
    score: SQL,
    card: CardFigures,
  ): { keys: OrderKey[]; descending: boolean } {
    const id: OrderKey = { expression: sql`p.id`, type: sql`uuid` };
    const created: OrderKey = { expression: sql`p.created_at`, type: sql`timestamptz` };
    const price: OrderKey = { expression: card.price, type: sql`numeric` };
    // A product's designs in their own order, whichever way the rest runs.
    const descending = sort !== PublicProductSort.PriceLow;
    const design: OrderKey = {
      expression: descending ? sql`(-${card.number})::integer` : sql`(${card.number})::integer`,
      type: sql`integer`,
    };
    switch (sort) {
      case PublicProductSort.Discount:
        return {
          keys: [
            { expression: sql`${card.discount}::integer`, type: sql`integer` },
            created,
            id,
            design,
          ],
          descending: true,
        };
      case PublicProductSort.BestSelling:
        return {
          keys: [
            { expression: sql`${card.units}::numeric`, type: sql`numeric` },
            created,
            id,
            design,
          ],
          descending: true,
        };
      case PublicProductSort.Featured:
        return {
          keys: [
            { expression: sql`(placed.position IS NULL)::integer`, type: sql`integer` },
            { expression: sql`(-coalesce(placed.position, 0))`, type: sql`integer` },
            created,
            id,
            design,
          ],
          descending: true,
        };
      case PublicProductSort.Newest:
        return { keys: [created, id, design], descending: true };
      case PublicProductSort.PriceLow:
        return { keys: [price, id, design], descending: false };
      case PublicProductSort.PriceHigh:
        return { keys: [price, id, design], descending: true };
      case PublicProductSort.Relevance:
        return { keys: [{ expression: score, type: sql`float8` }, id, design], descending: true };
    }
  }
}
