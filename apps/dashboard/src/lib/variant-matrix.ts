import {
  AttributeDataType,
  AttributeRole,
  DeliveryMode,
  MAX_VARIANT_ATTRIBUTES,
  MAX_VARIANTS_PER_PRODUCT,
  type UnitKind,
} from '@lytronix/validators';
import type { ProductAttribute, ProductDetail, UsedOption } from '@/types/product';
import { NO_BATCH, openingExtras, type OpeningBatch, type SerialLine } from './opening';

/** An attribute that splits the product into variants (ATR-04), with the options it uses, in their order. */
export interface SplitAttribute {
  attributeId: string;
  name: string;
  dataType: AttributeDataType;
  unitKind: UnitKind | null;
  options: UsedOption[];
}

/** One variant as the table holds it while it is typed (ATR-05, ATR-17, INV-24). */
export interface VariantRow {
  /** One option of each splitting attribute, in the attributes' order. */
  optionIds: string[];
  /** The variant it is once saved; null for one this edit makes. */
  id: string | null;
  /** Its own price as typed; empty to sell at the product's price. */
  price: string;
  sku: string;
  /** A new product's stock already on the shelf, as typed (INV-03). */
  openingStock: string;
  /** INV-12, INV-10: on a new batch-tracked product, the batch that stock is, with what each unit cost. */
  openingBatch: OpeningBatch;
  /** INV-14, INV-23: on a new serial-numbered product, the serials of that stock's units, each checked. */
  openingSerials: SerialLine[];
  /** INV-24: how much of the shared stock one of it uses, as typed. */
  packAmount: string;
  /** ATR-05, ATR-13 (the variant sheet, Part 15): its own barcode, weight and delivery charge; empty follows the
   * product. */
  barcode: string;
  weightKg: string;
  deliveryCharge: string;
  /** PRD-16: whether its charge grows with its weight; null follows the product. */
  adjustByWeight: boolean | null;
  /** Whether it is on sale. */
  active: boolean;
}

/** An attribute that describes the product, with its value as typed, or is asked when ordering (ATL-02, ATR-08). */
export interface Description {
  attributeId: string;
  name: string;
  dataType: AttributeDataType;
  unitKind: UnitKind | null;
  role: AttributeRole.Informational | AttributeRole.CapturedAtOrder;
  optionIds: string[];
  /** The chosen options' values, in the order of `optionIds`, so the card can say them. */
  optionValues: string[];
  text: string;
  /** A number in its unit kind's base unit (UOM-02), as typed. */
  number: string;
  bool: boolean | null;
}

/** Part 14: the table shows this many variants, then "Show all". */
export const SHOWN_VARIANTS = 6;

/** A combination's key: its options, whatever the attributes' order (ATL-04 sorts its pairs the same way). */
export const keyOf = (optionIds: readonly string[]): string => [...optionIds].sort().join('&');

/** ATR-04: how many variants the options make; one default variant with no splitting attribute. */
export function variantCount(splits: readonly SplitAttribute[]): number {
  return splits.reduce((count, split) => count * split.options.length, 1);
}

/** ATR-14: past 100 variants nothing can be saved until options go. */
export const overLimit = (splits: readonly SplitAttribute[]): boolean =>
  variantCount(splits) > MAX_VARIANTS_PER_PRODUCT;

/** ATR-14: a 4th splitting attribute is refused. */
export const splitsFull = (splits: readonly SplitAttribute[]): boolean =>
  splits.length >= MAX_VARIANT_ATTRIBUTES;

/** Every combination of the options, the first attribute's outermost, as the server plans them. */
export function combinations(splits: readonly SplitAttribute[]): string[][] {
  if (splits.length === 0 || overLimit(splits)) return [];
  return splits.reduce<string[][]>(
    (all, split) => all.flatMap((ids) => split.options.map((option) => [...ids, option.id])),
    [[]],
  );
}

export const blankRow = (optionIds: string[]): VariantRow => ({
  optionIds,
  id: null,
  price: '',
  sku: '',
  openingStock: '',
  openingBatch: NO_BATCH,
  openingSerials: [],
  packAmount: '',
  barcode: '',
  weightKg: '',
  deliveryCharge: '',
  adjustByWeight: null,
  active: true,
});

