import { useTranslation } from 'react-i18next';
import { dayLabel, formatDayMonth, formatTime } from '@/lib/dates';
import { splitsOf } from '@/lib/variant-matrix';
import type { StockCheck, StockCheckLine, StockCheckSummary } from '@/types/stock';
import { useVariantWords } from '../product/variant-words';

/** How a check reads: when it was ("Yesterday 5:10 pm", or "28 Sep" before that), who counted, and its note. */
export function useCheckWords() {
  const { t, i18n } = useTranslation('shop');
  const words = useVariantWords();

  const when = (iso: string): string => {
    const day = dayLabel(iso);
    // The day words are Money's, where a statement's days are named the same way.
    if (day.kind === 'date') return formatDayMonth(iso);
    const word =
      day.kind === 'today' ? t('today', { ns: 'money' }) : t('yesterday', { ns: 'money' });
    return `${word} ${formatTime(iso, i18n.language)}`;
  };

  /** "Yesterday 5:10 pm · Counted by Rumana · Month-end count", as much as is known. */
  const about = (check: StockCheckSummary): string =>
    [
      when(check.createdAt),
      check.actor?.name ? t('checkBy', { name: check.actor.name }) : null,
      check.note,
    ]
      .filter(Boolean)
      .join(' · ');

  /** A saved line's variant ("M · Black"), named by its product's splits; null for a product with no options. */
  const variantOf = (check: StockCheck, line: StockCheckLine): string | null => {
    const splits = check.products.find((each) => each.productId === line.productId)?.splits ?? [];
    return line.optionIds.length > 0
      ? words.variant(line.optionIds, splitsOf({ variantAttributes: splits }))
      : null;
  };

  return { when, about, variantOf };
}
