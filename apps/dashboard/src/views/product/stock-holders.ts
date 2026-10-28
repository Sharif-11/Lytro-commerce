import { useTranslation } from 'react-i18next';
import { splitsOf } from '@/lib/variant-matrix';
import type { ProductStock } from '@/types/attribute';
import type { ProductDetail } from '@/types/product';
import { useVariantWords } from './variant-words';

/**
 * What holds a product's stock, as its Stock card's sheets pick it (Part 18): each variant still on sale or still
 * holding stock, or, where the variants share one stock, that stock alone (INV-24) -- its packs hold none.
 */
export interface StockHolder {
  variantId: string;
  /** Its options' values ("M · Black"); the product's own name for one with no options; "Shared stock". */
  name: string;
  onHand: string;
  /** INV-14: on a serial-numbered product, how many units held have no serial yet. */
  missing: number;
  /** INV-10: its average cost, for someone who may see it; null is unknown. */
  avgCost: string | null;
}

export function useStockHolders(
  product: ProductDetail,
  stock: ProductStock | undefined,
): StockHolder[] {
  const { t } = useTranslation('shop');
  const words = useVariantWords();
  if (!stock) return [];
  if (stock.shared) {
    return [
      {
        variantId: stock.shared.variantId,
        name: t('sharedStockName'),
        onHand: stock.shared.onHand,
        missing: 0,
        avgCost: stock.shared.avgCost ?? null,
      },
    ];
  }
  const splits = splitsOf(product);
  return stock.variants
    .filter((each) => !each.retired || Number(each.onHand ?? 0) > 0)
    .map((each) => ({
      variantId: each.variantId,
      name: each.optionIds.length > 0 ? words.variant(each.optionIds, splits) : product.name,
      onHand: each.onHand ?? '0',
      missing: each.missingSerials ?? 0,
      avgCost: each.avgCost ?? null,
    }));
}

/** A held amount as the card and sheets write it: "54", or in a measured unit "232 kg". */
export function useAmountText(): (amount: string, unit: string) => string {
  const { t } = useTranslation('shop');
  return (amount, unit) => {
    const figure = String(Number(amount));
    return unit === 'piece' ? figure : `${figure} ${t(`su_${unit}`)}`;
  };
}