/**
 * The rows for the options as they now stand: a combination already in the table keeps what was typed in it, one the
 * saved product has comes back as it was (an option taken out and put back), and a new one starts blank.
 */
export function reconcile(
  splits: readonly SplitAttribute[],
  rows: readonly VariantRow[],
  saved: readonly VariantRow[],
): VariantRow[] {
  const typed = new Map(rows.map((row) => [keyOf(row.optionIds), row]));
  const stored = new Map(saved.map((row) => [keyOf(row.optionIds), row]));
  return combinations(splits).map((optionIds) => {
    const key = keyOf(optionIds);
    const found = typed.get(key) ?? stored.get(key);
    return found ? { ...found, optionIds } : blankRow(optionIds);
  });
}

/**
 * ATR-16: the option sets offered for an attribute -- those sharing a value with its options, or every set while it
 * has none -- so sizes are not offered for a colour.
 */
export function setsFor<T extends { options: readonly string[] }>(
  options: readonly { value: string }[],
  sets: readonly T[],
): T[] {
  const values = new Set(options.map((option) => option.value.toLowerCase()));
  return sets.filter(
    (set) => values.size === 0 || set.options.some((value) => values.has(value.toLowerCase())),
  );
}

/** The column Fill all fills (ATR-17). */
export type FillColumn = 'price' | 'openingStock';

/** ATR-17: one value in every row, or in the rows of one option; each cell stays editable after. */
export function fillAll(
  rows: readonly VariantRow[],
  column: FillColumn,
  value: string,
  optionId: string | null,
): VariantRow[] {
  return rows.map((row) =>
    optionId === null || row.optionIds.includes(optionId) ? { ...row, [column]: value } : row,
  );
}

/** The table's rows from a saved product, in the server's order. */
export function rowsOf(product: ProductDetail): VariantRow[] {
  if (product.variantAttributes.length === 0) return [];
  return product.variants.map(rowOf);
}

/** One saved variant as the table holds it. */
export function rowOf(variant: ProductDetail['variants'][number]): VariantRow {
  const typed = (stored: string | null) => (stored === null ? '' : String(Number(stored)));
  return {
    optionIds: variant.optionIds,
    id: variant.id,
    price: typed(variant.price),
    sku: variant.sku ?? '',
    openingStock: '',
    openingBatch: NO_BATCH,
    openingSerials: [],
    packAmount: typed(variant.packAmount),
    barcode: variant.barcode ?? '',
    weightKg: typed(variant.weightKg),
    deliveryCharge: typed(variant.deliveryCharge),
    adjustByWeight:
      variant.deliveryMode === null ? null : variant.deliveryMode === DeliveryMode.Adjustable,
    active: variant.active,
  };
}

/** The splitting attributes of a saved product, with the options its live variants use. */
export function splitsOf(product: ProductDetail): SplitAttribute[] {
  return product.variantAttributes.map((attribute) => ({
    attributeId: attribute.attributeId,
    name: attribute.name,
    dataType: attribute.dataType,
    unitKind: attribute.unitKind,
    options: attribute.options,
  }));
}

export function descriptionOf(attribute: ProductAttribute): Description {
  return {
    attributeId: attribute.attributeId,
    name: attribute.name,
    dataType: attribute.dataType,
    unitKind: attribute.unitKind,
    role: attribute.role,
    optionIds: attribute.optionIds,
    optionValues: attribute.optionValues,
    text: attribute.textValue ?? '',
    number: attribute.numberValue === null ? '' : String(Number(attribute.numberValue)),
    bool: attribute.boolValue,
  };
}

/** Typed text as the server takes it: trimmed, or null when empty. */
const textOf = (typed: string): string | null => (typed.trim() === '' ? null : typed.trim());

/** A typed amount as the server takes it: a number, or nothing when the cell is empty. */
const amountOf = (typed: string): number | undefined =>
  typed.trim() === '' ? undefined : Number(typed.trim());

/** ATR-11: the splitting attributes and the options each uses, as the server takes them. */
export function splitsBody(splits: readonly SplitAttribute[]) {
  return splits.map((split) => ({
    attributeId: split.attributeId,
    optionIds: split.options.map((option) => option.id),
  }));
}

