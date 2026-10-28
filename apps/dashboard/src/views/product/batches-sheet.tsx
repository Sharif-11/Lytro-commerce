import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BatchState, type StockUnit } from '@lytronix/validators';
import { useProductBatches, useWriteOff } from '@/api/stock';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { StatusTag, type StatusTone } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import { daysUntil, formatDayMonthYear } from '@/lib/dates';
import { splitsOf } from '@/lib/variant-matrix';
import type { StockBatch } from '@/types/stock';
import { useCountedText, type StockedProduct, type StockHolder } from './stock-holders';
import { useVariantWords } from './variant-words';
import { WriteOffDetails } from './write-off';

/**
 * Batches (the prototype's `sh-batches` and `sh-writeoff`; INV-12, INV-13): the product's batches holding stock, in the
 * order sales take them -- each with its code, expiry and how much it holds, fine, expiring in so many days, expired,
 * or with no expiry. An expired batch has Write off, a step that says what goes and what it cost.
 */
export function BatchesSheet({
  open,
  product,
  holders,
  unit,
  mayManage,
  onClose,
}: {
  open: boolean;
  product: StockedProduct;
  holders: readonly StockHolder[];
  unit: StockUnit;
  mayManage: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const words = useVariantWords();
  const errorText = useErrorText();
  const batches = useProductBatches(product.id, { enabled: open });
  const writeOff = useWriteOff(product.id);
  const [going, setGoing] = useState<StockBatch | null>(null);

  useEffect(() => {
    if (!open) return;
    setGoing(null);
    writeOff.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const splits = splitsOf(product);
  const counted = useCountedText();
  const amount = (quantity: string) => counted(quantity, unit);
  const state = (batch: StockBatch): { tone: StatusTone; text: string } =>
    batch.state === BatchState.Expired
      ? { tone: 'bad', text: t('batchExpired') }
      : batch.state === BatchState.Expiring && batch.expiresOn
        ? { tone: 'warn', text: t('batchExpiresIn', { n: daysUntil(batch.expiresOn) }) }
        : batch.expiresOn
          ? { tone: 'ok', text: t('batchFine') }
          : { tone: 'neutral', text: t('batchNoExpiry') };
  const cost = going ? holders.find((each) => each.variantId === going.variantId)?.avgCost : null;

  return (
    <Sheet
      open={open}
      title={going ? t('woTitle') : t('batchesTitle')}
      onClose={onClose}
      onBack={
        going
          ? () => {
              setGoing(null);
            }
          : undefined
      }
      footer={
        going ? (
          <Button
            wide
            tone="danger"
            busy={writeOff.isPending}
            onClick={() => {
              writeOff.mutate(going.id, {
                onSuccess: () => {
                  setGoing(null);
                },
              });
            }}
          >
            {t('woBtn', { n: String(Number(going.quantity)) })}
          </Button>
        ) : undefined
      }
    >
      {open && going ? (
        <div className="flex flex-col gap-1">
          <WriteOffDetails batch={going} unit={unit} avgCost={cost ?? null} />
          {writeOff.isError ? <Banner tone="bad">{errorText(writeOff.error)}</Banner> : null}
        </div>
      ) : open ? (
        <div className="flex flex-col gap-3">
          <p className="text-[14px] text-fg-muted">{product.name}</p>
          {batches.isSuccess && batches.data.batches.length === 0 ? (
            <p className="text-[14px] text-fg-muted">{t('batchesNone')}</p>
          ) : (
            <ul
              aria-label={t('batchesTitle')}
              className="flex-none overflow-hidden rounded-card border border-line"
            >
              {(batches.data?.batches ?? []).map((batch) => {
                const shown = state(batch);
                return (
                  <li
                    key={batch.id}
                    className="flex min-h-[52px] items-center gap-3 border-t border-line px-4 py-2 first:border-t-0"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="num text-[15px]">{batch.batchCode ?? '—'}</span>
                      <span className="num text-[13px] text-fg-muted">
                        {[
                          batch.optionIds.length > 0
                            ? words.variant(batch.optionIds, splits)
                            : null,
                          batch.expiresOn
                            ? formatDayMonthYear(batch.expiresOn)
                            : t('batchNoExpiry'),
                          amount(batch.quantity),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {/* As drawn, Write off sits under the batch's state. */}
                    <span className="flex flex-none flex-col items-end gap-1.5">
                      <StatusTag tone={shown.tone}>{shown.text}</StatusTag>
                      {batch.state === BatchState.Expired && mayManage ? (
                        <Button
                          tone="outline"
                          size="xs"
                          onClick={() => {
                            setGoing(batch);
                          }}
                        >
                          {t('writeOff')}
                        </Button>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-[14px] text-fg-muted">{t('batchNote')}</p>
        </div>
      ) : null}
    </Sheet>
  );
}
