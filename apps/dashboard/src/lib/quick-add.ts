import { StockTracking } from '@lytronix/validators';
import type { ProductForm } from './product-form';
import { combinations, keyOf, type SplitAttribute, type VariantRow } from './variant-matrix';

// Quick add (TENANT-DASHBOARD-DESIGN §7.4b, the owner 2026-11-25): a new product's stock is one box, labelled স্টক and
// shared by every design and size by default (INV-24); the split, a box per design or a design × size grid, is one tap
// away. The box keeps what is typed in `sharedOpeningStock`; `quickBody` turns the form into what the server takes.

/** How the stock is asked for: none (made to order), one box, or split by design or by design × size. */
export type QuickStockMode = 'made' | 'one' | 'designs' | 'grid';

/** How many variants the designs and sizes make; a product with no splits is one. */
export const variantsOf = (form: Pick<ProductForm, 'splits'>): number =>
  form.splits.length === 0 ? 1 : combinations(form.splits).length;

/**
 * The stock box's mode: made to order has none; one variant, or the shared default, has one box; split, a box under
 * each design when only designs split it, else the grid.
 */
export function quickStockMode(
  form: Pick<ProductForm, 'splits' | 'settings'>,
  split: boolean,
  designAttributeId: string | null,
): QuickStockMode {
  if (form.settings.stockTracking !== StockTracking.Tracked) return 'made';
  if (!split || variantsOf(form) <= 1) return 'one';
  const onlyDesigns = form.splits.length === 1 && form.splits[0]?.attributeId === designAttributeId;
  return onlyDesigns ? 'designs' : 'grid';
}

/** What the shared box counts, for the hint under it: designs and sizes, or one of them. */
export function sharedWhat(
  form: Pick<ProductForm, 'splits'>,
  designAttributeId: string | null,
): 'designsSizes' | 'designs' | 'sizes' | null {
  if (variantsOf(form) <= 1) return null;
  const designs = form.splits.some(
    (split) => split.attributeId === designAttributeId && split.options.length > 1,
  );
  const others = form.splits.some(
    (split) => split.attributeId !== designAttributeId && split.options.length > 1,
  );
  return designs && others ? 'designsSizes' : designs ? 'designs' : 'sizes';
}

/** The variant row of these options, whatever their order. */
export const rowFor = (
  rows: readonly VariantRow[],
  optionIds: readonly string[],
): VariantRow | undefined => {
  const key = keyOf(optionIds);
  return rows.find((row) => keyOf(row.optionIds) === key);
};

/** A row's stock typed in a split box. */
export function withRowStock(
  rows: readonly VariantRow[],
  optionIds: readonly string[],
  openingStock: string,
): VariantRow[] {
  const key = keyOf(optionIds);
  return rows.map((row) => (keyOf(row.optionIds) === key ? { ...row, openingStock } : row));
}

/** The grid's rows and columns: the designs (or one row) by the other split's options (or one column). */
export function gridOf(
  splits: readonly SplitAttribute[],
  designAttributeId: string | null,
): {
  rows: { id: string | null; label: string }[];
  columns: { id: string | null; label: string }[];
} {
  const design = splits.find((split) => split.attributeId === designAttributeId);
  const other = splits.find((split) => split.attributeId !== designAttributeId);
  return {
    rows: design
      ? design.options.map((option) => ({ id: option.id, label: option.value }))
      : [{ id: null, label: '' }],
    columns: other
      ? other.options.map((option) => ({ id: option.id, label: option.value }))
      : [{ id: null, label: '' }],
  };
}

/** The options of one grid cell, as a row keys them. */
export const cellOptions = (rowId: string | null, columnId: string | null): string[] =>
  [rowId, columnId].filter((id): id is string => id !== null);

/**
 * What Save finds wrong with the stock before sending: the one box left empty (`pq-nostock`, which "০ রেখেই সেভ করুন"
 * lets through), or split boxes left empty, by the rows' keys.
 */
export function quickStockProblems(
  form: ProductForm,
  mode: QuickStockMode,
  zeroOk: boolean,
): { empty: boolean; cells: string[] } {
  if (mode === 'made') return { empty: false, cells: [] };
  if (mode === 'one') {
    return { empty: !zeroOk && form.sharedOpeningStock.trim() === '', cells: [] };
  }
  return {
    empty: false,
    cells: form.variants
      .filter((row) => row.openingStock.trim() === '')
      .map((row) => keyOf(row.optionIds)),
  };
}

/**
 * The form as the server takes it (createBody's input): one variant keeps the box as its own stock; several share it
 * (INV-24, a pack of one each); split, each row keeps its own. Made to order shares nothing.
 */
export function quickBody(form: ProductForm, mode: QuickStockMode): ProductForm {
  if (mode === 'made') {
    return { ...form, sharedStock: false, sharedOpeningStock: '', openingStock: '' };
  }
  const box = form.sharedOpeningStock.trim();
  if (mode === 'one' && variantsOf(form) <= 1) {
    return {
      ...form,
      sharedStock: false,
      openingStock: box,
      variants: form.variants.map((row) => ({ ...row, openingStock: box })),
    };
  }
  if (mode === 'one') {
    return {
      ...form,
      sharedStock: true,
      sharedOpeningStock: box,
      variants: form.variants.map((row) => ({
        ...row,
        packAmount: row.packAmount.trim() === '' ? '1' : row.packAmount,
      })),
    };
  }
  return { ...form, sharedStock: false, sharedOpeningStock: '' };
}

/** "সবগুলোতে একই": every split box takes the same number. */
export const sameForAll = (rows: readonly VariantRow[], value: string): VariantRow[] =>
  rows.map((row) => ({ ...row, openingStock: value }));

/** The total of the split boxes, typed so far. */
export const splitTotal = (rows: readonly VariantRow[]): number =>
  rows.reduce((sum, row) => sum + (Number(row.openingStock) || 0), 0);

/** Clothing and shoes-and-bags shops get "+ সাইজ যোগ করুন" (§7.4b); their number sizes differ. */
export function sizePreset(presetKey: string | null | undefined): 'clothing' | 'shoes' | null {
  if (presetKey === 'clothing') return 'clothing';
  if (presetKey === 'shoes_bags') return 'shoes';
  return null;
}

export const LETTER_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
/** Pants and blouses: 28 to 44 in steps of 2. */
export const CLOTHING_NUMBERS = [28, 30, 32, 34, 36, 38, 40, 42, 44].map(String);
/** Shoes: 36 to 45 (the owner approved question 6). */
export const SHOE_NUMBERS = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45].map(String);
