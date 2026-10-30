import { Inject, Injectable } from '@nestjs/common';
import type { ComboPartStockRow, LineAttributeSnapshot, Transaction } from '@lytronix/db';
import {
  FieldProblemCode,
  ProductKind,
  ServerFieldProblemCode,
  type CreateOrderInput,
} from '@lytronix/validators';
import { ApiError, FieldsError, type InvalidField } from '../../../common/api-error';
import type { OrderableVariant } from '../../catalogue/types/catalogue';
import { milli, quantityOf } from '../../inventory/services/stock-state';
import type { OrderStore } from '../ports/order-store';
import { ORDER_STORE } from '../tokens';
import type { OrderLineRecord } from '../types/orders';
import { OrderPricing } from './order-pricing';

/** An item as ordered, and the line it keeps when an order is edited (ORD-11). */
interface ComboEntry {
  item: CreateOrderInput['items'][number];
  kept: OrderLineRecord | null;
}

/** CMB-03, CMB-04: one component of a combo line -- a part's variant, its units in one combo, and its snapshot. */
export interface PlannedComponent {
  partPosition: number;
  productId: string;
  variantId: string;
  productName: string;
  attributeValues: LineAttributeSnapshot[];
  quantity: string;
}

/** What a line holds: its own variant, or a combo's components (PRD-07, INV-15, CMB-03). */
export interface LineHold {
  orderLineId: string;
  variantId: string;
  quantity: string;
}

/** A variant still offered: its product live and on sale, the variant itself on sale and not retired. */
function isLive(row: ComboPartStockRow): boolean {
  return row.productActive && !row.productDeleted && row.variantActive && !row.variantRetired;
}

/**
 * CMB-01, CMB-03 to CMB-05 (Phase 4 Slice 4.5): a combo on an order. Each new combo item becomes its components -- a
 * fixed part's one variant, a choice part's variants as picked, one per unit of the part in one combo -- and a line of
 * N combos holds N of each. Different picks go on separate lines, so a combo always comes back whole (agreed
 * 2026-10-30). A line kept through an edit keeps the components it was ordered with (agreed 2026-10-30).
 */
@Injectable()
export class OrderCombos {
  constructor(
    @Inject(ORDER_STORE) private readonly store: OrderStore,
    @Inject(OrderPricing) private readonly pricing: OrderPricing,
  ) {}

  /** Each new combo item's components, by the item's index; refused field by field when its choices do not fit. */
  async plan(
    tx: Transaction,
    tenantId: string,
    entries: ComboEntry[],
    variants: ReadonlyMap<string, OrderableVariant>,
  ): Promise<Map<number, PlannedComponent[]>> {
    const problems: InvalidField[] = [];
    const combos = entries.flatMap(({ item, kept }, index) => {
      const variant = variants.get(item.variantId);
      const combo = variant?.kind === ProductKind.Combo;
      if (item.choices !== undefined && (kept !== null || !combo)) {
        problems.push({
          field: `items.${String(index)}.choices`,
          problem: FieldProblemCode.NotAllowed,
          messageKey: 'ComboChoiceNotOffered',
        });
      }
      return combo && kept === null ? [{ index, item, variant }] : [];
    });
    if (combos.length === 0) {
      if (problems.length > 0) throw new FieldsError(problems);
      return new Map();
    }
    const rows = await this.store.listComboPartStock(tx, tenantId, [
      ...new Set(combos.map(({ variant }) => variant.productId)),
    ]);
    const picked = new Map<number, Map<string, { row: ComboPartStockRow; units: number }>>();
    for (const { index, item, variant } of combos) {
      const at = (field: string) => `items.${String(index)}.${field}`;
      const parts = new Map<number, ComboPartStockRow[]>();
      for (const row of rows.filter((each) => each.comboProductId === variant.productId)) {
        parts.set(row.position, [...(parts.get(row.position) ?? []), row]);
      }
      const picks = new Map<string, { row: ComboPartStockRow; units: number }>();
      const add = (row: ComboPartStockRow, units: number) => {
        const key = `${String(row.position)} ${row.variantId}`;
        picks.set(key, { row, units: (picks.get(key)?.units ?? 0) + units });
      };
      for (const [position, allowed] of [...parts].sort(([a], [b]) => a - b)) {
        const [first] = allowed;
        if (!first) continue;
        const per = milli(first.quantity);
        if (allowed.length === 1) {
          // CMB-08: a fixed part that cannot be had makes the combo unavailable, never something else.
          if (!isLive(first)) {
            throw new ApiError(
              'conflict',
              'ComboCannotBeMade',
              { productId: variant.productId, component: { productName: first.productName } },
              undefined,
              { combo: variant.productName },
            );
          }
          add(first, per);
          continue;
        }
        const choice = (item.choices ?? []).find((entry) => entry.part === position);
        const choiceAt = (item.choices ?? []).findIndex((entry) => entry.part === position);
        if (!choice || choice.variantIds.length * 1000 !== per) {
          problems.push({
            field: at('choices'),
            problem: FieldProblemCode.Required,
            messageKey: 'ComboChoiceNeeded',
            params: { combo: variant.productName },
          });
          continue;
        }
        choice.variantIds.forEach((variantId, unit) => {
          const row = allowed.find((each) => each.variantId === variantId);
          if (!row || !isLive(row)) {
            problems.push({
              field: at(`choices.${String(choiceAt)}.variantIds.${String(unit)}`),
              problem: ServerFieldProblemCode.NotFound,
              messageKey: 'ComboChoiceNotOffered',
            });
            return;
          }
          add(row, 1000);
        });
      }
      (item.choices ?? []).forEach((entry, choiceAt) => {
        if ((parts.get(entry.part)?.length ?? 0) < 2) {
          problems.push({
            field: at(`choices.${String(choiceAt)}.part`),
            problem: FieldProblemCode.NotAllowed,
            messageKey: 'ComboChoiceNotOffered',
          });
        }
      });
      if (parts.size === 0) {
        throw new ApiError(
          'conflict',
          'ComboCannotBeMade',
          { productId: variant.productId },
          undefined,
          { combo: variant.productName },
        );
      }
      picked.set(index, picks);
    }
    if (problems.length > 0) throw new FieldsError(problems);
    // CMB-04: each component as the line keeps it, read as any ordered variant is.
    const snapshots = await this.pricing.variantsWithin(
      tx,
      tenantId,
      [...picked.values()].flatMap((picks) => [...picks.values()].map(({ row }) => row.variantId)),
    );
    return new Map(
      [...picked].map(([index, picks]) => [
        index,
        [...picks.values()].map(({ row, units }) => {
          const snapshot = snapshots.get(row.variantId);
          return {
            partPosition: row.position,
            productId: row.productId,
            variantId: row.variantId,
            productName: snapshot?.productName ?? row.productName,
            attributeValues: snapshot?.attributes ?? [],
            quantity: quantityOf(units),
          };
        }),
      ]),
    );
  }

