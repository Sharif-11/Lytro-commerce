import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { StockTracking, type StockUnit } from '@lytronix/validators';
import { Button } from '@/components/ui/button';
import { RowList } from '@/components/ui/list-row';
import { StatusTag } from '@/components/ui/status-tag';
import type { StockPageProduct } from '@/types/stock';
import { useAmountText } from '../product/stock-holders';
import { StockTag } from '../products/product-row';
import { averageCostOf, lineTitle, shownLines, type StockLine } from './stock-lines';

/** What a row's buttons and its own tap open. */
export type LineAction = 'open' | 'add' | 'edit';

/** One figure of a row: its name over its amount, Can sell larger (the prototype's `stockFig`). */
function Figure({
  label,
  amount,
  big = false,
}: {
  label: string;
  amount: string;
  big?: boolean;
}): React.JSX.Element {
  return (
    <span className="flex flex-col">
      <span className="text-[12px] text-fg-muted">{label}</span>
      <span className={`num font-semibold ${big ? 'text-[20px]' : 'text-[16px]'}`}>{amount}</span>
    </span>
  );
}

/**
 * A variant's row (the prototype's `stockRow`, Part 20's `srow20`): its name over its stock chip, then Can sell, Waiting
 * to ship, Coming when a placed purchase brings more (PUR-05), and On hand -- two to a line on a phone, one line from
 * 640 px -- and Add stock and Edit for someone who may change stock. The name and figures open the row's own sheet.
 */
export function StockRow({
  line,
  title,
  unit,
  mayManage,
  onAction,
}: {
  line: StockLine;
  /** Its product's name and its own, which its buttons say (two products may each have an M). */
  title: string;
  unit: StockUnit;
  mayManage: boolean;
  onAction: (action: LineAction) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const amount = useAmountText();
  const coming = Number(line.coming) > 0;
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:grid sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
      <button
        type="button"
        onClick={() => {
          onAction('open');
        }}
        className="flex flex-col gap-2 text-left sm:grid sm:grid-cols-[150px_1fr] sm:items-center sm:gap-4"
      >
        <span className="flex items-center justify-between gap-2 text-[15px] font-medium sm:flex-col sm:items-start sm:gap-1">
          <span>{line.name}</span>
          <StockTag state={line.state} />
        </span>
        <span
          className={`grid grid-cols-2 gap-x-3 gap-y-2 ${coming ? 'sm:max-w-[500px] sm:grid-cols-4' : 'sm:max-w-[380px] sm:grid-cols-3'}`}
        >
          <Figure label={t('canSell')} amount={amount(line.canSell, unit)} big />
          <Figure label={t('waitingShip')} amount={amount(line.waiting, unit)} />
          {coming ? <Figure label={t('coming')} amount={amount(line.coming, unit)} /> : null}
          <Figure label={t('onHandL')} amount={amount(line.onHand, unit)} />
        </span>
      </button>
      {mayManage ? (
        <div className="flex justify-end gap-1">
          <Button
            tone="outline"
            size="xs"
            aria-label={t('addStockFor', { name: title })}
            onClick={() => {
              onAction('add');
            }}
          >
            {t('addStockBtn')}
          </Button>
          <Button
            tone="ghost"
            size="xs"
            aria-label={t('editStockFor', { name: title })}
            onClick={() => {
              onAction('edit');
            }}
          >
            {t('editStockBtn')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A product on the Stock page (the prototype's `daylbl` over its rows, Part 20's `prod20`): its name with its average
 * cost for someone who may see costs, its rows as design v3.7 shows them with "+n more", or, made to order, one line.
 */
export function StockProduct({
  product,
  lines,
  mayManage,
  opened,
  onMore,
  onAction,
}: {
  product: StockPageProduct;
  lines: readonly StockLine[];
  mayManage: boolean;
  /** Its "+n more" opened. */
  opened: boolean;
  onMore: () => void;
  onAction: (line: StockLine, action: LineAction) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const madeToOrder = product.stockTracking === StockTracking.NotTracked;
  const average = mayManage && !madeToOrder ? averageCostOf(lines) : null;
  const { shown, hidden } = shownLines(lines, opened);
  return (
    <>
      <div className="flex items-center justify-between gap-3 bg-neutral-50 px-4 pt-3 pb-1 text-[13px] font-semibold text-neutral-700">
        <h2>{product.name}</h2>
        {madeToOrder ? (
          <StatusTag tone="neutral">{t('madeToOrderTag')}</StatusTag>
        ) : average !== null ? (
          <span className="text-[14px] text-fg-muted">
            {t('avgCostOf', { amount: formatTaka(average).replace('৳', '') })}
          </span>
        ) : null}
      </div>
      {madeToOrder ? (
        <div className="flex min-h-11 items-center px-4 py-3 text-[14px] text-fg-muted">
          {t('madeToOrderLine')}
        </div>
      ) : (
        <RowList>
          {shown.map((line) => (
            <StockRow
              key={line.variantId}
              line={line}
              title={lineTitle(product, line)}
              unit={product.stockUnit}
              mayManage={mayManage}
              onAction={(action) => {
                onAction(line, action);
              }}
            />
          ))}
        </RowList>
      )}
      {hidden > 0 ? (
        <div className="px-4 pt-2 pb-3">
          <Button tone="ghost" size="sm" aria-expanded={false} onClick={onMore}>
            {t('moreVariants', { count: hidden })}
          </Button>
        </div>
      ) : null}
    </>
  );
}
