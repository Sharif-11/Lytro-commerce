import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { Icon } from '@/components/icon';
import { RowList, RowText, RowTrail } from '@/components/ui/list-row';
import { StatusTag } from '@/components/ui/status-tag';
import type { OfferItem } from '@/types/offers';
import { spanText } from './offer-words';

/** How many rows show before "Show all" (the sketch's six). */
const SHOWN = 6;

/**
 * OF-2, OF-9, OF-10 (the sketch's `of-new`, `of-offer`, `of-ended`): an offer's products, each with its photo, its
 * design when only some are picked, and its prices -- the old one struck through over the offer price, or its price now
 * once the offer has ended; a cut that takes it below ৳1 marks it red. `onRemove` gives each an ✕.
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
  onRemove?: (item: OfferItem) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const shown = showAll ? items : items.slice(0, SHOWN);
  return (
    <RowList>
      {shown.map((item) => {
        const sub = item.designId
          ? `${t('of.designsOf', { n: 1, of: item.designCount })}: ${item.designName ?? ''}`
          : item.was && item.price && item.was.low !== item.price.low && !ended
            ? t('of.alreadyOnSale', { price: formatTaka(item.price.low) })
            : t('of.whole');
        return (
          <div
            key={`${item.productId}:${item.designId ?? ''}`}
            className={`flex min-h-16 items-center gap-3 px-4 py-3 ${item.belowOne ? 'bg-danger-soft' : ''}`}
          >
            <span className="flex size-12 flex-none items-center justify-center overflow-hidden rounded-button bg-linear-135 from-neutral-100 to-neutral-200 text-neutral-400">
              {item.image ? (
                <img src={item.image.urls.thumbnail} alt="" className="size-full object-cover" />
              ) : (
                <Icon name="image" />
              )}
            </span>
            <RowText title={item.name} sub={sub} />
            <RowTrail>
              {item.belowOne ? (
                <StatusTag tone="bad">{t('of.tooMuch')}</StatusTag>
              ) : ended || !item.offer ? (
                <span className="num text-[16px] font-semibold">
                  {item.price ? spanText(item.price) : ''}
                </span>
              ) : (
                <>
                  {item.was ? (
                    <s className="num text-[13px] text-fg-muted">{spanText(item.was)}</s>
                  ) : null}
                  <span className="num text-[16px] font-semibold">{spanText(item.offer)}</span>
                </>
              )}
              {item.heldBy ? (
                <StatusTag tone="warn">{t('of.heldBy', { name: item.heldBy.name })}</StatusTag>
              ) : null}
            </RowTrail>
            {onRemove ? (
              <button
                type="button"
                className="flex size-10 flex-none items-center justify-center rounded-button text-fg-muted hover:bg-neutral-100"
                aria-label={t('remove')}
                onClick={() => {
                  onRemove(item);
                }}
              >
                <Icon name="x" size={18} />
              </button>
            ) : null}
          </div>
        );
      })}
      {items.length > SHOWN && !showAll ? (
        <button
          type="button"
          className="flex min-h-13 w-full items-center justify-center font-semibold text-primary"
          onClick={onShowAll}
        >
          {t('of.showAll', { count: items.length })}
        </button>
      ) : null}
    </RowList>
  );
}
