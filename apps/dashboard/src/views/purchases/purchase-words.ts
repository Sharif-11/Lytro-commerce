import { useTranslation } from 'react-i18next';
import { PurchaseStatus } from '@lytronix/validators';
import type { StatusTone } from '@/components/ui/status-tag';
import { splitsOf } from '@/lib/variant-matrix';
import type { Purchase, PurchaseItem } from '@/types/purchasing';
import type { UnitQuantity } from '@/types/stock';
import { useCountedText } from '../product/stock-holders';
import { useVariantWords } from '../product/variant-words';

/** A purchase's number as the shop says it ("PO-0007"); null for a draft (agreed in the 11.10 read). */
export const purchaseNumber = (number: number | null): string | null =>
  number === null ? null : `PO-${String(number).padStart(4, '0')}`;

/** Each status's chip: its tone and its word (the prototype's `poSt`). */
const STATUS: Record<PurchaseStatus, [StatusTone, string]> = {
  [PurchaseStatus.Draft]: ['neutral', 'poDraft'],
  [PurchaseStatus.Ordered]: ['info', 'poOrdered'],
  [PurchaseStatus.PartiallyReceived]: ['warn', 'poPartial'],
  [PurchaseStatus.Received]: ['ok', 'poReceived'],
  [PurchaseStatus.ClosedShort]: ['neutral', 'poClosedShort'],
  [PurchaseStatus.Cancelled]: ['neutral', 'poCancelled'],
};

/** How purchases read: their status chips, their units, their items' names. */
export function usePurchaseWords() {
  const { t } = useTranslation('shop');
  const counted = useCountedText();
  const words = useVariantWords();

  const status = (state: PurchaseStatus): { tone: StatusTone; word: string } => {
    const [tone, key] = STATUS[state];
    return { tone, word: t(key) };
  };

  /** UOM-01: amounts in each unit, never added across units ("70 pcs · 12.5 kg"). */
  const units = (amounts: readonly UnitQuantity[]): string =>
    amounts.map((each) => counted(each.quantity, each.unit)).join(' · ');

  /** An item as the purchase names it: "Cotton T-shirt · M · Black", its product's name alone, or deleted. */
  const item = (purchase: Pick<Purchase, 'products'>, line: PurchaseItem): string => {
    const product = line.productName ?? t('productGone');
    if (line.optionIds.length === 0) return product;
    const splits =
      purchase.products.find((each) => each.productId === line.productId)?.splits ?? [];
    return `${product} · ${words.variant(line.optionIds, splitsOf({ variantAttributes: splits }))}`;
  };

  return { status, units, item };
}
