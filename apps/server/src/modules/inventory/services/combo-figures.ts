import type { ComboPartStockRow } from '@lytronix/db';
import { StockState, StockTracking } from '@lytronix/validators';
import { milli, packsOf, variantState } from './stock-state';

// CMB-02, CMB-06 to CMB-08 (Phase 4 Slice 4.5): what a combo's parts make of it -- how many can be made, what keeps it
// out of stock, the saving it shows and its weight. Pure, so the ledger's state and the dashboard's figures agree.

/** Why a combo cannot be made, naming the part (CMB-08: never a silent change). */
export interface ComboIssue {
  position: number;
  productName: string;
  /** A fixed part's variant is archived, retired or deleted; a choice part has no variant left on sale. */
  reason: 'part_unavailable' | 'no_choice_left';
}

export interface ComboFigures {
  /** How many whole combos the parts make now; null when no part is counted (made to order). */
  canMake: number | null;
  issues: ComboIssue[];
  /** CMB-06: what the parts cost bought apart, each choice part at its lowest-priced variant. */
  partsValue: string;
  /** CMB-07: the parts' weight, each choice part at its heaviest variant; null when any part has none. */
  weightKg: string | null;
}

/** A variant still offered: its product live and on sale, the variant itself on sale and not retired. */
function isLive(row: ComboPartStockRow): boolean {
  return row.productActive && !row.productDeleted && row.variantActive && !row.variantRetired;
}

/** CMB-02, CMB-09: the variant's whole units free to sell; null when its stock is not counted, so it never limits. */
export function unitsOf(row: ComboPartStockRow): number | null {
  if (!isLive(row)) return 0;
  if (row.stockTracking !== StockTracking.Tracked) return null;
  if (row.sharedStock) return packsOf(row.poolAvailable ?? '0', row.packAmount ?? '0');
  return Math.floor(Math.max(milli(row.available), 0) / 1000);
}

/** Each combo's figures, from every allowed variant of its parts (`ComboRepository.listPartStock`). */
export function comboFigures(rows: ComboPartStockRow[]): Map<string, ComboFigures> {
  const byCombo = new Map<string, Map<number, ComboPartStockRow[]>>();
  for (const row of rows) {
    const parts = byCombo.get(row.comboProductId) ?? new Map<number, ComboPartStockRow[]>();
    parts.set(row.position, [...(parts.get(row.position) ?? []), row]);
    byCombo.set(row.comboProductId, parts);
  }
  const figures = new Map<string, ComboFigures>();
  for (const [comboId, parts] of byCombo) {
    let canMake: number | null = null;
    const issues: ComboIssue[] = [];
    let value = 0;
    let weight: number | null = 0;
    for (const [position, variants] of [...parts].sort(([a], [b]) => a - b)) {
      const first = variants[0];
      if (!first) continue;
      const per = milli(first.quantity);
      const live = variants.filter(isLive);
      if (live.length === 0) {
        issues.push({
          position,
          productName: first.productName,
          reason: variants.length === 1 ? 'part_unavailable' : 'no_choice_left',
        });
      }
      const units = live.map(unitsOf);
      if (!units.includes(null)) {
        const total = (units as number[]).reduce((sum, each) => sum + each, 0);
        const made = Math.floor((total * 1000) / per);
        canMake = canMake === null ? made : Math.min(canMake, made);
      }
      const priced = live.length > 0 ? live : variants;
      value += (Math.min(...priced.map((row) => milli(row.price))) * per) / 1000;
      const weights = priced.map((row) => (row.weightKg === null ? null : milli(row.weightKg)));
      weight =
        weight === null || weights.includes(null)
          ? null
          : weight + (Math.max(...(weights as number[])) * per) / 1000;
    }
    if (issues.length > 0) canMake = 0;
    figures.set(comboId, {
      canMake,
      issues,
      partsValue: (Math.round(value) / 1000).toFixed(2),
      weightKg: weight === null ? null : (Math.round(weight) / 1000).toFixed(3),
    });
  }
  return figures;
}

/** CMB-02: the combo's public state -- out with any issue, in when nothing limits it, else by its threshold. */
export function comboState(figures: ComboFigures | undefined, threshold: string): StockState {
  if (!figures || figures.issues.length > 0) return StockState.Out;
  if (figures.canMake === null) return StockState.In;
  return variantState(String(figures.canMake), threshold);
}

/** CMB-06: "You save ৳X" -- the parts bought apart less the combo's price, shown only when positive. */
export function comboSaving(figures: ComboFigures | undefined, price: string): string | null {
  if (!figures) return null;
  const saving = milli(figures.partsValue) - milli(price);
  return saving > 0 ? (saving / 1000).toFixed(2) : null;
}
