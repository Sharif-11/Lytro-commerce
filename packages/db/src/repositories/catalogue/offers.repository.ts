import { and, eq, sql, type SQL } from 'drizzle-orm';
import {
  offerItems,
  offerPrices,
  offers,
  type SelectOffer,
  type SelectOfferPrice,
} from '../../schema';
import { OfferState } from '@lytronix/validators';
import type { Transaction, TransactionRunner } from '../../transactions';

/** IDs already checked to be UUIDs, as one Postgres array. */
function uuids(ids: readonly string[]): SQL {
  return sql`${`{${ids.join(',')}}`}::uuid[]`;
}

/** OFFERS-PLAN: an offer as its list shows it, with how many products and designs it holds. */
export interface OfferListRow extends SelectOffer {
  products: number;
  designs: number;
}

/** OF-9: a product whole (`designOptionId` null) or one of its designs, in an offer. */
export interface OfferItemRow {
  productId: string;
  designOptionId: string | null;
}

/** OF-7, OF-16: an offer not ended that already holds a product or one of its designs. */
export interface OfferHolderRow {
  offerId: string;
  offerName: string;
  offerState: OfferState;
  productId: string;
  designOptionId: string | null;
}

/**
 * OF-6: one size (variant) an offer item covers, with what it sells at now: its own price and regular price (null when
 * it takes the product's) and the product's.
 */
export interface OfferSizeRow {
  variantId: string;
  productId: string;
  /** The size's design, one of its own product's options; null for a product without designs. */
  designOptionId: string | null;
  ownPrice: string | null;
  ownRegular: string | null;
  basePrice: string;
  productRegular: string | null;
}

/** OF-25: a product the picker lists, with its designs. */
export interface OfferPickRow {
  productId: string;
  name: string;
  minPrice: string | null;
  maxPrice: string | null;
  minRegularPrice: string | null;
  active: boolean;
  stockState: string;
  coverMediaId: string | null;
  isCombo: boolean;
}

/** OF-25: one design of a picked product, its lowest price and its cover. */
export interface OfferPickDesignRow {
  productId: string;
  designId: string;
  name: string;
  number: number;
  minPrice: string | null;
  coverMediaId: string | null;
}

/** A product as an offer's screens name it: its name, cover and whether it is still in the shop. */
export interface OfferProductRow {
  productId: string;
  name: string;
  coverMediaId: string | null;
  active: boolean;
  stockState: string;
}

/** A design as an offer's screens name it. */
export interface OfferDesignRow {
  designId: string;
  productId: string;
  name: string;
  number: number;
  coverMediaId: string | null;
}

/**
 * OFFERS-PLAN (2026-11-19): a shop's offers -- what each holds, the prices each running one has set, and the sizes and
 * products its screens show. Every price change itself is the caller's (OfferPrices), inside its transaction.
 */
