import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  attributeOptions,
  attributes,
  categoryAttributes,
  type SelectAttribute,
  type SelectAttributeOption,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

// ATL-01, ATR-01, ATR-02, ATR-10: the attribute library a shop sees (the platform's rows and its own) and its
// categories' suggestions. Row-level security already hides other shops' rows; every query also names the scope
// it means, so it reads the same under a role that bypasses the policies.
export class AttributeRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  private visible(tenantId: string) {
    return or(isNull(attributes.tenantId), eq(attributes.tenantId, tenantId));
  }

  private visibleOption(tenantId: string) {
    return or(isNull(attributeOptions.tenantId), eq(attributeOptions.tenantId, tenantId));
  }

  /** The platform's attributes and the shop's own, by name. */
  async listAttributes(
    tx: Transaction,
    tenantId: string,
    includeRetired: boolean,
  ): Promise<SelectAttribute[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(attributes)
      .where(and(this.visible(tenantId), includeRetired ? undefined : isNull(attributes.retiredAt)))
      .orderBy(sql`lower(${attributes.name})`);
  }

  async findAttributes(
    tx: Transaction,
    tenantId: string,
    ids: string[],
  ): Promise<SelectAttribute[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (ids.length === 0) return [];
    return tx
      .select()
      .from(attributes)
      .where(and(this.visible(tenantId), inArray(attributes.id, ids)));
  }

  /** The visible attribute with this name, ignoring case: the shop's own first, then the platform's. */
  async findAttributeByName(
    tx: Transaction,
    tenantId: string,
    name: string,
  ): Promise<SelectAttribute | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(attributes)
      .where(and(this.visible(tenantId), sql`lower(${attributes.name}) = lower(${name})`))
      .orderBy(sql`${attributes.tenantId} IS NULL`);
    return rows[0] ?? null;
  }

  async insertAttribute(
    tx: Transaction,
    values: {
      tenantId: string;
      name: string;
      dataType: SelectAttribute['dataType'];
      unitKind: SelectAttribute['unitKind'];
    },
  ): Promise<SelectAttribute> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const rows = await tx.insert(attributes).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error('insert returned no attribute row');
    return row;
  }

  /** Updates one of the shop's own attributes. A platform attribute is never the shop's to change. */
  async updateAttribute(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: { name?: string; retiredAt?: Date | null },
  ): Promise<SelectAttribute | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .update(attributes)
      .set(patch)
      .where(and(eq(attributes.tenantId, tenantId), eq(attributes.id, id)))
      .returning();
    return rows[0] ?? null;
  }

  /** The options of these attributes the shop sees: the platform's and its own, in their set order. */
  async listOptions(
    tx: Transaction,
    tenantId: string,
    attributeIds: string[],
    includeRetired: boolean,
  ): Promise<SelectAttributeOption[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (attributeIds.length === 0) return [];
    return tx
      .select()
      .from(attributeOptions)
      .where(
        and(
          this.visibleOption(tenantId),
          inArray(attributeOptions.attributeId, attributeIds),
          includeRetired ? undefined : isNull(attributeOptions.retiredAt),
        ),
      )
      .orderBy(asc(attributeOptions.sortOrder), sql`lower(${attributeOptions.value})`);
  }

  async findOptions(
    tx: Transaction,
    tenantId: string,
    ids: string[],
  ): Promise<SelectAttributeOption[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (ids.length === 0) return [];
    return tx
      .select()
      .from(attributeOptions)
      .where(and(this.visibleOption(tenantId), inArray(attributeOptions.id, ids)));
  }

  /** The visible option of this attribute with this value, ignoring case. */
  async findOptionByValue(
    tx: Transaction,
    tenantId: string,
    attributeId: string,
    value: string,
  ): Promise<SelectAttributeOption | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(attributeOptions)
      .where(
        and(
          this.visibleOption(tenantId),
          eq(attributeOptions.attributeId, attributeId),
          sql`lower(${attributeOptions.value}) = lower(${value})`,
        ),
      )
      .orderBy(sql`${attributeOptions.tenantId} IS NULL`);
    return rows[0] ?? null;
  }

  async insertOption(
    tx: Transaction,
    values: { tenantId: string; attributeId: string; value: string; sortOrder: number },
  ): Promise<SelectAttributeOption> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const rows = await tx.insert(attributeOptions).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error('insert returned no option row');
    return row;
  }

  /** The next position after an attribute's current options, so a new value is listed last. */
  async nextOptionPosition(
    tx: Transaction,
    tenantId: string,
    attributeId: string,
  ): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ last: sql<number | null>`max(${attributeOptions.sortOrder})` })
      .from(attributeOptions)
      .where(and(this.visibleOption(tenantId), eq(attributeOptions.attributeId, attributeId)));
    const last = rows[0]?.last;
    return last === null || last === undefined ? 0 : last + 1;
  }

  /** Updates one of the shop's own options. */
  async updateOption(
    tx: Transaction,
    tenantId: string,
    attributeId: string,
    id: string,
    patch: { value?: string; retiredAt?: Date | null },
  ): Promise<SelectAttributeOption | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .update(attributeOptions)
      .set(patch)
      .where(
        and(
          eq(attributeOptions.tenantId, tenantId),
          eq(attributeOptions.attributeId, attributeId),
          eq(attributeOptions.id, id),
        ),
      )
      .returning();
    return rows[0] ?? null;
  }

  /** ATR-02: a category's suggested attribute ids, in order. */
  async listCategorySuggestions(
    tx: Transaction,
    tenantId: string,
    categoryIds: string[],
  ): Promise<{ categoryId: string; attributeId: string }[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (categoryIds.length === 0) return [];
    return tx
      .select({
        categoryId: categoryAttributes.categoryId,
        attributeId: categoryAttributes.attributeId,
      })
      .from(categoryAttributes)
      .where(
        and(
          eq(categoryAttributes.tenantId, tenantId),
          inArray(categoryAttributes.categoryId, categoryIds),
        ),
      )
      .orderBy(asc(categoryAttributes.categoryId), asc(categoryAttributes.sortOrder));
  }

  async replaceCategorySuggestions(
    tx: Transaction,
    tenantId: string,
    categoryId: string,
    attributeIds: string[],
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(categoryAttributes)
      .where(
        and(
          eq(categoryAttributes.tenantId, tenantId),
          eq(categoryAttributes.categoryId, categoryId),
        ),
      );
    if (attributeIds.length === 0) return;
    await tx.insert(categoryAttributes).values(
      attributeIds.map((attributeId, sortOrder) => ({
        tenantId,
        categoryId,
        attributeId,
        sortOrder,
      })),
    );
  }
}
