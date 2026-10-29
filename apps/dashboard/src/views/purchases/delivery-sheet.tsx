import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { Kv } from '@/components/ui/kv';
import { RowList } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { formatDayMonth } from '@/lib/dates';
import type { Purchase, PurchaseReceipt } from '@/types/purchasing';
import { useAmountText } from '../product/stock-holders';
import { unitOf } from './purchase-lines';
import { usePurchaseWords } from './purchase-words';

/**
 * One delivery, opened from its row (Part 21's `sh-delivery`; PUR-08): who took it and its note, then each item it
 * brought: accepted, rejected and why, its batch, and what each unit cost. Saved, a delivery never changes.
 */
export function DeliverySheet({
  purchase,
  receipt,
  onClose,
}: {
  purchase: Purchase;
  receipt: PurchaseReceipt | null;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const amount = useAmountText();
  const words = usePurchaseWords();
  return (
    <Sheet
      open={receipt !== null}
      title={receipt ? t('deliveryOn', { date: formatDayMonth(receipt.receivedAt) }) : ''}
      onClose={onClose}
    >
      {receipt ? (
        <>
          <div>
            <Kv label={t('takenBy')} value={receipt.actor?.name ?? '—'} />
            <Kv label={t('rcvNote')} value={receipt.note ?? '—'} />
          </div>
          <div className="flex-none overflow-hidden rounded-card border border-line">
            <RowList>
              {receipt.items.map((line) => {
                const item = purchase.items.find((each) => each.id === line.itemId);
                const unit = unitOf(item);
                const accepted = Number(line.accepted) > 0;
                const rejected = Number(line.rejected) > 0;
                const extra = [
                  line.batch?.batchCode ? t('batchNamed', { code: line.batch.batchCode }) : null,
                  line.unitCost ? t('costEach', { amount: formatTaka(line.unitCost) }) : null,
                ].filter(Boolean);
                return (
                  <div key={line.itemId} className="flex min-h-16 flex-col gap-0.5 px-4 py-3">
                    <span className="text-[15px] font-medium">
                      {item ? words.item(purchase, item) : t('productGone')}
                    </span>
                    <span className="text-[14px] text-fg-muted">
                      {[
                        accepted ? t('dlvAccepted', { amount: amount(line.accepted, unit) }) : null,
                        rejected
                          ? line.rejectReason
                            ? t('dlvRejectedWhy', {
                                amount: amount(line.rejected, unit),
                                why: line.rejectReason,
                              })
                            : t('dlvRejected', { amount: amount(line.rejected, unit) })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {extra.length > 0 ? (
                      <span className="num text-[14px] text-fg-muted">{extra.join(' · ')}</span>
                    ) : null}
                  </div>
                );
              })}
            </RowList>
          </div>
        </>
      ) : null}
    </Sheet>
  );
}
