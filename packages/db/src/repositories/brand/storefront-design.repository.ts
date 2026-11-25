import { eq, sql } from 'drizzle-orm';
import type { StockState } from '@lytronix/validators';
import {
  storefrontCardPositions,
  storefrontDesigns,
  storefrontProductCards,
  tenants,
  type SelectStorefrontDesign,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';
import {
  DESIGN_CARD,
  PRODUCT_CARD,
  SHOWN_CARD,
  candidateCards,
  designCards,
  placedCard,
} from '../catalogue/public-catalogue.repository';

/** DC-6: one card of the shop as the Product order screen lists it, hidden and sold-out ones too. */
export interface StorefrontCardRow {
  productId: string;
  /** The design this card shows; null for a product's own card. */
  designId: string | null;
  /** The design's name and number, for the seller's eyes (shoppers see only its photo). */
  designName: string | null;
  designNumber: number | null;
  name: string;
  /** Its lowest price: the design's own for a design's card. */
  price: string | null;
  stockState: StockState;
  /** False for a hidden product: not in the shop, but kept in its place. */
  active: boolean;
  /** Its picture: the design's cover, else the product's first photo. */
  coverMediaId: string | null;
  createdAt: Date;
  /** Whether the seller has placed it; one not placed comes first, newest first (DC-7). */
  placed: boolean;
  /** DC-8: whether it shows in the shop's lists under its product's way (design cards on). */
  shown: boolean;
  /** DC-8: its product's way, for a product with designs to spread; null otherwise. */
  mode: string | null;
}

/** DC-6: a card the seller places -- a product's own, or one of its designs. */
export interface StorefrontCardKey {
  productId: string;
  designId: string | null;
}

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

/** SB-9, SB-32: what the shop's pages say of its products, read together. */
export interface StorefrontFigures {
  sale: StorefrontSaleSummary;
  /** SB-32: its active products, every one its lists show ("সব প্রোডাক্ট · Nটি"). */
  productCount: number;
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

  /**
   * SB-30 (the owner, 2026-11-24): the shop's first `limit` categories in its own order -- top-level ones first, each
   * level by its place, then name, as the Categories page lists them -- that shoppers see (it and every category above
   * it visible) and that hold an active product, in them or any category under them (the same products the category's
   * own list shows). Amended 2026-11-25 (the owner: "the storefront must be populated even if there is no stock"): a
   * product counts whatever its stock; its row lists the sold-out ones last. SB-32 (2026-11-26): a category counts only
   * when it holds `fill` products or more, enough to fill its row.
   */
  async firstFilledCategories(
    tx: Transaction,
    tenantId: string,
    limit: number,
    fill: number,
  ): Promise<string[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{ id: string }>(sql`
      WITH RECURSIVE tree (id, depth, path, shown) AS (
        SELECT c.id, c.depth, ARRAY[c.sort_order], c.visible
        FROM tenant.categories c
        WHERE c.tenant_id = ${tenantId} AND c.parent_id IS NULL
        UNION ALL
        SELECT c.id, c.depth, tree.path || c.sort_order, tree.shown AND c.visible
        FROM tenant.categories c
        JOIN tree ON c.parent_id = tree.id
        WHERE c.tenant_id = ${tenantId}
      ), scope (root, id) AS (
        SELECT c.id, c.id FROM tenant.categories c WHERE c.tenant_id = ${tenantId}
        UNION ALL
        SELECT scope.root, c.id FROM tenant.categories c
        JOIN scope ON c.parent_id = scope.id
        WHERE c.tenant_id = ${tenantId}
      )
      SELECT tree.id
      FROM tree
      JOIN tenant.categories c ON c.tenant_id = ${tenantId} AND c.id = tree.id
      WHERE tree.shown AND (
        SELECT count(DISTINCT p.id) FROM scope
        JOIN tenant.product_categories pc ON pc.tenant_id = ${tenantId} AND pc.category_id = scope.id
        JOIN tenant.products p ON p.tenant_id = pc.tenant_id AND p.id = pc.product_id
        WHERE scope.root = tree.id AND p.active AND p.deleted_at IS NULL) >= ${fill}
      ORDER BY tree.depth, tree.path, lower(c.name), c.id
      LIMIT ${limit}`);
    return result.rows.map((row) => row.id);
  }

  /**
   * SB-9: how many active products are on sale, and the biggest saving among them; SB-32: how many active products
   * there are. One read of the shop's products.
   */
  async figures(tx: Transaction, tenantId: string): Promise<StorefrontFigures> {
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{ products: number; best: number | null; listed: number }>(sql`
      SELECT count(*) FILTER (WHERE p.best_discount > 0)::int AS products,
        max(p.best_discount) FILTER (WHERE p.best_discount > 0)::int AS best,
        count(*)::int AS listed
      FROM tenant.products p
      WHERE p.tenant_id = ${tenantId} AND p.active AND p.deleted_at IS NULL`);
    const row = result.rows[0];
    return {
      sale: { products: row?.products ?? 0, bestDiscount: row?.best ?? 0 },
      productCount: row?.listed ?? 0,
    };
  }

  /** DC-2: whether each design of a product is its own card; on for a shop that has never turned it off. */
  async designCards(tx: Transaction, tenantId: string): Promise<boolean> {
    return (await this.get(tx, tenantId))?.designCards ?? true;
  }

  /** DC-2: design cards on or off, at once (not part of the draft). */
  async setDesignCards(tx: Transaction, tenantId: string, on: boolean): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .insert(storefrontDesigns)
      .values({ tenantId, designCards: on })
      .onConflictDoUpdate({
        target: storefrontDesigns.tenantId,
        set: { designCards: on, updatedAt: sql`now()` },
      });
  }

  /**
   * DC-6, DC-7: every card of the shop's products not archived -- a design's own for a product with two or more when
   * `designs`, else the product's -- in the order its default lists show them (the public list's Featured order):
   * the ones not placed first, newest first, then the placed ones by their place.
   */
  async cards(tx: Transaction, tenantId: string, designs: boolean): Promise<StorefrontCardRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const card = designs ? DESIGN_CARD : PRODUCT_CARD;
    const result = await tx.execute<{
      product_id: string;
      design_id: string | null;
      design_name: string | null;
      design_number: number;
      name: string;
      price: string | null;
      stock_state: StockState;
      active: boolean;
      cover: string | null;
      created_at: string;
      placed: boolean;
      shown: boolean;
      mode: string | null;
    }>(sql`
      ${designs ? designCards(tenantId) : sql``}
      SELECT p.id AS product_id, ${card.design} AS design_id, ao.value AS design_name,
        (${card.number})::integer AS design_number, p.name, (${card.price})::text AS price,
        ${card.stock} AS stock_state, p.active,
        coalesce(${card.cover}, (SELECT pi.media_id FROM tenant.product_images pi
          WHERE pi.tenant_id = p.tenant_id AND pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1)) AS cover,
        p.created_at, placed.position IS NOT NULL AS placed,
        ${designs ? SHOWN_CARD : sql`true`} AS shown,
        ${
          designs
            ? sql`CASE WHEN EXISTS (SELECT 1 FROM cards cx WHERE cx.product_id = p.id)
                THEN coalesce(m.mode, 'designs') END`
            : sql`NULL::text`
        } AS mode
      FROM tenant.products p
      ${designs ? candidateCards() : sql``}
      LEFT JOIN tenant.attribute_options ao ON ao.tenant_id = p.tenant_id AND ao.id = ${card.design}
      ${placedCard(card)}
      WHERE p.tenant_id = ${tenantId} AND p.deleted_at IS NULL
      ORDER BY (placed.position IS NULL)::integer DESC, (-coalesce(placed.position, 0)) DESC, p.created_at DESC,
        p.id DESC, (-${card.number})::integer DESC`);
    return result.rows.map((row) => ({
      productId: row.product_id,
      designId: row.design_id,
      designName: row.design_name,
      designNumber: row.design_id === null ? null : row.design_number,
      name: row.name,
      price: row.price,
      stockState: row.stock_state,
      active: row.active,
      coverMediaId: row.cover,
      createdAt: new Date(row.created_at),
      placed: row.placed,
      shown: row.shown,
      mode: row.mode,
    }));
  }

  /** DC-8: each product's way, whole -- the default (a card per design) kept as no row. */
  async replaceCardModes(
    tx: Transaction,
    tenantId: string,
    modes: readonly { productId: string; mode: string }[],
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    for (const each of modes) {
      await tx
        .delete(storefrontProductCards)
        .where(
          sql`${storefrontProductCards.tenantId} = ${tenantId} AND ${storefrontProductCards.productId} = ${each.productId}`,
        );
      if (each.mode !== 'designs') {
        await tx
          .insert(storefrontProductCards)
          .values({ tenantId, productId: each.productId, mode: each.mode });
      }
    }
  }

  /** DC-6: the seller's order, whole -- each card's place is its index; any card left out is no longer placed. */
  async replaceCardPositions(
    tx: Transaction,
    tenantId: string,
    cards: readonly StorefrontCardKey[],
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(storefrontCardPositions).where(eq(storefrontCardPositions.tenantId, tenantId));
    if (cards.length === 0) return;
    await tx.insert(storefrontCardPositions).values(
      cards.map((card, position) => ({
        tenantId,
        productId: card.productId,
        designOptionId: card.designId,
        position,
      })),
    );
  }

  /** LIF-19: removes the shop's design at day 60. */
  async deleteForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(storefrontCardPositions).where(eq(storefrontCardPositions.tenantId, tenantId));
    await tx.delete(storefrontProductCards).where(eq(storefrontProductCards.tenantId, tenantId));
    await tx.delete(storefrontDesigns).where(eq(storefrontDesigns.tenantId, tenantId));
  }
}
