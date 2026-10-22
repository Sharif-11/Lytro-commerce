import { StockUnit } from '@lytronix/validators';
import { sumQuantities } from '../../balance/services/money';
import type { UnitQuantity } from '../types/inventory';

const UNIT_ORDER: readonly StockUnit[] = Object.values(StockUnit);

/**
 * UOM-01, D3-9: amounts of stock added up unit by unit, never across units (a kilogram is not a piece), in the units'
 * own order. An amount with no unit -- a product since deleted for good -- is left out.
 */
export function unitTotals(
  amounts: readonly { unit: StockUnit | null; quantity: string }[],
): UnitQuantity[] {
  const byUnit = new Map<StockUnit, string[]>();
  for (const { unit, quantity } of amounts) {
    if (unit === null) continue;
    byUnit.set(unit, [...(byUnit.get(unit) ?? []), quantity]);
  }
  return UNIT_ORDER.filter((unit) => byUnit.has(unit)).map((unit) => ({
    unit,
    quantity: sumQuantities(byUnit.get(unit) ?? []),
  }));
}
