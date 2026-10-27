import { UnitKind } from '@lytronix/validators';

/**
 * UOM-02: a number-with-unit value is kept in its kind's base unit -- grams, millilitres, a count -- so values sort and
 * compare as numbers. The editor writes it in the larger unit from a thousand up ("5 kg", "500 g", "1.5 L").
 */
export type MeasureUnit = 'g' | 'kg' | 'ml' | 'l';

/** The units a kind is typed in, the base one first; a count has none. */
export const MEASURE_UNITS: Record<UnitKind, MeasureUnit[]> = {
  [UnitKind.Weight]: ['g', 'kg'],
  [UnitKind.Volume]: ['ml', 'l'],
  [UnitKind.Count]: [],
};

const LARGE: Partial<Record<UnitKind, MeasureUnit>> = {
  [UnitKind.Weight]: 'kg',
  [UnitKind.Volume]: 'l',
};

/** A stored value as it reads: its number, and the unit to name after it (none for a count). */
export function measureOf(
  value: string,
  kind: UnitKind | null,
): { amount: string; unit: MeasureUnit | null } {
  const base = Number(value);
  if (kind === null || !Number.isFinite(base)) return { amount: value, unit: null };
  const units = MEASURE_UNITS[kind];
  const large = LARGE[kind];
  if (large && base >= 1000) return { amount: trim(base / 1000), unit: large };
  return { amount: trim(base), unit: units[0] ?? null };
}

/** A typed amount in a unit as the base value the server keeps; null when it is not a number above nothing. */
export function baseValueOf(amount: string, unit: MeasureUnit | null): string | null {
  const typed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(typed)) return null;
  const number = Number(typed);
  if (number <= 0) return null;
  return trim(unit === 'kg' || unit === 'l' ? number * 1000 : number);
}

/** At most three decimals, and none that say nothing ("5", "2.5", "0.125"). */
function trim(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
