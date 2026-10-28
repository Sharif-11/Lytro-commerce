import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import type { StockUnit } from '@lytronix/validators';
import { Kv } from '@/components/ui/kv';
import { formatDayMonthYear } from '@/lib/dates';
import { useCountedText } from './stock-holders';

/**
 * What writing off an expired batch takes (the prototype's `sh-writeoff`; INV-13): the batch with its expiry, the units
 * left in it, the reason, that only an expired batch is written off here, and the loss at average cost where known.
 * Shared by the Stock card's Batches sheet and the Expiring page (Slice 11.9).
 */
export function WriteOffDetails({
  batch,
  unit,
  avgCost,
}: {
  batch: { batchCode: string | null; expiresOn: string | null; quantity: string };
  unit: StockUnit;
  /** INV-10: the variant's average cost, for someone who may see it; null is unknown. */
  avgCost: string | null;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const counted = useCountedText();
  return (
    <>
      <Kv
        label={t('woBatch')}
        value={[
          batch.batchCode ?? '—',
          batch.expiresOn ? `${t('expShort')} ${formatDayMonthYear(batch.expiresOn)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      <Kv label={t('woLeft')} value={counted(batch.quantity, unit)} />
      <Kv label={t('woReason')} value={t('woExpired')} />
      <p className="mt-2 text-[14px] text-fg-muted">{t('woOnly', { edit: t('editStockWord') })}</p>
      {avgCost ? (
        <p className="text-[14px] text-fg-muted">
          {t('woCost', {
            n: formatTaka(String(Number(avgCost) * Number(batch.quantity))).replace('৳', ''),
          })}
        </p>
      ) : null}
    </>
  );
}
