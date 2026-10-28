import { useTranslation } from 'react-i18next';
import { StockState, StockTracking } from '@lytronix/validators';
import { splitsOf } from '@/lib/variant-matrix';
import type { StockPageProduct } from '@/types/stock';
import type { StockedProduct } from '../product/stock-holders';
import type { StockKind } from '../product/variants-card';
import { useVariantWords } from '../product/variant-words';

/** Past this many variants, a product shows its first few and any low or out, the rest behind "+n more" (design v3.7). */
const SHOWN_IN_FULL = 4;
const SHOWN_FIRST = 2;

/**
 * One row of the Stock page (the prototype's `stockRow`): a variant still on sale or still holding stock, or a product's
 * shared stock (INV-24), with what it can sell, what waits to ship, what a placed purchase brings and what is on hand.
 */
export interface StockLine {
  variantId: string;
  /** Its options' values ("M · Black"); "—" for a product with none; "Shared stock". */
  name: string;
  canSell: string;
  waiting: string;
  coming: string;
  onHand: string;
  state: StockState;
  /** INV-14: units held with no serial yet. */
  missing: number;
  /** INV-10: for someone who may see costs; null is unknown. */
  avgCost: string | null;
}

/** A product's rows, named as its own screen names its variants. */
export function useStockLines(): (product: StockPageProduct) => StockLine[] {
  const { t } = useTranslation('shop');
  const words = useVariantWords();
  return (product) => {
    if (product.shared) {
      const shared = product.shared;
      return [
        {
          variantId: shared.variantId,
          name: t('sharedStockName'),
          canSell: shared.available,
          waiting: shared.reserved,
          coming: shared.incoming,
          onHand: shared.onHand,
          state: shared.state,
          missing: 0,
          avgCost: shared.avgCost ?? null,
        },
      ];
    }
    const splits = splitsOf({ variantAttributes: product.splits });
    return product.variants
      .filter((each) => !each.retired || Number(each.onHand ?? 0) > 0)
      .map((each) => ({
        variantId: each.variantId,
        name: each.optionIds.length > 0 ? words.variant(each.optionIds, splits) : '—',
        canSell: each.available,
        waiting: each.reserved ?? '0',
        coming: each.incoming ?? '0',
        onHand: each.onHand ?? '0',
        state: each.state,
        missing: each.missingSerials ?? 0,
        avgCost: each.avgCost ?? null,
      }));
  };
}

/** What the reused Stock card sheets read of a page's product. */
export const stockedOf = (product: StockPageProduct): StockedProduct => ({
  id: product.productId,
  name: product.name,
  variantAttributes: product.splits,
});

/** How a page's product keeps its stock, as the Stock card's sheets take it. */
export const kindOf = (product: StockPageProduct): StockKind => ({
  tracked: product.stockTracking === StockTracking.Tracked,
  batch: product.batchTracked,
  serial: product.serialTracked,
  format: product.serialFormat,
  unit: product.stockUnit,
});

/**
 * Design v3.7: a product wants seeing to when it is out or low, or a variant is though another keeps it in stock; the
 * others fold into "Stock is fine". Made to order counts no stock, so it never does.
 */
export const wantsSeeing = (product: StockPageProduct, lines: readonly StockLine[]): boolean =>
  product.stockTracking === StockTracking.Tracked &&
  (product.state !== StockState.In || lines.some((line) => line.state !== StockState.In));

/** Design v3.7: up to four rows show; past four, the first two and any low or out, the rest behind "+n more". */
export function shownLines(
  lines: readonly StockLine[],
  opened: boolean,
): { shown: StockLine[]; hidden: number } {
  if (opened || lines.length <= SHOWN_IN_FULL) return { shown: [...lines], hidden: 0 };
  const shown = lines.filter((line, at) => at < SHOWN_FIRST || line.state !== StockState.In);
  return { shown, hidden: lines.length - shown.length };
}

/** INV-10: a product's average cost, its rows' weighted by what each holds; null when none is known. */
export function averageCostOf(lines: readonly StockLine[]): number | null {
  const known = lines.filter((line) => line.avgCost !== null);
  if (known.length === 0) return null;
  const held = known.reduce((total, line) => total + Number(line.onHand), 0);
  if (held <= 0) {
    return known.reduce((total, line) => total + Number(line.avgCost), 0) / known.length;
  }
  return (
    known.reduce((total, line) => total + Number(line.avgCost) * Number(line.onHand), 0) / held
  );
}

/** What a product holds in all: its shared stock, or its rows together. */
export const heldOf = (lines: readonly StockLine[]): number =>
  lines.reduce((total, line) => total + Number(line.onHand), 0);

/** A row's name as a sheet's title or hint gives it: "Denim jacket · M", or the product's name alone. */
export const lineTitle = (product: StockPageProduct, line: StockLine): string =>
  line.name === '—' ? product.name : `${product.name} · ${line.name}`;
