import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { usePurchaseHistory } from '@/api/purchases';
import { useProductBatches, useStockHistory } from '@/api/stock';
import { Icon, type IconName } from '@/components/icon';
import { RowList } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { formatDayMonth } from '@/lib/dates';
import type { StockPageProduct } from '@/types/stock';
import { useMovementDay } from '../product/movement-words';
import { useAmountText } from '../product/stock-holders';
import { lineTitle, type StockLine } from './stock-lines';

/** The sheets a row's own sheet opens. */
export type RowSheetChoice = 'history' | 'cost' | 'purchases' | 'batches' | 'serials';

/** One of the sheet's rows (Part 20's `sheetRow20`): an icon, what it opens, a line of what is there. */
function ChoiceButton({
  icon,
  title,
  sub,
  onChoose,
}: {
  icon: IconName;
  title: string;
  sub: string;
  onChoose: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onChoose}
      className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
    >
      <span className="flex size-10 flex-none items-center justify-center rounded-button bg-neutral-100 text-neutral-700">
        <Icon name={icon} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium">{title}</span>
        <span className="truncate text-[14px] text-fg-muted">{sub}</span>
      </span>
      <Icon name="right" />
    </button>
  );
}

/**
 * A variant row tapped (Part 20's `stock-row-sheet`, `-batch`, `-serial`): what it holds and can sell, then Stock
 * history with its last change, Average cost for someone who may see costs, Purchases with where it last came from
 * (Part 21's `stock-row-sheet-purchases`, PUR-09), Batches on a product kept in them with the earliest expiry, and IMEI /
 * serials on a serial-numbered one with how many still have none.
 */
export function RowSheet({
  product,
  line,
  mayManage,
  onChoose,
  onClose,
}: {
  product: StockPageProduct | null;
  line: StockLine | null;
  mayManage: boolean;
  onChoose: (choice: RowSheetChoice) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const amount = useAmountText();
  const day = useMovementDay();
  const open = product !== null && line !== null;
  const history = useStockHistory(product?.productId ?? '', open ? line.variantId : null);
  const batches = useProductBatches(product?.productId ?? '', {
    enabled: open && product.batchTracked,
  });
  const bought = usePurchaseHistory(product?.productId ?? '', open ? line.variantId : null);
  const last = history.data?.pages[0]?.movements[0];
  const lastBought = bought.data?.pages[0]?.purchases[0];
  const own = (batches.data?.batches ?? []).filter((each) => each.variantId === line?.variantId);
  const earliest = own
    .map((each) => each.expiresOn)
    .filter((each): each is string => each !== null)
    .sort()[0];

  return (
    <Sheet open={open} title={open ? lineTitle(product, line) : ''} onClose={onClose}>
      {open ? (
        <>
          <p className="num text-[14px] text-fg-muted">
            {t('onHandCanSell', {
              onHand: amount(line.onHand, product.stockUnit),
              canSell: amount(line.canSell, product.stockUnit),
            })}
          </p>
          <div className="flex-none overflow-hidden rounded-card border border-line">
            <RowList>
              <ChoiceButton
                icon="clock"
                title={t('historyTitle')}
                sub={
                  last
                    ? t('lastChange', { day: day(last.createdAt) })
                    : history.isSuccess
                      ? t('historyNone')
                      : ''
                }
                onChoose={() => {
                  onChoose('history');
                }}
              />
              {mayManage ? (
                <ChoiceButton
                  icon="money"
                  title={t('costTitle')}
                  sub={
                    line.avgCost === null
                      ? t('costNotSet')
                      : t('costPerUnit', { amount: formatTaka(line.avgCost) })
                  }
                  onChoose={() => {
                    onChoose('cost');
                  }}
                />
              ) : null}
              <ChoiceButton
                icon="truck"
                title={t('rowPurchases')}
                sub={
                  lastBought
                    ? t('lastFrom', {
                        supplier: lastBought.supplier?.name ?? t('noSupplier'),
                        date: formatDayMonth(lastBought.receivedAt),
                      })
                    : bought.isSuccess
                      ? t('purchasesNone')
                      : ''
                }
                onChoose={() => {
                  onChoose('purchases');
                }}
              />
              {product.batchTracked ? (
                <ChoiceButton
                  icon="layers"
                  title={t('batchesTitle')}
                  sub={
                    !batches.isSuccess
                      ? ''
                      : own.length === 0
                        ? t('batchesNone')
                        : earliest
                          ? t('rowBatches', { count: own.length, date: formatDayMonth(earliest) })
                          : t('rowBatchesNoExpiry', { count: own.length })
                  }
                  onChoose={() => {
                    onChoose('batches');
                  }}
                />
              ) : null}
              {product.serialTracked ? (
                <ChoiceButton
                  icon="smartphone"
                  title={t('heldSerialsTitle')}
                  sub={
                    line.missing > 0
                      ? t('rowSerials', { held: Number(line.onHand), missing: line.missing })
                      : t('rowSerialsAll', { held: Number(line.onHand) })
                  }
                  onChoose={() => {
                    onChoose('serials');
                  }}
                />
              ) : null}
            </RowList>
          </div>
          <p className="text-[14px] text-fg-muted">{t('rowSheetNote')}</p>
        </>
      ) : null}
    </Sheet>
  );
}
