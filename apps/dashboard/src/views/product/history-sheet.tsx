import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StockReason } from '@lytronix/validators';
import { useStockHistory } from '@/api/stock';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { TimelineRow } from '@/components/ui/timeline';
import type { StockMovement } from '@/types/stock';
import { signed, useMovementDay } from './movement-words';
import type { StockHolder } from './stock-holders';
import { VariantPicker } from './variant-picker';

/**
 * Stock history (the prototype's `sh-history`, Part 18's `sh-history-product`; INV-09): a variant's movements, newest
 * first -- what changed and why, who did it and what it left on hand, with a note when there is one -- picked as
 * "Product · variant" where the product has several, "Show earlier" for the pages before.
 */
export function HistorySheet({
  open,
  product,
  holders,
  initial,
  onClose,
}: {
  open: boolean;
  product: { id: string; name: string };
  holders: readonly StockHolder[];
  initial: string | null;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const [variantId, setVariantId] = useState<string | null>(null);

  useEffect(() => {
    if (open) setVariantId(initial ?? holders[0]?.variantId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const history = useStockHistory(product.id, open ? variantId : null);
  const movements = history.data?.pages.flatMap((page) => page.movements) ?? [];
  const holder = holders.find((each) => each.variantId === variantId);
  const day = useMovementDay();
  const when = (movement: StockMovement): string => day(movement.createdAt);

  return (
    <Sheet open={open} title={t('historyTitle')} onClose={onClose}>
      {open ? (
        <div className="flex flex-col gap-3">
          {holders.length > 1 ? (
            <VariantPicker
              product={product.name}
              holders={holders}
              value={variantId}
              onChange={setVariantId}
            />
          ) : (
            <p className="text-[14px] text-fg-muted">{holder?.name ?? product.name}</p>
          )}
          {history.isSuccess && movements.length === 0 ? (
            <p className="text-[14px] text-fg-muted">{t('historyNone')}</p>
          ) : (
            <div className="flex flex-col">
              {movements.map((movement) => (
                <TimelineRow
                  key={movement.id}
                  dot={movement.reason === StockReason.Expired ? 'bad' : 'on'}
                  text={t(`mv_${movement.reason}`, { n: signed(movement.delta) })}
                  sub={[
                    movement.actor?.name ?? null,
                    t('onHandAfter', { n: String(Number(movement.onHandAfter)) }),
                    movement.note,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  when={when(movement)}
                />
              ))}
            </div>
          )}
          {history.hasNextPage ? (
            <Button
              tone="outline"
              size="sm"
              wide
              busy={history.isFetchingNextPage}
              onClick={() => {
                void history.fetchNextPage();
              }}
            >
              {t('showEarlier')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
