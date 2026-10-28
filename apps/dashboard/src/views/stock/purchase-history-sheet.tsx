import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { usePurchaseHistory } from '@/api/purchases';
import { Button } from '@/components/ui/button';
import { RowList } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { formatDayMonth } from '@/lib/dates';
import type { StockPageProduct } from '@/types/stock';
import { useAmountText } from '../product/stock-holders';
import { purchaseNumber } from '../purchases/purchase-words';
import { lineTitle, type StockLine } from './stock-lines';

/**
 * A variant's purchases (Part 21's `sh-purchase-history`; PUR-09), from its Stock row's sheet: each delivery that
 * brought it in, newest first -- the purchase's number and supplier, the day, what was accepted and what was rejected
 * and why, and, for someone who may see costs, what each unit cost.
 */
export function PurchaseHistorySheet({
  product,
  line,
  onClose,
}: {
  product: StockPageProduct | null;
  line: StockLine | null;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const amount = useAmountText();
  const open = product !== null && line !== null;
  const history = usePurchaseHistory(product?.productId ?? '', open ? line.variantId : null);
  const entries = (history.data?.pages ?? []).flatMap((page) => page.purchases);

  return (
    <Sheet open={open} title={t('purchaseHistT')} onClose={onClose}>
      {open ? (
        <>
          <p className="text-[14px] text-fg-muted">{lineTitle(product, line)}</p>
          <div className="flex-none overflow-hidden rounded-card border border-line">
            {history.isPending ? (
              <SkeletonRows count={3} />
            ) : entries.length === 0 ? (
              <p className="px-4 py-3 text-[14px] text-fg-muted">{t('purchasesNone')}</p>
            ) : (
              <RowList>
                {entries.map((entry) => {
                  const number = purchaseNumber(entry.number);
                  return (
                    <div key={entry.receiptId} className="flex min-h-16 items-center gap-3 px-4 py-3">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[16px] font-medium">
                          {number ? (
                            <span className="num mr-1.5 font-semibold text-fg-muted">{number}</span>
                          ) : null}
                          {entry.supplier?.name ?? t('noSupplier')}
                        </span>
                        <span className="num text-[14px] text-fg-muted">
                          {[
                            formatDayMonth(entry.receivedAt),
                            Number(entry.accepted) > 0
                              ? t('histAccepted', {
                                  amount: amount(entry.accepted, product.stockUnit),
                                })
                              : null,
                            Number(entry.rejected) > 0
                              ? t('histRejected', {
                                  amount: amount(entry.rejected, product.stockUnit),
                                  why: entry.rejectReason ?? '—',
                                })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {entry.unitCost ? (
                        <span className="num flex-none text-right font-semibold">
                          {t('costEach', { amount: formatTaka(entry.unitCost) })}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </RowList>
            )}
          </div>
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
        </>
      ) : null}
    </Sheet>
  );
}
