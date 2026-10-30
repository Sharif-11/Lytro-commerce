import { Inject, Injectable } from '@nestjs/common';
import type { ComboUseRow, Transaction } from '@lytronix/db';
import {
  FieldProblemCode,
  MEASURED_STOCK_UNITS,
  ProductKind,
  ServerFieldProblemCode,
  type ComboPartInput,
} from '@lytronix/validators';
import { FieldsError, type InvalidField } from '../../../common/api-error';
import type { ComboStore } from '../ports/combo-store';
import { COMBO_STORE } from '../tokens';
import type { ComboPartView } from '../types/catalogue';

/** A combo's parts as stored: each its quantity in one combo and the variants it may be. */
export interface ComboPartValues {
  quantity: string;
  variantIds: string[];
}

/**
 * CMB-01, CMB-08, CMB-10 (Phase 4 Slice 4.5): a combo's parts. Each part is a quantity of one variant (a fixed part) or
 * of a choice among several, every one of an ordinary product of the shop's, live, and listed once in its part; a part
 * of a product counted in whole units takes a whole quantity, and a choice part always does -- the shopper picks one
 * variant for each unit (UOM-03). Replacing the parts leaves open orders with what they reserved (agreed 2026-10-30).
 */
@Injectable()
export class ComboParts {
  constructor(@Inject(COMBO_STORE) private readonly store: ComboStore) {}

  /** The parts as given, checked; refused field by field. */
  async check(
    tx: Transaction,
    tenantId: string,
    parts: ComboPartInput[],
  ): Promise<ComboPartValues[]> {
    const found = new Map(
      (
        await this.store.findPartVariants(tx, tenantId, [
          ...new Set(parts.flatMap((part) => part.variantIds)),
        ])
      ).map((row) => [row.variantId, row]),
    );
    const fields: InvalidField[] = [];
    parts.forEach((part, index) => {
      const seen = new Set<string>();
      part.variantIds.forEach((variantId, at) => {
        const field = `parts.${String(index)}.variantIds.${String(at)}`;
        const row = found.get(variantId);
        if (!row || row.retired || row.productDeleted || row.isStockHolder) {
          fields.push({
            field,
            problem: ServerFieldProblemCode.NotFound,
            messageKey: 'ComboPartNotFound',
          });
        } else if (row.kind === ProductKind.Combo) {
          fields.push({
            field,
            problem: FieldProblemCode.NotAllowed,
            messageKey: 'ComboInsideCombo',
          });
        } else if (seen.has(variantId)) {
          fields.push({
            field,
            problem: FieldProblemCode.NotAllowed,
            messageKey: 'ComboPartTwice',
          });
        }
        seen.add(variantId);
      });
      const measured = part.variantIds.every((variantId) => {
        const unit = found.get(variantId)?.stockUnit;
        return unit !== undefined && MEASURED_STOCK_UNITS.includes(unit);
      });
      const whole = Number.isInteger(part.quantity);
      if (!whole && (!measured || part.variantIds.length > 1)) {
        fields.push({
          field: `parts.${String(index)}.quantity`,
          problem: FieldProblemCode.NotWholeNumber,
          messageKey: 'ComboPartWhole',
        });
      }
    });
    if (fields.length > 0) throw new FieldsError(fields);
    return parts.map((part) => ({
      quantity: part.quantity.toFixed(3),
      variantIds: part.variantIds,
    }));
  }

  write(
    tx: Transaction,
    tenantId: string,
    comboId: string,
    parts: ComboPartValues[],
  ): Promise<void> {
    return this.store.replaceParts(tx, tenantId, comboId, parts);
  }

  /** PRD-18: a duplicated combo has the same parts. */
  async copy(tx: Transaction, tenantId: string, fromId: string, toId: string): Promise<void> {
    const parts = await this.store.listParts(tx, tenantId, [fromId]);
    await this.store.replaceParts(
      tx,
      tenantId,
      toId,
      parts.map((part) => ({ quantity: part.quantity, variantIds: part.variantIds })),
    );
  }

  /** The combo's parts as its editor shows them: each variant with its product's name and its options. */
  async viewsOf(tx: Transaction, tenantId: string, comboId: string): Promise<ComboPartView[]> {
    const parts = await this.store.listParts(tx, tenantId, [comboId]);
    const ids = [...new Set(parts.flatMap((part) => part.variantIds))];
    const variants = new Map(
      (await this.store.findPartVariants(tx, tenantId, ids)).map((row) => [row.variantId, row]),
    );
    const labels = await this.store.variantLabels(tx, tenantId, ids);
    return parts.map((part) => ({
      position: part.position,
      quantity: part.quantity,
      variants: part.variantIds.flatMap((variantId) => {
        const row = variants.get(variantId);
        if (!row) return [];
        return [
          {
            variantId,
            productId: row.productId,
            productName: row.productName,
            label: labels.get(variantId) ?? '',
            available: !row.retired && !row.productDeleted,
          },
        ];
      }),
    }));
  }

  /** CMB-08, PRD-13: the combos any of these variants is a part of. */
  usedBy(tx: Transaction, tenantId: string, variantIds: string[]): Promise<ComboUseRow[]> {
    return this.store.combosUsingVariants(tx, tenantId, variantIds);
  }
}
