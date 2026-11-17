import { MEASURED_STOCK_UNITS, type StockUnit } from '@lytronix/validators';

// The fixes PR (the owner's, 2026-11-14), item 7: a saved product's quick "Add stock" box on each variant row. Plain
// functions, so the tests read them too.

/** What is wrong with a box: not a number of 0 or more, or a part of a piece in a unit that can't be split. */
export type QuickProblem = 'negative' | 'whole';

/** One variant's stock to add, as the batch route takes it (`POST /products/:id/stock-additions`). */
export interface QuickAddition {
  variantId: string;
  quantity: number;
}

/**
 * The boxes, read: each variant with a number above 0 to add, and each box that can't be added. An empty box, or 0, adds
 * nothing. Pieces, packs, dozens and boxes come whole; kg, grams, litres and ml may be split.
 */
export function quickAdditions(
  values: Readonly<Record<string, string>>,
  unit: StockUnit,
): { additions: QuickAddition[]; problems: Record<string, QuickProblem> } {
  const additions: QuickAddition[] = [];
  const problems: Record<string, QuickProblem> = {};
  for (const [variantId, raw] of Object.entries(values)) {
    const text = raw.trim();
    if (text === '') continue;
    const quantity = Number(text);
    if (!Number.isFinite(quantity) || quantity < 0) {
      problems[variantId] = 'negative';
    } else if (!MEASURED_STOCK_UNITS.includes(unit) && !Number.isInteger(quantity)) {
      problems[variantId] = 'whole';
    } else if (quantity > 0) {
      additions.push({ variantId, quantity });
    }
  }
  return { additions, problems };
}

/** How much the boxes add in all, for the toast ("3 variants, 22 pcs"). */
export const quickTotal = (additions: readonly QuickAddition[]): number =>
  additions.reduce((sum, each) => sum + each.quantity, 0);
