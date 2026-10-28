import { StockUnit } from '@lytronix/validators';
import type { PurchaseLine } from '@/api/purchases';
import type { Purchase, PurchaseItem, PurchaseReceipt } from '@/types/purchasing';
import type { UnitQuantity } from '@/types/stock';

/** A typed amount, a whole or two-decimal number. */
export const AMOUNT = /^\d+(\.\d+)?$/;

/** One item as the Order sheet and an editable purchase hold it while it is typed. */
export interface LineDraft {
  variantId: string;
  /** "Cotton T-shirt · M · Black", as the purchase names it. */
  name: string;
  quantity: string;
  /** Empty is not known. */
  cost: string;
}

/** A purchase's supplier as picked or typed: one of the shop's by its id, or a name typed (found or made); '' is none. */
export interface SupplierValue {
  id: string | null;
  name: string;
}

/** The supplier as a purchase sends it: by its id, by the name typed, or none. */
export function supplierBody(value: SupplierValue): {
  supplierId?: string | null;
  supplierName?: string;
} {
  if (value.id !== null) return { supplierId: value.id };
  const name = value.name.trim();
  return name === '' ? { supplierId: null } : { supplierName: name };
}

/** A typed quantity above nothing. */
export const quantityOk = (typed: string): boolean =>
  AMOUNT.test(typed.trim()) && Number(typed) > 0;

/** A typed cost, or none (not known). */
export const costOk = (typed: string): boolean => typed.trim() === '' || AMOUNT.test(typed.trim());

/** Every line can be sent, and there is one at least (PUR-02). */
export const linesOk = (lines: readonly LineDraft[]): boolean =>
  lines.length > 0 && lines.every((line) => quantityOk(line.quantity) && costOk(line.cost));

/** One line changed among the rest. */
export const withLine = (
  lines: readonly LineDraft[],
  variantId: string,
  change: Partial<LineDraft>,
): LineDraft[] =>
  lines.map((line) => (line.variantId === variantId ? { ...line, ...change } : line));

/** The lines as a purchase sends them; a cost cleared is not known. */
export const linesBody = (lines: readonly LineDraft[]): PurchaseLine[] =>
  lines.map((line) => ({
    variantId: line.variantId,
    quantity: Number(line.quantity.trim()),
    unitCost: line.cost.trim() === '' ? null : Number(line.cost.trim()),
  }));

/** A saved purchase's items as lines to edit, each named by `nameOf`. */
export const draftsOf = (
  purchase: Purchase,
  nameOf: (item: PurchaseItem) => string,
): LineDraft[] =>
  purchase.items.map((item) => ({
    variantId: item.variantId,
    name: nameOf(item),
    quantity: String(Number(item.quantityOrdered)),
    cost: item.unitCost === undefined || item.unitCost === null ? '' : String(Number(item.unitCost)),
  }));

/** The lines' total at the costs known, and how many have none (the prototype's "Total, at known costs"). */
export function totalOf(lines: readonly LineDraft[]): { total: number; unknown: number } {
  let total = 0;
  let unknown = 0;
  for (const line of lines) {
    if (line.cost.trim() === '' || !quantityOk(line.quantity)) unknown += 1;
    else total += Number(line.quantity) * Number(line.cost);
  }
  return { total: Math.round(total * 100) / 100, unknown };
}

/** UOM-01: amounts summed in each unit, never across units; nothing left out. */
function byUnit(amounts: Iterable<[StockUnit, number]>): UnitQuantity[] {
  const sums = new Map<StockUnit, number>();
  for (const [unit, quantity] of amounts) sums.set(unit, (sums.get(unit) ?? 0) + quantity);
  return [...sums]
    .filter(([, quantity]) => quantity > 0)
    .map(([unit, quantity]) => ({ unit, quantity: String(Math.round(quantity * 1000) / 1000) }));
}

/** An item's unit: a product deleted for good keeps none, and counts in pieces. */
export const unitOf = (item: PurchaseItem | undefined): StockUnit =>
  item?.stockUnit ?? StockUnit.Piece;

/** What the items still wait for, in each unit. */
export const outstandingOf = (items: readonly PurchaseItem[]): UnitQuantity[] =>
  byUnit(items.map((item) => [unitOf(item), Number(item.outstanding)]));

/** One delivery's accepted and rejected units, in each unit. */
export function receiptTotals(
  purchase: Pick<Purchase, 'items'>,
  receipt: PurchaseReceipt,
): { accepted: UnitQuantity[]; rejected: UnitQuantity[] } {
  const unit = (itemId: string) => unitOf(purchase.items.find((item) => item.id === itemId));
  return {
    accepted: byUnit(receipt.items.map((line) => [unit(line.itemId), Number(line.accepted)])),
    rejected: byUnit(receipt.items.map((line) => [unit(line.itemId), Number(line.rejected)])),
  };
}
