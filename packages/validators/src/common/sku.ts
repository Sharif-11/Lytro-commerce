import { SKU_MAX_LENGTH } from './limits';

/**
 * PD-10, ATR-05 (amended 2026-11-14, the owner): the SKU a variant saved without one is given, for every product. The one
 * definition of the rule: the server fills it when a product or its variants are saved, and the product screen shows it
 * greyed in an empty SKU box.
 *
 * The product's initials, from the first three words of its link name (or of its name, before it has one) that start
 * with a Latin letter or a digit -- `irani-burka` gives `IB`, and a name with none gives `P`; then each part in capitals,
 * keeping letters, digits and dots: a design's part first (`D2`, autoSkuDesignPart), then the variant's other option
 * values in the product's order. `IB-D2-54`, `PJ-S-WH`. When the shop already has it, the first free of `-2` to `-99`
 * (autoSkuChoices).
 */
export const AUTO_SKU_LAST_SUFFIX = 99;

/** Leaves room for the longest suffix inside the SKU's maximum length. */
const AUTO_SKU_BASE_MAX_LENGTH = SKU_MAX_LENGTH - `-${String(AUTO_SKU_LAST_SUFFIX)}`.length;

export function autoSkuOf(name: string, parts: readonly string[]): string {
  const initials =
    name
      .split(/[^\p{L}\p{M}\p{N}]+/u)
      .filter((word) => /^[a-z0-9]/i.test(word))
      .slice(0, 3)
      .map((word) => word.charAt(0).toUpperCase())
      .join('') || 'P';
  const rest = parts
    .map((part) => part.toUpperCase().replace(/[^A-Z0-9.]/g, ''))
    .filter((part) => part !== '');
  return [initials, ...rest].join('-').slice(0, AUTO_SKU_BASE_MAX_LENGTH);
}

/** PD-10: a design's part of its variants' SKUs, by its number, which never changes. */
export function autoSkuDesignPart(designNumber: number): string {
  return `D${String(designNumber)}`;
}

/**
 * PD-10: the SKUs tried in turn for one variant, from the `from`th to the `to`th: the first is the SKU itself, the nth
 * the SKU with `-n`.
 */
export function autoSkuChoices(sku: string, from = 1, to = AUTO_SKU_LAST_SUFFIX): string[] {
  const choices: string[] = [];
  for (let n = Math.max(1, from); n <= Math.min(to, AUTO_SKU_LAST_SUFFIX); n += 1) {
    choices.push(n === 1 ? sku : `${sku}-${String(n)}`);
  }
  return choices;
}