export class OffersRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async list(tx: Transaction, tenantId: string): Promise<OfferListRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({
        offer: offers,
        products: sql<number>`(SELECT count(DISTINCT i.product_id)::integer FROM tenant.offer_items i
          WHERE i.tenant_id = ${offers.tenantId} AND i.offer_id = ${offers.id})`,
        designs: sql<number>`(SELECT count(*)::integer FROM tenant.offer_items i
          WHERE i.tenant_id = ${offers.tenantId} AND i.offer_id = ${offers.id} AND i.design_option_id IS NOT NULL)`,
      })
      .from(offers)
      .where(eq(offers.tenantId, tenantId))
      .orderBy(
        sql`CASE ${offers.state} WHEN 'running' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END`,
        sql`coalesce(${offers.endedAt}, ${offers.startedAt}, ${offers.createdAt}) DESC`,
        sql`${offers.id} DESC`,
      );
    return rows.map((row) => ({ ...row.offer, products: row.products, designs: row.designs }));
  }

  async find(tx: Transaction, tenantId: string, id: string): Promise<SelectOffer | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(offers)
      .where(and(eq(offers.tenantId, tenantId), eq(offers.id, id)))
      .limit(1);
    return rows[0] ?? null;
  }

  /** The offer, locked against another change of it until the caller's transaction ends. */
  async lock(tx: Transaction, tenantId: string, id: string): Promise<SelectOffer | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(offers)
      .where(and(eq(offers.tenantId, tenantId), eq(offers.id, id)))
      .for('update')
      .limit(1);
    return rows[0] ?? null;
  }

  async findBySlug(tx: Transaction, tenantId: string, slug: string): Promise<SelectOffer | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(offers)
      .where(and(eq(offers.tenantId, tenantId), eq(offers.slug, slug)))
      .limit(1);
    return rows[0] ?? null;
  }

  /** OF-21: the link names taken that start like `base`, for the next free one. */
  async slugsLike(tx: Transaction, tenantId: string, base: string): Promise<string[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ slug: offers.slug })
      .from(offers)
      .where(
        and(
          eq(offers.tenantId, tenantId),
          sql`(${offers.slug} = ${base} OR left(${offers.slug}, ${base.length + 1}) = ${`${base}-`})`,
        ),
      );
    return rows.map((row) => row.slug);
  }

  async insert(
    tx: Transaction,
    values: Omit<typeof offers.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<SelectOffer> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const rows = await tx.insert(offers).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error('the offer was not saved');
    return row;
  }

  async update(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: Partial<
      Pick<SelectOffer, 'name' | 'cutKind' | 'cutAmount' | 'state' | 'startedAt' | 'endedAt'>
    >,
  ): Promise<SelectOffer | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .update(offers)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(offers.tenantId, tenantId), eq(offers.id, id)))
      .returning();
    return rows[0] ?? null;
  }

  async delete(tx: Transaction, tenantId: string, id: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(offers).where(and(eq(offers.tenantId, tenantId), eq(offers.id, id)));
  }

  async items(tx: Transaction, tenantId: string, offerId: string): Promise<OfferItemRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select({ productId: offerItems.productId, designOptionId: offerItems.designOptionId })
      .from(offerItems)
      .where(and(eq(offerItems.tenantId, tenantId), eq(offerItems.offerId, offerId)));
  }

  /** OF-15: the offer's products and designs, whole. */
  async replaceItems(
    tx: Transaction,
    tenantId: string,
    offerId: string,
    items: readonly OfferItemRow[],
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(offerItems)
      .where(and(eq(offerItems.tenantId, tenantId), eq(offerItems.offerId, offerId)));
    if (items.length === 0) return;
    await tx.insert(offerItems).values(
      items.map((item) => ({
        tenantId,
        offerId,
        productId: item.productId,
        designOptionId: item.designOptionId,
      })),
    );
  }

  /**
   * OF-7, OF-16: the waiting and running offers other than `exceptOfferId` that hold any of these products, whole or by
   * a design. Called inside the shop's catalogue writes, so no two such changes of one shop meet.
   */
  async holders(
    tx: Transaction,
    tenantId: string,
    productIds: readonly string[],
    exceptOfferId: string | null,
  ): Promise<OfferHolderRow[]> {
    if (productIds.length === 0) return [];
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{
      offer_id: string;
      offer_name: string;
      offer_state: OfferState;
      product_id: string;
      design_option_id: string | null;
    }>(sql`
      SELECT o.id AS offer_id, o.name AS offer_name, o.state AS offer_state, i.product_id, i.design_option_id
      FROM tenant.offer_items i
      JOIN tenant.offers o ON o.tenant_id = i.tenant_id AND o.id = i.offer_id
      WHERE i.tenant_id = ${tenantId} AND o.state IN ('waiting', 'running')
        AND i.product_id = ANY(${uuids(productIds)})
        ${exceptOfferId === null ? sql`` : sql`AND o.id <> ${exceptOfferId}`}
      ORDER BY o.created_at, o.id`);
    return result.rows.map((row) => ({
      offerId: row.offer_id,
      offerName: row.offer_name,
      offerState: row.offer_state,
      productId: row.product_id,
      designOptionId: row.design_option_id,
    }));
  }

  /** OF-6: every live size of these products, with its design and what it sells at now. */
  async sizes(
    tx: Transaction,
    tenantId: string,
    productIds: readonly string[],
  ): Promise<OfferSizeRow[]> {
    if (productIds.length === 0) return [];
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{
      variant_id: string;
      product_id: string;
      design_option_id: string | null;
      own_price: string | null;
      own_regular: string | null;
      base_price: string;
      product_regular: string | null;
    }>(sql`
      SELECT v.id AS variant_id, v.product_id, d.option_id AS design_option_id, v.price AS own_price,
        v.regular_price AS own_regular, p.base_price, p.regular_price AS product_regular
      FROM tenant.product_variants v
      JOIN tenant.products p ON p.tenant_id = v.tenant_id AND p.id = v.product_id
      LEFT JOIN LATERAL (
        SELECT va.option_id FROM tenant.variant_attribute_values va
        JOIN tenant.attribute_options o ON o.tenant_id = va.tenant_id AND o.id = va.option_id
          AND o.product_id = v.product_id
        WHERE va.tenant_id = v.tenant_id AND va.variant_id = v.id
        ORDER BY va.option_id LIMIT 1
      ) d ON true
      WHERE v.tenant_id = ${tenantId} AND v.product_id = ANY(${uuids(productIds)})
        AND v.deleted_at IS NULL AND NOT v.is_stock_holder AND p.deleted_at IS NULL
      ORDER BY v.product_id, v.id`);
    return result.rows.map((row) => ({
      variantId: row.variant_id,
      productId: row.product_id,
      designOptionId: row.design_option_id,
      ownPrice: row.own_price,
      ownRegular: row.own_regular,
      basePrice: row.base_price,
      productRegular: row.product_regular,
    }));
  }

  /** OF-6: what a running offer has set, one row per size. */
  async prices(tx: Transaction, tenantId: string, offerId: string): Promise<SelectOfferPrice[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(offerPrices)
      .where(and(eq(offerPrices.tenantId, tenantId), eq(offerPrices.offerId, offerId)));
  }

  /** OF-17, OF-19: what running offers have set on these products' sizes. */
  async pricesOfProducts(
    tx: Transaction,
    tenantId: string,
    productIds: readonly string[],
  ): Promise<SelectOfferPrice[]> {
    if (productIds.length === 0) return [];
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(offerPrices)
      .where(
        and(
          eq(offerPrices.tenantId, tenantId),
          sql`${offerPrices.productId} = ANY(${uuids(productIds)})`,
        ),
      );
  }

  async insertPrices(
    tx: Transaction,
    rows: readonly (typeof offerPrices.$inferInsert)[],
  ): Promise<void> {
    const first = rows[0];
    if (!first) return;
    await this.transactions.setTenantContext(tx, first.tenantId);
    await tx.insert(offerPrices).values([...rows]);
  }

  async setOfferPrices(
    tx: Transaction,
    tenantId: string,
    rows: readonly { variantId: string; offerPrice: string }[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(sql`
      UPDATE tenant.offer_prices op SET offer_price = x.offer_price::numeric
      FROM jsonb_to_recordset(${JSON.stringify(rows.map((row) => ({ variant_id: row.variantId, offer_price: row.offerPrice })))}::jsonb)
        AS x(variant_id uuid, offer_price text)
      WHERE op.tenant_id = ${tenantId} AND op.variant_id = x.variant_id`);
  }

  async deletePrices(
    tx: Transaction,
    tenantId: string,
    variantIds: readonly string[],
  ): Promise<void> {
    if (variantIds.length === 0) return;
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(offerPrices)
      .where(
        and(
          eq(offerPrices.tenantId, tenantId),
          sql`${offerPrices.variantId} = ANY(${uuids(variantIds)})`,
        ),
      );
  }

  /**
   * OF-6: sets each size's own price and regular price (null: the product's; undefined: kept as it is, a new cut on a
   * running offer, OF-15), as an offer starts, changes or ends. The caller refreshes each product's price range after.
   */
  async setSizePrices(
    tx: Transaction,
    tenantId: string,
    rows: readonly { variantId: string; price: string | null; regularPrice?: string | null }[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await this.transactions.setTenantContext(tx, tenantId);
    const payload = JSON.stringify(
      rows.map((row) => ({
        id: row.variantId,
        price: row.price,
        regular: row.regularPrice ?? null,
        keep: row.regularPrice === undefined,
      })),
    );
    await tx.execute(sql`
      UPDATE tenant.product_variants v SET price = x.price::numeric,
        regular_price = CASE WHEN x.keep THEN v.regular_price ELSE x.regular::numeric END
      FROM jsonb_to_recordset(${payload}::jsonb) AS x(id uuid, price text, regular text, keep boolean)
      WHERE v.tenant_id = ${tenantId} AND v.id = x.id`);
  }

  /** The products an offer's screens name: each one's name, its first photo, and whether it is in the shop. */
  async products(
    tx: Transaction,
    tenantId: string,
    productIds: readonly string[],
  ): Promise<OfferProductRow[]> {
    if (productIds.length === 0) return [];
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{
      id: string;
      name: string;
      cover: string | null;
      active: boolean;
      stock_state: string;
    }>(sql`
      SELECT p.id, p.name, p.active, p.stock_state,
        (SELECT pi.media_id FROM tenant.product_images pi WHERE pi.tenant_id = p.tenant_id AND pi.product_id = p.id
          ORDER BY pi.sort_order LIMIT 1) AS cover
      FROM tenant.products p
      WHERE p.tenant_id = ${tenantId} AND p.id = ANY(${uuids(productIds)}) AND p.deleted_at IS NULL`);
    return result.rows.map((row) => ({
      productId: row.id,
      name: row.name,
      coverMediaId: row.cover,
      active: row.active,
      stockState: row.stock_state,
    }));
  }

  /** The designs of these products (each an option of its own product), with each one's number and cover. */
  async designs(
    tx: Transaction,
    tenantId: string,
    productIds: readonly string[],
  ): Promise<OfferDesignRow[]> {
    if (productIds.length === 0) return [];
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{
      id: string;
      product_id: string;
      value: string;
      sort_order: number;
      cover: string | null;
    }>(sql`
      SELECT o.id, o.product_id, o.value, o.sort_order,
        (SELECT pi.media_id FROM tenant.product_images pi WHERE pi.tenant_id = o.tenant_id
          AND pi.product_id = o.product_id AND pi.design_option_id = o.id ORDER BY pi.sort_order LIMIT 1) AS cover
      FROM tenant.attribute_options o
      WHERE o.tenant_id = ${tenantId} AND o.product_id = ANY(${uuids(productIds)}) AND o.retired_at IS NULL
        AND EXISTS (
          SELECT 1 FROM tenant.variant_attribute_values va
          JOIN tenant.product_variants v ON v.tenant_id = va.tenant_id AND v.id = va.variant_id
          WHERE va.tenant_id = o.tenant_id AND va.option_id = o.id AND v.deleted_at IS NULL
        )
      ORDER BY o.product_id, o.sort_order, o.id`);
    return result.rows.map((row) => ({
      designId: row.id,
      productId: row.product_id,
      name: row.value,
      number: row.sort_order,
      coverMediaId: row.cover,
    }));
  }

  /**
   * OF-25: the picker's page -- the shop's products not deleted (hidden and sold-out ones too), a name search, a
   * category with its subcategories, newest first; one more than the page, so the caller knows there is more.
   */
  async pickable(
    tx: Transaction,
    tenantId: string,
    query: { search: string | null; categoryId: string | null; offset: number; limit: number },
  ): Promise<OfferPickRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const search =
      query.search === null ? null : `%${query.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const result = await tx.execute<{
      id: string;
      name: string;
      min_price: string | null;
      max_price: string | null;
      min_regular_price: string | null;
      active: boolean;
      stock_state: string;
      cover: string | null;
      is_combo: boolean;
    }>(sql`
      ${
        query.categoryId === null
          ? sql``
          : sql`WITH RECURSIVE tree AS (
        SELECT c.id FROM tenant.categories c WHERE c.tenant_id = ${tenantId} AND c.id = ${query.categoryId}
        UNION ALL
        SELECT c.id FROM tenant.categories c JOIN tree t ON c.parent_id = t.id WHERE c.tenant_id = ${tenantId}
      )`
      }
      SELECT p.id, p.name, p.min_price, p.max_price, p.min_regular_price, p.active, p.stock_state,
        (p.kind = 'combo') AS is_combo,
        (SELECT pi.media_id FROM tenant.product_images pi WHERE pi.tenant_id = p.tenant_id AND pi.product_id = p.id
          ORDER BY pi.sort_order LIMIT 1) AS cover
      FROM tenant.products p
      WHERE p.tenant_id = ${tenantId} AND p.deleted_at IS NULL
        ${search === null ? sql`` : sql`AND p.name ILIKE ${search}`}
        ${
          query.categoryId === null
            ? sql``
            : sql`AND EXISTS (SELECT 1 FROM tenant.product_categories pc
          WHERE pc.tenant_id = p.tenant_id AND pc.product_id = p.id AND pc.category_id IN (SELECT id FROM tree))`
        }
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ${query.limit + 1} OFFSET ${query.offset}`);
    return result.rows.map((row) => ({
      productId: row.id,
      name: row.name,
      minPrice: row.min_price,
      maxPrice: row.max_price,
      minRegularPrice: row.min_regular_price,
      active: row.active,
      stockState: row.stock_state,
      coverMediaId: row.cover,
      isCombo: row.is_combo,
    }));
  }

  /** OF-25: each design's lowest price, for the picker. */
  async designPrices(
    tx: Transaction,
    tenantId: string,
    productIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (productIds.length === 0) return new Map();
    await this.transactions.setTenantContext(tx, tenantId);
    const result = await tx.execute<{ option_id: string; price: string }>(sql`
      SELECT va.option_id, min(coalesce(v.price, p.base_price))::text AS price
      FROM tenant.product_variants v
      JOIN tenant.products p ON p.tenant_id = v.tenant_id AND p.id = v.product_id
      JOIN tenant.variant_attribute_values va ON va.tenant_id = v.tenant_id AND va.variant_id = v.id
      JOIN tenant.attribute_options o ON o.tenant_id = va.tenant_id AND o.id = va.option_id
        AND o.product_id = v.product_id AND o.retired_at IS NULL
      WHERE v.tenant_id = ${tenantId} AND v.product_id = ANY(${uuids(productIds)})
        AND v.deleted_at IS NULL AND NOT v.is_stock_holder
      GROUP BY va.option_id`);
    return new Map(result.rows.map((row) => [row.option_id, row.price]));
  }

  /**
   * OF-8, OF-12: the products and designs an offer holds, as the public list filters by them: running or ended (a
   * waiting one is not public). Null when the shop has no such offer.
   */
  async publicOffer(
    tx: Transaction,
    tenantId: string,
    slug: string,
  ): Promise<{ offer: SelectOffer; items: OfferItemRow[] } | null> {
    const offer = await this.findBySlug(tx, tenantId, slug);
    if (!offer || offer.state === OfferState.Waiting) return null;
    return { offer, items: await this.items(tx, tenantId, offer.id) };
  }

  /** OF-8, OF-22: offers a design's rows and buttons name, as they are now. */
  async byIds(tx: Transaction, tenantId: string, ids: readonly string[]): Promise<SelectOffer[]> {
    if (ids.length === 0) return [];
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(offers)
      .where(and(eq(offers.tenantId, tenantId), sql`${offers.id} = ANY(${uuids(ids)})`));
  }

  /** LIF-19: everything of a shop's offers, for its erasure. */
  async deleteForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(offerPrices).where(eq(offerPrices.tenantId, tenantId));
    await tx.delete(offerItems).where(eq(offerItems.tenantId, tenantId));
    await tx.delete(offers).where(eq(offers.tenantId, tenantId));
  }
}
