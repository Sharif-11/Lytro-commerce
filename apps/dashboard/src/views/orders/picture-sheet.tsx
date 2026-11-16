import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/ui/sheet';
import type { OrderItem } from '@/types/orders';
import { picturesOf, quantityOf } from './order-auto';
import { useOrderWords } from './order-words';

/**
 * An item's picture, large (the fixes PR's `fx-photo`, 2026-11-14): the shopper's chosen design or the product's
 * photo, with Previous and Next across the order's pictures and "1 / 2" over it, and the line's SKU and quantity under.
 */
export function PictureSheet({
  items,
  itemId,
  onPick,
  onClose,
}: {
  items: readonly OrderItem[];
  /** The item whose picture shows; null while closed. */
  itemId: string | null;
  onPick: (itemId: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const words = useOrderWords();
  const pictures = picturesOf(items);
  const at = pictures.findIndex((each) => each.itemId === itemId);
  const picture = at >= 0 ? pictures[at] : undefined;
  const item = items.find((each) => each.id === itemId);
  const variant = item ? words.variant(item) : null;
  const quantity = item ? quantityOf(item) : null;
  const step = (by: number) => {
    const next = pictures[at + by];
    if (next) onPick(next.itemId);
  };
  return (
    <Sheet
      open={picture !== undefined}
      title={item ? [item.productName, variant].filter(Boolean).join(' · ') : ''}
      onClose={onClose}
    >
      {picture && item && quantity ? (
        <>
          <div className="relative flex aspect-square max-h-[62vh] w-full items-center justify-between overflow-hidden rounded-[12px] bg-neutral-100 px-2.5">
            <img src={picture.url} alt="" className="absolute inset-0 size-full object-contain" />
            <button
              type="button"
              aria-label={t('prevPicture')}
              disabled={at === 0}
              onClick={() => {
                step(-1);
              }}
              className="relative flex size-11 items-center justify-center rounded-full bg-white/90 shadow-[0_1px_4px_rgba(0,0,0,0.18)] disabled:opacity-35"
            >
              <Icon name="left" />
            </button>
            <button
              type="button"
              aria-label={t('nextPicture')}
              disabled={at === pictures.length - 1}
              onClick={() => {
                step(1);
              }}
              className="relative flex size-11 items-center justify-center rounded-full bg-white/90 shadow-[0_1px_4px_rgba(0,0,0,0.18)] disabled:opacity-35"
            >
              <Icon name="right" />
            </button>
            <span className="num absolute bottom-2.5 left-1/2 -translate-x-1/2 rounded-[12px] bg-black/55 px-2.5 py-0.5 text-[14px] text-white">
              {t('pictureOf', { a: at + 1, b: pictures.length })}
            </span>
          </div>
          <div className="mt-2.5 flex justify-between gap-3 text-[15px] text-fg-muted">
            <span>
              {item.sku ? (
                <>
                  SKU <span className="font-mono text-[14px] tracking-[0.02em]">{item.sku}</span>
                </>
              ) : null}
            </span>
            <span className="num">
              {t(`qty_${quantity.unit}`, { n: quantity.amount })} × {formatTaka(item.unitPrice)}
            </span>
          </div>
        </>
      ) : null}
    </Sheet>
  );
}
