import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  modifierGroups,
  modifierOptions,
  type SelectModifierGroup,
  type SelectModifierOption,
} from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

/** MNU-01: a modifier group as it is saved, with its options in order. */
export interface NewModifierGroup {
  name: string;
  minSelect: number;
  maxSelect: number;
  options: { name: string; priceChange: string; isDefault: boolean }[];
}

/** A product's group, with its options in order. */
export type ModifierGroupRow = SelectModifierGroup & { options: SelectModifierOption[] };

// MNU-01 (Slice 4.6b): a product's modifier groups and their options, replaced whole when the product is saved. Every
// method sets the shop's tenant context.
export class ModifierRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async replaceGroups(
    tx: Transaction,
    tenantId: string,
    productId: string,
    groups: readonly NewModifierGroup[],
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(modifierGroups)
      .where(and(eq(modifierGroups.tenantId, tenantId), eq(modifierGroups.productId, productId)));
    for (const [position, group] of groups.entries()) {
      const [made] = await tx
        .insert(modifierGroups)
        .values({
          tenantId,
          productId,
          name: group.name,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          position,
        })
        .returning({ id: modifierGroups.id });
      if (!made) throw new Error('insert returned no modifier group');
      await tx.insert(modifierOptions).values(
        group.options.map((option, index) => ({
          tenantId,
          groupId: made.id,
          name: option.name,
          priceChange: option.priceChange,
          isDefault: option.isDefault,
          position: index,
        })),
      );
    }
  }

  /** The groups of these products, each product's in order, each group's options in order. */
  async listForProducts(
    tx: Transaction,
    tenantId: string,
    productIds: readonly string[],
  ): Promise<ModifierGroupRow[]> {
    if (productIds.length === 0) return [];
    await this.transactions.setTenantContext(tx, tenantId);
    const groups = await tx
      .select()
      .from(modifierGroups)
      .where(
        and(
          eq(modifierGroups.tenantId, tenantId),
          inArray(modifierGroups.productId, [...productIds]),
        ),
      )
      .orderBy(asc(modifierGroups.productId), asc(modifierGroups.position));
    if (groups.length === 0) return [];
    const options = await tx
      .select()
      .from(modifierOptions)
      .where(
        and(
          eq(modifierOptions.tenantId, tenantId),
          inArray(
            modifierOptions.groupId,
            groups.map((group) => group.id),
          ),
        ),
      )
      .orderBy(asc(modifierOptions.groupId), asc(modifierOptions.position));
    return groups.map((group) => ({
      ...group,
      options: options.filter((option) => option.groupId === group.id),
    }));
  }
}