  /** CMB-04: the planned components stored with the lines just written, matched by their place on the order. */
  async write(
    tx: Transaction,
    tenantId: string,
    lines: readonly OrderLineRecord[],
    planned: ReadonlyMap<number, PlannedComponent[]>,
  ): Promise<void> {
    const rows = [...planned].flatMap(([position, components]) => {
      const line = lines.find((each) => each.position === position);
      if (!line) throw new Error('every planned combo line is written');
      return components.map((component) => ({ orderLineId: line.id, ...component }));
    });
    await this.store.insertComponents(tx, tenantId, rows);
  }

  /** PRD-07, INV-15, CMB-03: what each line holds -- a combo line its components times its combos, others themselves. */
  async holdsOf(
    tx: Transaction,
    tenantId: string,
    lines: readonly OrderLineRecord[],
  ): Promise<LineHold[]> {
    const components = await this.store.listComponents(
      tx,
      tenantId,
      lines.map((line) => line.id),
    );
    return lines.flatMap((line): LineHold[] => {
      const own = components.filter((component) => component.orderLineId === line.id);
      if (own.length === 0) {
        return line.variantId !== null
          ? [{ orderLineId: line.id, variantId: line.variantId, quantity: line.quantity }]
          : [];
      }
      const units = new Map<string, number>();
      for (const component of own) {
        if (component.variantId === null) continue;
        units.set(
          component.variantId,
          (units.get(component.variantId) ?? 0) + milli(component.quantity),
        );
      }
      return [...units].map(([variantId, perCombo]) => ({
        orderLineId: line.id,
        variantId,
        quantity: quantityOf((perCombo * milli(line.quantity)) / 1000),
      }));
    });
  }

  /**
   * CMB-03: a component short of stock refuses the whole order naming its combo; the details name the component, for
   * the dashboard's message. Anything else passes as it was.
   */
  async naming<T>(
    holds: readonly LineHold[],
    lines: readonly OrderLineRecord[],
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (!(error instanceof ApiError) || error.messageKey !== 'NotEnoughStockForOrder')
        throw error;
      const variantId = error.details['variantId'];
      const hold = holds.find(
        (each) =>
          each.variantId === variantId && lines.some((line) => line.id === each.orderLineId),
      );
      const line = lines.find((each) => each.id === hold?.orderLineId);
      if (!line || line.variantId === variantId) throw error;
      throw new ApiError(
        'conflict',
        'NotEnoughStockForCombo',
        { productId: line.productId, variantId: line.variantId, component: error.details },
        undefined,
        { combo: line.productName },
      );
    }
  }
}
