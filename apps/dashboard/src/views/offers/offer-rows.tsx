import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { Icon } from '@/components/icon';
import { RowList, RowText, RowTrail } from '@/components/ui/list-row';
import { StatusTag } from '@/components/ui/status-tag';
import type { OfferItem, PriceSpan } from '@/types/offers';
import { rowsOf } from './offer-picks';
import { spanText } from './offer-words';

/** How many rows show before "Show all" (the sketch's six). */
const SHOWN = 6;

/** The lowest and highest of the spans given; null when none is. */
function joined(spans: readonly (PriceSpan | null)[]): PriceSpan | null {
  const all = spans.filter((span): span is PriceSpan => span !== null);
  if (all.length === 0) return null;
  const lows = all.map((span) => Number(span.low));
  const highs = all.map((span) => Number(span.high));
  return { low: Math.min(...lows).toFixed(2), high: Math.max(...highs).toFixed(2) };
}

/**
 * OF-2, OF-9, OF-10 (the sketch's `of-new`, `of-offer`, `of-ended`): an offer's products, a row each -- its photo, the
 * designs picked when not the whole product, and its prices, the old one struck through over the offer price, or its
 * price now once the offer has ended; a cut that takes it below ৳1 marks it red. `onRemove` gives each an ✕, taking out
 * the product, or all its designs picked.
 */
export function OfferRows({
  items,
  ended = false,
  showAll,
  onShowAll,
  onRemove,
}: {
  items: readonly OfferItem[];
  ended?: boolean;
  showAll: boolean;
  onShowAll: () => void;
  onRemove?: (items: OfferItem[]) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const rows = rowsOf(items);
  const shown = showAll ? rows : rows.slice(0, SHOWN);
  return (
    <RowList>
      {shown.map((row) => {
        const first = row.items[0];
        if (!first) return null;
        const designs = row.items.filter((item) => item.designName !== null);
        const price = joined(row.items.map((item) => item.price));
        const was = joined(row.items.map((item) => item.was));
        const offer = joined(row.items.map((item) => item.offer));
        const belowOne = row.items.some((item) => item.belowOne);
        const holder = row.items.find((item) => item.heldBy !== null)?.heldBy ?? null;
        const sub =
          designs.length > 0
            ? `${t('of.designsOf', { n: designs.length, of: first.designCount })}: ${designs
                .map((item) => item.designName ?? '')
                .join(', ')}`
            : was && price && was.low !== price.low && !ended
              ? t('of.alreadyOnSale', { price: formatTaka(price.low) })
              : t('of.whole');
        return (
          <div
            key={row.key}
            className={`flex min-h-16 items-center gap-3 px-4 py-3 ${belowOne ? 'bg-danger-soft' : ''}`}
          >
            <span className="flex size-12 flex-none items-center justify-center overflow-hidden rounded-button bg-linear-135 from-neutral-100 to-neutral-200 text-neutral-400">
              {first.image ? (
                <img src={first.image.urls.thumbnail} alt="" className="size-full object-cover" />
              ) : (
                <Icon name="image" />
              )}
            </span>
            <RowText title={first.name} sub={sub} />
            <RowTrail>
              {belowOne ? (
                <StatusTag tone="bad">{t('of.tooMuch')}</StatusTag>
              ) : ended || !offer ? (
                <span className="num text-[16px] font-semibold">
                  {price ? spanText(price) : ''}
                </span>
              ) : (
                <span className="flex flex-col items-end">
                  {was ? <s className="num text-[13px] text-fg-muted">{spanText(was)}</s> : null}
                  <span className="num text-[16px] font-semibold">{spanText(offer)}</span>
                </span>
              )}
              {holder ? (
                <StatusTag tone="warn">{t('of.heldBy', { name: holder.name })}</StatusTag>
              ) : null}
            </RowTrail>
            {onRemove ? (
              <button
                type="button"
                className="flex size-10 flex-none items-center justify-center rounded-button text-fg-muted hover:bg-neutral-100"
                aria-label={t('remove')}
                onClick={() => {
                  onRemove(row.items);
                }}
              >
                <Icon name="x" size={18} />
              </button>
            ) : null}
          </div>
        );
      })}
      {rows.length > SHOWN && !showAll ? (
        <button
          type="button"
          className="flex min-h-13 w-full items-center justify-center font-semibold text-primary"
          onClick={onShowAll}
        >
          {t('of.showAll', { count: rows.length })}
        </button>
      ) : null}
    </RowList>
  );
}
