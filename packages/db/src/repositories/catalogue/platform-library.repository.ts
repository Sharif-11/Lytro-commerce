import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  attributeOptions,
  attributes,
  optionSets,
  platformCatalogueState,
  type SelectAttribute,
  type SelectAttributeOption,
  type SelectOptionSet,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';
import { isEmptyPatch } from '../patch';

/** PST-04, ATR-16: what the operator may change on a platform option set. */
export type PlatformOptionSetPatch = Partial<
  Pick<SelectOptionSet, 'name' | 'presetKey' | 'options' | 'sortOrder'>
>;

// PST-04, ATL-01, ATR-16, ATR-18: the operator's curation of the platform's rows of the attribute library and its
// option sets, the rows with no tenant every shop reads. Every write turns on platform curation for its transaction
// (migration 0052), which lets it write those rows and only those; every query names the platform scope.
export class PlatformLibraryRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async listAttributes(tx: Transaction): Promise<SelectAttribute[]> {
    return tx
      .select()
      .from(attributes)
      .where(isNull(attributes.tenantId))
      .orderBy(sql`lower(${attributes.name})`);
  }

  async findAttribute(tx: Transaction, id: string): Promise<SelectAttribute | null> {
    const rows = await tx
      .select()
      .from(attributes)
      .where(and(isNull(attributes.tenantId), eq(attributes.id, id)));
    return rows[0] ?? null;
  }

  async findAttributeByName(tx: Transaction, name: string): Promise<SelectAttribute | null> {
    const rows = await tx
      .select()
      .from(attributes)
      .where(and(isNull(attributes.tenantId), sql`lower(${attributes.name}) = lower(${name})`));
    return rows[0] ?? null;
  }

  async insertAttribute(
    tx: Transaction,
    values: Pick<SelectAttribute, 'name' | 'dataType' | 'unitKind'>,
  ): Promise<SelectAttribute> {
    await this.transactions.enablePlatformCuration(tx);
    const rows = await tx
      .insert(attributes)
      .values({ ...values, tenantId: null })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('insert returned no attribute row');
    return row;
  }

  async updateAttribute(
    tx: Transaction,
    id: string,
    patch: { name?: string; retiredAt?: Date | null },
  ): Promise<SelectAttribute | null> {
    if (isEmptyPatch(patch)) return this.findAttribute(tx, id);
    await this.transactions.enablePlatformCuration(tx);
    const rows = await tx
      .update(attributes)
      .set(patch)
      .where(and(isNull(attributes.tenantId), eq(attributes.id, id)))
      .returning();
    return rows[0] ?? null;
  }

  /** The platform's options of these attributes, in their set order. Shops' own values are not the operator's. */
  async listOptions(tx: Transaction, attributeIds: string[]): Promise<SelectAttributeOption[]> {
    if (attributeIds.length === 0) return [];
    return tx
      .select()
      .from(attributeOptions)
      .where(
        and(isNull(attributeOptions.tenantId), inArray(attributeOptions.attributeId, attributeIds)),
      )
      .orderBy(asc(attributeOptions.sortOrder), sql`lower(${attributeOptions.value})`);
  }

  async findOption(
    tx: Transaction,
    attributeId: string,
    id: string,
  ): Promise<SelectAttributeOption | null> {
    const rows = await tx
      .select()
      .from(attributeOptions)
      .where(
        and(
          isNull(attributeOptions.tenantId),
          eq(attributeOptions.attributeId, attributeId),
          eq(attributeOptions.id, id),
        ),
      );
    return rows[0] ?? null;
  }

  async findOptionByValue(
    tx: Transaction,
    attributeId: string,
    value: string,
  ): Promise<SelectAttributeOption | null> {
    const rows = await tx
      .select()
      .from(attributeOptions)
      .where(
        and(
          isNull(attributeOptions.tenantId),
          eq(attributeOptions.attributeId, attributeId),
          sql`lower(${attributeOptions.value}) = lower(${value})`,
        ),
      );
    return rows[0] ?? null;
  }

  async nextOptionPosition(tx: Transaction, attributeId: string): Promise<number> {
    const rows = await tx
      .select({ last: sql<number | null>`max(${attributeOptions.sortOrder})` })
      .from(attributeOptions)
      .where(and(isNull(attributeOptions.tenantId), eq(attributeOptions.attributeId, attributeId)));
    const last = rows[0]?.last;
    return last === null || last === undefined ? 0 : last + 1;
  }

  async insertOption(
    tx: Transaction,
    values: { attributeId: string; value: string; swatchColor: string | null; sortOrder: number },
  ): Promise<SelectAttributeOption> {
    await this.transactions.enablePlatformCuration(tx);
    const rows = await tx
      .insert(attributeOptions)
      .values({ ...values, tenantId: null })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('insert returned no option row');
    return row;
  }

  async updateOption(
    tx: Transaction,
    attributeId: string,
    id: string,
    patch: { value?: string; swatchColor?: string | null; retiredAt?: Date | null },
  ): Promise<SelectAttributeOption | null> {
    if (isEmptyPatch(patch)) return this.findOption(tx, attributeId, id);
    await this.transactions.enablePlatformCuration(tx);
    const rows = await tx
      .update(attributeOptions)
      .set(patch)
      .where(
        and(
          isNull(attributeOptions.tenantId),
          eq(attributeOptions.attributeId, attributeId),
          eq(attributeOptions.id, id),
        ),
      )
      .returning();
    return rows[0] ?? null;
  }

  async listOptionSets(tx: Transaction): Promise<SelectOptionSet[]> {
    return tx
      .select()
      .from(optionSets)
      .where(isNull(optionSets.tenantId))
      .orderBy(asc(optionSets.sortOrder), sql`lower(${optionSets.name})`);
  }

  async insertOptionSet(
    tx: Transaction,
    values: { name: string; presetKey: string | null; options: string[]; sortOrder: number },
  ): Promise<SelectOptionSet> {
    await this.transactions.enablePlatformCuration(tx);
    const rows = await tx
      .insert(optionSets)
      .values({ ...values, tenantId: null })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('insert returned no option set row');
    return row;
  }

  async nextOptionSetPosition(tx: Transaction): Promise<number> {
    const rows = await tx
      .select({ last: sql<number | null>`max(${optionSets.sortOrder})` })
      .from(optionSets)
      .where(isNull(optionSets.tenantId));
    const last = rows[0]?.last;
    return last === null || last === undefined ? 0 : last + 1;
  }

  async updateOptionSet(
    tx: Transaction,
    id: string,
    patch: PlatformOptionSetPatch,
  ): Promise<SelectOptionSet | null> {
    if (isEmptyPatch(patch)) {
      const rows = await tx
        .select()
        .from(optionSets)
        .where(and(isNull(optionSets.tenantId), eq(optionSets.id, id)));
      return rows[0] ?? null;
    }
    await this.transactions.enablePlatformCuration(tx);
    const rows = await tx
      .update(optionSets)
      .set(patch)
      .where(and(isNull(optionSets.tenantId), eq(optionSets.id, id)))
      .returning();
    return rows[0] ?? null;
  }

  async deleteOptionSet(tx: Transaction, id: string): Promise<SelectOptionSet | null> {
    await this.transactions.enablePlatformCuration(tx);
    const rows = await tx
      .delete(optionSets)
      .where(and(isNull(optionSets.tenantId), eq(optionSets.id, id)))
      .returning();
    return rows[0] ?? null;
  }

  /**
   * CCH-02, KNOWN-GAPS §66: one more platform library version, in the transaction of the write that changed what
   * shops show, so every shop's public cache keys change at once.
   */
  async bumpVersion(tx: Transaction): Promise<void> {
    await tx
      .update(platformCatalogueState)
      .set({ version: sql`${platformCatalogueState.version} + 1` })
      .where(eq(platformCatalogueState.id, 1));
  }
}
