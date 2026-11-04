import { MEASURED_STOCK_UNITS, StockUnit } from '@lytronix/validators/enums';

/** UOM-03: a stored quantity has at most three decimals. */
const DECIMALS = 1000;
const WHOLE_LIMIT = 99;

export interface QuantityRule {
  /** Whether a part of the unit can be ordered, so its number can be typed. */
  measured: boolean;
  /** How far + and − move it. */
  step: number;
  /** What the page opens on. */
  first: number;
  limit: number;
}

const WHOLE: QuantityRule = { measured: false, step: 1, first: 1, limit: WHOLE_LIMIT };

/**
 * LND-07, UOM-04: how much of a product can be ordered. A kg or a litre moves by half, g and ml by the hundred; anything
 * else, or a shared stock's whole packs (INV-24), is whole. A line from before this has no unit, and stays whole.
 */
export function quantityRule(unit: StockUnit | undefined, sharedStock = false): QuantityRule {
  if (unit === undefined || sharedStock || !MEASURED_STOCK_UNITS.includes(unit)) return WHOLE;
  return unit === StockUnit.Kg || unit === StockUnit.Liter
    ? { measured: true, step: 0.5, first: 1, limit: WHOLE_LIMIT }
    : { measured: true, step: 100, first: 100, limit: WHOLE_LIMIT * 1000 };
}

const rounded = (value: number): number => Math.round(value * DECIMALS) / DECIMALS;

/** + or −, kept to three decimals so that 0.1 + 0.2 stays 0.3, and never past the limit or down to nothing. */
export function stepped(value: number, by: number, rule: QuantityRule): number {
  const next = rounded(value + by);
  if (next <= 0) return value;
  return Math.min(rule.limit, next);
}

/** What the shopper typed, as a quantity; null while it isn't one: empty, none, too many decimals or past the limit. */
export function typedQuantity(text: string, rule: QuantityRule): number | null {
  const value = Number(text.trim());
  if (text.trim() === '' || !Number.isFinite(value) || value <= 0 || value > rule.limit)
    return null;
  return rounded(value) === value ? value : null;
}

/** LND-07: a cart's count is of lines' units, and 1.5 kg of rice is one thing in the bag. */
export const countedUnits = (unit: StockUnit | undefined, quantity: number): number =>
  quantityRule(unit).measured ? 1 : quantity;