/**
 * ATR-05, ATR-17, INV-24: each variant's own price (null to sell at the product's) and SKU; on a product sharing its
 * stock, how much each uses; on a new one, the stock already on the shelf with its batch or its serials (packs, on a
 * shared stock, are opened through the shared stock instead).
 */
export function variantsBody(
  rows: readonly VariantRow[],
  options: { shared: boolean; opening: boolean; batch: boolean; serial: boolean },
) {
  return rows.map((row) => {
    const opening = options.opening && !options.shared ? amountOf(row.openingStock) : undefined;
    const pack = options.shared ? amountOf(row.packAmount) : undefined;
    return {
      optionIds: row.optionIds,
      price: amountOf(row.price) ?? null,
      sku: textOf(row.sku),
      barcode: textOf(row.barcode),
      weightKg: amountOf(row.weightKg) ?? null,
      deliveryCharge: amountOf(row.deliveryCharge) ?? null,
      deliveryMode:
        row.adjustByWeight === null
          ? null
          : row.adjustByWeight
            ? DeliveryMode.Adjustable
            : DeliveryMode.Default,
      active: row.active,
      ...(opening === undefined ? {} : { openingStock: opening }),
      ...openingExtras(opening, row.openingBatch, row.openingSerials, options),
      ...(pack === undefined ? {} : { packAmount: pack }),
    };
  });
}

/** ATL-02, ATR-08: each description with the value its type takes; empty is allowed (ATR-03), an asked one has none. */
export function descriptionsBody(descriptions: readonly Description[]) {
  return descriptions.map((each) => {
    const base = { attributeId: each.attributeId, role: each.role };
    if (each.role === AttributeRole.CapturedAtOrder) return base;
    switch (each.dataType) {
      case AttributeDataType.EnumSingle:
      case AttributeDataType.EnumMulti:
        return each.optionIds.length > 0 ? { ...base, optionIds: each.optionIds } : base;
      case AttributeDataType.NumberWithUnit:
        return amountOf(each.number) === undefined
          ? base
          : { ...base, numberValue: Number(each.number) };
      case AttributeDataType.Text:
        return each.text.trim() === '' ? base : { ...base, textValue: each.text.trim() };
      case AttributeDataType.Boolean:
        return each.bool === null ? base : { ...base, boolValue: each.bool };
    }
  });
}

/** What a describing card says on its right: the value as written, or nothing yet. */
export function describedValue(
  each: Description,
  words: { yes: string; no: string; measure: (value: string) => string },
): string | null {
  switch (each.dataType) {
    case AttributeDataType.EnumSingle:
    case AttributeDataType.EnumMulti:
      return each.optionValues.length > 0 ? each.optionValues.join(', ') : null;
    case AttributeDataType.NumberWithUnit:
      return each.number === '' ? null : words.measure(each.number);
    case AttributeDataType.Text:
      return each.text.trim() === '' ? null : each.text.trim();
    case AttributeDataType.Boolean:
      return each.bool === null ? null : each.bool ? words.yes : words.no;
  }
}

/** The roles an attribute of this type can take on a product, and why another cannot (ATL-02, ATR-08, ATR-14). */
export type RoleRefusal = 'needsOptions' | 'textOrNumber' | 'full';

export function roleRefusals(
  dataType: AttributeDataType,
  splitting: number,
): Partial<Record<AttributeRole, RoleRefusal>> {
  const refusals: Partial<Record<AttributeRole, RoleRefusal>> = {};
  if (dataType !== AttributeDataType.EnumSingle && dataType !== AttributeDataType.NumberWithUnit) {
    refusals[AttributeRole.VariantDefining] = 'needsOptions';
  } else if (splitting >= MAX_VARIANT_ATTRIBUTES) {
    refusals[AttributeRole.VariantDefining] = 'full';
  }
  if (dataType !== AttributeDataType.Text && dataType !== AttributeDataType.NumberWithUnit) {
    refusals[AttributeRole.CapturedAtOrder] = 'textOrNumber';
  }
  return refusals;
}
