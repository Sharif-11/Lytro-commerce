import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ProductKind, StockTracking, StockUnit } from '@lytronix/validators';
import {
  attributeOptions,
  comboPartVariants,
  comboParts,
  orderLineComponents,
  productAttributes,
  productVariants,
  products,
  stockLevels,
  variantAttributeValues,
  type InsertOrderLineComponent,
  type SelectOrderLineComponent,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

// CMB-01 to CMB-10 (Phase 4 Slice 4.5): a combo's parts, what each part's variants hold, which combos use a product
// or a variant, and a combo line's components on an order.

/** One part of a combo, with the variants it may be. */
export interface ComboPartRow {
  comboProductId: string;
  partId: string;
  position: number;
  quantity: string;
  variantIds: string[];
}

/** One allowed variant of one part, with what decides how many combos it can make (CMB-02, CMB-08). */
export interface ComboPartStockRow {
  comboProductId: string;
  position: number;
  quantity: string;
  variantId: string;
  productId: string;
  productName: string;
  productActive: boolean;
  productDeleted: boolean;
  variantActive: boolean;
  variantRetired: boolean;
  stockTracking: StockTracking;
  sharedStock: boolean;
  /** INV-24: how much of the shared stock one unit uses; null unless the product shares its stock. */
  packAmount: string | null;
  /** The variant's own available stock, zero where it has no level. */
  available: string;
  /** INV-24: the stock holder's available stock, for a product sharing its stock. */
  poolAvailable: string | null;
  /** ATR-05, ATR-13: the variant's price and weight, its own or its product's. */
  price: string;
  weightKg: string | null;
  /** CMB-09: the product's first photo, for "What's inside". */
  coverMediaId: string | null;
}

/** A variant a part would be made of, with what decides whether it may be (CMB-01, UOM-03). */
export interface PartVariantRow {
  variantId: string;
  productId: string;
  productName: string;
  kind: ProductKind;
  stockUnit: StockUnit;
  isStockHolder: boolean;
  retired: boolean;
  productDeleted: boolean;
}

/** A combo the products or variants are part of. */
export interface ComboUseRow {
  id: string;
  name: string;
}

export class ComboRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  /** CMB-01: the combo's parts, the whole list replaced, each part and its variants in the order given. */
  async replaceParts(
    tx: Transaction,
    tenantId: string,
    comboProductId: string,
    parts: { quantity: string; variantIds: string[] }[],
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(comboParts)
      .where(and(eq(comboParts.tenantId, tenantId), eq(comboParts.comboProductId, comboProductId)));
    for (const [index, part] of parts.entries()) {
      const [row] = await tx
        .insert(comboParts)
        .values({ tenantId, comboProductId, position: index + 1, quantity: part.quantity })
        .returning({ id: comboParts.id });
      if (!row) throw new Error('the part was not added');
      await tx.insert(comboPartVariants).values(
        part.variantIds.map((variantId, at) => ({
          tenantId,
          partId: row.id,
          variantId,
          position: at + 1,
        })),
      );
    }
  }

  /** The parts of these combos, in order, each with its variants in the order the shop listed them. */
  async listParts(
    tx: Transaction,
    tenantId: string,
    comboProductIds: string[],
  ): Promise<ComboPartRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (comboProductIds.length === 0) return [];
    const rows = await tx
      .select({
        comboProductId: comboParts.comboProductId,
        partId: comboParts.id,
        position: comboParts.position,
        quantity: comboParts.quantity,
        variantId: comboPartVariants.variantId,
      })
      .from(comboParts)
      .innerJoin(
        comboPartVariants,
        and(
          eq(comboPartVariants.tenantId, comboParts.tenantId),
          eq(comboPartVariants.partId, comboParts.id),
        ),
      )
      .innerJoin(
        productVariants,
        and(
          eq(productVariants.tenantId, comboPartVariants.tenantId),
          eq(productVariants.id, comboPartVariants.variantId),
        ),
      )
      .where(
        and(eq(comboParts.tenantId, tenantId), inArray(comboParts.comboProductId, comboProductIds)),
      )
      .orderBy(
        asc(comboParts.comboProductId),
        asc(comboParts.position),
        asc(comboPartVariants.position),
      );
    const parts = new Map<string, ComboPartRow>();
    for (const row of rows) {
      const part = parts.get(row.partId) ?? {
        comboProductId: row.comboProductId,
        partId: row.partId,
        position: row.position,
        quantity: row.quantity,
        variantIds: [],
      };
      part.variantIds.push(row.variantId);
      parts.set(row.partId, part);
    }
    return [...parts.values()];
  }

  /** CMB-02, CMB-06 to CMB-08: every allowed variant of these combos' parts, with its stock, price and weight. */
  async listPartStock(
    tx: Transaction,
    tenantId: string,
    comboProductIds: string[],
  ): Promise<ComboPartStockRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (comboProductIds.length === 0) return [];
    const holder = alias(productVariants, 'holder');
    const pool = alias(stockLevels, 'pool');
    const rows = await tx
      .select({
        comboProductId: comboParts.comboProductId,
        position: comboParts.position,
        quantity: comboParts.quantity,
        variantId: productVariants.id,
        productId: products.id,
        productName: products.name,
        productActive: products.active,
        productDeletedAt: products.deletedAt,
        variantActive: productVariants.active,
        variantDeletedAt: productVariants.deletedAt,
        stockTracking: products.stockTracking,
        sharedStock: products.sharedStock,
        packAmount: productVariants.packAmount,
        available: stockLevels.available,
        poolAvailable: pool.available,
        price: sql<string>`coalesce(${productVariants.price}, ${products.basePrice})`,
        weightKg: sql<string | null>`coalesce(${productVariants.weightKg}, ${products.weightKg})`,
        coverMediaId: sql<string | null>`(SELECT pi.media_id FROM tenant.product_images pi
          WHERE pi.tenant_id = ${products.tenantId} AND pi.product_id = ${products.id}
          ORDER BY pi.sort_order LIMIT 1)`,
      })
      .from(comboParts)
      .innerJoin(
        comboPartVariants,
        and(
          eq(comboPartVariants.tenantId, comboParts.tenantId),
          eq(comboPartVariants.partId, comboParts.id),
        ),
      )
      .innerJoin(
        productVariants,
        and(
          eq(productVariants.tenantId, comboPartVariants.tenantId),
          eq(productVariants.id, comboPartVariants.variantId),
        ),
      )
      .innerJoin(
        products,
        and(
          eq(products.tenantId, productVariants.tenantId),
          eq(products.id, productVariants.productId),
        ),
      )
      .leftJoin(
        stockLevels,
        and(
          eq(stockLevels.tenantId, productVariants.tenantId),
          eq(stockLevels.variantId, productVariants.id),
        ),
      )
      .leftJoin(
        holder,
        and(
          eq(holder.tenantId, products.tenantId),
          eq(holder.productId, products.id),
          eq(holder.isStockHolder, true),
          isNull(holder.deletedAt),
        ),
      )
      .leftJoin(pool, and(eq(pool.tenantId, holder.tenantId), eq(pool.variantId, holder.id)))
      .where(
        and(eq(comboParts.tenantId, tenantId), inArray(comboParts.comboProductId, comboProductIds)),
      )
      .orderBy(
        asc(comboParts.comboProductId),
        asc(comboParts.position),
        asc(comboPartVariants.position),
      );
    return rows.map((row) => ({
      comboProductId: row.comboProductId,
      position: row.position,
      quantity: row.quantity,
      variantId: row.variantId,
      productId: row.productId,
      productName: row.productName,
      productActive: row.productActive,
      productDeleted: row.productDeletedAt !== null,
      variantActive: row.variantActive,
      variantRetired: row.variantDeletedAt !== null,
      stockTracking: row.stockTracking,
      sharedStock: row.sharedStock,
      packAmount: row.packAmount,
      available: row.available ?? '0.000',
      poolAvailable: row.sharedStock ? (row.poolAvailable ?? '0.000') : null,
      price: row.price,
      weightKg: row.weightKg,
      coverMediaId: row.coverMediaId,
    }));
  }

  /** CMB-01: what these variants are, to check them as a combo's parts. */
  async findPartVariants(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<PartVariantRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (variantIds.length === 0) return [];
    const rows = await tx
      .select({
        variantId: productVariants.id,
        productId: products.id,
        productName: products.name,
        kind: products.kind,
        stockUnit: products.stockUnit,
        isStockHolder: productVariants.isStockHolder,
        variantDeletedAt: productVariants.deletedAt,
        productDeletedAt: products.deletedAt,
      })
      .from(productVariants)
      .innerJoin(
        products,
        and(
          eq(products.tenantId, productVariants.tenantId),
          eq(products.id, productVariants.productId),
        ),
      )
      .where(and(eq(productVariants.tenantId, tenantId), inArray(productVariants.id, variantIds)));
    return rows.map((row) => ({
      variantId: row.variantId,
      productId: row.productId,
      productName: row.productName,
      kind: row.kind,
      stockUnit: row.stockUnit,
      isStockHolder: row.isStockHolder,
      retired: row.variantDeletedAt !== null,
      productDeleted: row.productDeletedAt !== null,
    }));
  }

  /** CMB-01, CMB-04: each variant's options as one label, in its product's attribute order ("M / Red"); '' for one. */
  async variantLabels(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<Map<string, string>> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (variantIds.length === 0) return new Map();
    const rows = await tx
      .select({ variantId: variantAttributeValues.variantId, value: attributeOptions.value })
      .from(variantAttributeValues)
      .innerJoin(attributeOptions, eq(attributeOptions.id, variantAttributeValues.optionId))
      .innerJoin(
        productAttributes,
        and(
          eq(productAttributes.tenantId, variantAttributeValues.tenantId),
          eq(productAttributes.productId, variantAttributeValues.productId),
          eq(productAttributes.attributeId, variantAttributeValues.attributeId),
        ),
      )
      .where(
        and(
          eq(variantAttributeValues.tenantId, tenantId),
          inArray(variantAttributeValues.variantId, variantIds),
        ),
      )
      .orderBy(asc(variantAttributeValues.variantId), asc(productAttributes.sortOrder));
    const labels = new Map<string, string>(variantIds.map((id) => [id, '']));
    for (const row of rows) {
      const before = labels.get(row.variantId) ?? '';
      labels.set(row.variantId, before === '' ? row.value : `${before} / ${row.value}`);
    }
    return labels;
  }

  /** CMB-02: the live combos whose parts use any variant of these products. */
  async combosUsingProducts(
    tx: Transaction,
    tenantId: string,
    productIds: string[],
  ): Promise<string[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (productIds.length === 0) return [];
    const combo = alias(products, 'combo');
    const rows = await tx
      .selectDistinct({ id: comboParts.comboProductId })
      .from(comboPartVariants)
      .innerJoin(
        productVariants,
        and(
          eq(productVariants.tenantId, comboPartVariants.tenantId),
          eq(productVariants.id, comboPartVariants.variantId),
        ),
      )
      .innerJoin(
        comboParts,
        and(
          eq(comboParts.tenantId, comboPartVariants.tenantId),
          eq(comboParts.id, comboPartVariants.partId),
        ),
      )
      .innerJoin(
        combo,
        and(eq(combo.tenantId, comboParts.tenantId), eq(combo.id, comboParts.comboProductId)),
      )
      .where(
        and(
          eq(comboPartVariants.tenantId, tenantId),
          inArray(productVariants.productId, productIds),
          isNull(combo.deletedAt),
        ),
      );
    return rows.map((row) => row.id);
  }

  /** CMB-08, PRD-13: the combos, live or archived, whose parts name any of these variants. */
  async combosUsingVariants(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<ComboUseRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (variantIds.length === 0) return [];
    return tx
      .selectDistinct({ id: products.id, name: products.name })
      .from(comboPartVariants)
      .innerJoin(
        comboParts,
        and(
          eq(comboParts.tenantId, comboPartVariants.tenantId),
          eq(comboParts.id, comboPartVariants.partId),
        ),
      )
      .innerJoin(
        products,
        and(eq(products.tenantId, comboParts.tenantId), eq(products.id, comboParts.comboProductId)),
      )
      .where(
        and(
          eq(comboPartVariants.tenantId, tenantId),
          inArray(comboPartVariants.variantId, variantIds),
        ),
      )
      .orderBy(asc(products.name));
  }

  /** CMB-03, CMB-04: a combo line's components, as ordered. */
  async insertComponents(
    tx: Transaction,
    tenantId: string,
    rows: Omit<InsertOrderLineComponent, 'tenantId'>[],
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (rows.length === 0) return;
    await tx.insert(orderLineComponents).values(rows.map((row) => ({ ...row, tenantId })));
  }

  /** The components of these lines, by line, each in its place. */
  async listComponents(
    tx: Transaction,
    tenantId: string,
    orderLineIds: string[],
  ): Promise<SelectOrderLineComponent[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (orderLineIds.length === 0) return [];
    return tx
      .select()
      .from(orderLineComponents)
      .where(
        and(
          eq(orderLineComponents.tenantId, tenantId),
          inArray(orderLineComponents.orderLineId, orderLineIds),
        ),
      )
      .orderBy(asc(orderLineComponents.orderLineId), asc(orderLineComponents.position));
  }

  /** ORD-11: an edited order's lines are written again, their components with them. */
  async deleteComponents(tx: Transaction, tenantId: string, orderLineIds: string[]): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (orderLineIds.length === 0) return;
    await tx
      .delete(orderLineComponents)
      .where(
        and(
          eq(orderLineComponents.tenantId, tenantId),
          inArray(orderLineComponents.orderLineId, orderLineIds),
        ),
      );
  }
}
