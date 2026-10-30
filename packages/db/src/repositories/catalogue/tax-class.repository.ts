import { and, asc, count, eq } from 'drizzle-orm';
import { products, shopSettings, taxClasses, type SelectTaxClass } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

// TAX-01 (Slice 4.6a): a shop's tax classes and the one each new product starts with. Every method sets the shop's
// tenant context.
export class TaxClassRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async list(tx: Transaction, tenantId: string): Promise<SelectTaxClass[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select()
      .from(taxClasses)
      .where(eq(taxClasses.tenantId, tenantId))
      .orderBy(asc(taxClasses.name), asc(taxClasses.id));
  }

  async find(tx: Transaction, tenantId: string, id: string): Promise<SelectTaxClass | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select()
      .from(taxClasses)
      .where(and(eq(taxClasses.tenantId, tenantId), eq(taxClasses.id, id)));
    return row ?? null;
  }

  /** The shop's classes, held until the transaction ends, so two new ones never pass the limit together. */
  async lockAll(tx: Transaction, tenantId: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ id: taxClasses.id })
      .from(taxClasses)
      .where(eq(taxClasses.tenantId, tenantId))
      .for('update');
    return rows.length;
  }

  /** A unique violation on `tax_classes_name_key` when the shop already has a class of that name. */
  async insert(
    tx: Transaction,
    tenantId: string,
    values: { name: string; rate: string },
  ): Promise<SelectTaxClass> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .insert(taxClasses)
      .values({ tenantId, ...values })
      .returning();
    if (!row) throw new Error('insert returned no tax class');
    return row;
  }

  async update(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: { name?: string; rate?: string },
  ): Promise<SelectTaxClass | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .update(taxClasses)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(taxClasses.tenantId, tenantId), eq(taxClasses.id, id)))
      .returning();
    return row ?? null;
  }

  async delete(tx: Transaction, tenantId: string, id: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(taxClasses)
      .where(and(eq(taxClasses.tenantId, tenantId), eq(taxClasses.id, id)));
  }

  /** How many of the shop's products, archived ones too, name the class. */
  async countProducts(tx: Transaction, tenantId: string, id: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ total: count() })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.taxClassId, id)));
    return row?.total ?? 0;
  }

  /** Agreed 2026-10-30: the class each new product starts with, or null for none. */
  async defaultOf(tx: Transaction, tenantId: string): Promise<string | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ id: shopSettings.defaultTaxClassId })
      .from(shopSettings)
      .where(eq(shopSettings.tenantId, tenantId));
    return row?.id ?? null;
  }

  async setDefault(tx: Transaction, tenantId: string, id: string | null): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .insert(shopSettings)
      .values({ tenantId, defaultTaxClassId: id })
      .onConflictDoUpdate({ target: shopSettings.tenantId, set: { defaultTaxClassId: id } });
  }
}
