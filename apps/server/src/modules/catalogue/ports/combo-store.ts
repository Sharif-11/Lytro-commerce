import type { ComboPartRow, ComboUseRow, PartVariantRow, Transaction } from '@lytronix/db';

/** CMB-01, CMB-08, CMB-10: a combo's parts, what they may be, and which combos use a variant. */
export interface ComboStore {
  listParts(tx: Transaction, tenantId: string, comboIds: string[]): Promise<ComboPartRow[]>;
  replaceParts(
    tx: Transaction,
    tenantId: string,
    comboId: string,
    parts: { quantity: string; variantIds: string[] }[],
  ): Promise<void>;
  findPartVariants(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<PartVariantRow[]>;
  variantLabels(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<Map<string, string>>;
  combosUsingVariants(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<ComboUseRow[]>;
}
