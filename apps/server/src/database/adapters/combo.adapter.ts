import { Inject, Injectable } from '@nestjs/common';
import {
  ComboRepository,
  type ComboPartRow,
  type ComboUseRow,
  type PartVariantRow,
  type Transaction,
} from '@lytronix/db';
import type { ComboStore } from '../../modules/catalogue/ports/combo-store';

/** tenant.combo_parts and combo_part_variants, inside the caller's transaction (CMB-01, CMB-08). */
@Injectable()
export class DrizzleComboStore implements ComboStore {
  constructor(@Inject(ComboRepository) private readonly combos: ComboRepository) {}

  listParts(tx: Transaction, tenantId: string, comboIds: string[]): Promise<ComboPartRow[]> {
    return this.combos.listParts(tx, tenantId, comboIds);
  }

  replaceParts(
    tx: Transaction,
    tenantId: string,
    comboId: string,
    parts: { quantity: string; variantIds: string[] }[],
  ): Promise<void> {
    return this.combos.replaceParts(tx, tenantId, comboId, parts);
  }

  findPartVariants(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<PartVariantRow[]> {
    return this.combos.findPartVariants(tx, tenantId, variantIds);
  }

  variantLabels(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<Map<string, string>> {
    return this.combos.variantLabels(tx, tenantId, variantIds);
  }

  combosUsingVariants(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<ComboUseRow[]> {
    return this.combos.combosUsingVariants(tx, tenantId, variantIds);
  }
}
