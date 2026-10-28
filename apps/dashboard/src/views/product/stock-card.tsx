import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { SerialFormat } from '@lytronix/validators';
import { useProductBatches } from '@/api/stock';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Kv } from '@/components/ui/kv';
import { formatDayMonthYear } from '@/lib/dates';
import type { ProductStock } from '@/types/attribute';
import type { ProductDetail } from '@/types/product';
import { AddStockSheet } from './add-stock-sheet';
import { BatchesSheet } from './batches-sheet';
import { HeldSerialsSheet } from './held-serials-sheet';
import { HistorySheet } from './history-sheet';
import { MissingSerialsSheet } from './missing-serials-sheet';
import { useAmountText, useStockHolders, type StockedProduct } from './stock-holders';
import type { StockKind } from './variants-card';

/** One of the Stock card's sheets, on a variant (the first when none is named). */
export interface StockSheet {
  kind: 'add' | 'history' | 'batches' | 'serials' | 'missing';
  variantId: string | null;
}

/** The figures of what a product holds: its shared stock's, or its variants' together. */
function totalsOf(stock: ProductStock): {
  canSell: number;
  waiting: number;
  onHand: number;
  missing: number;
} {
  if (stock.shared) {
    return {
      canSell: Number(stock.shared.available),
      waiting: Number(stock.shared.reserved),
      onHand: Number(stock.shared.onHand),
      missing: 0,
    };
  }
  const sum = (pick: (each: ProductStock['variants'][number]) => string | number | null) =>
    stock.variants.reduce((total, each) => total + Number(pick(each) ?? 0), 0);
  return {
    canSell: sum((each) => each.available),
    waiting: sum((each) => each.reserved),
    onHand: sum((each) => each.onHand),
    missing: sum((each) => each.missingSerials),
  };
}

/**
 * Stock (the prototype's `product` and `pf-edit-*` right-hand card; INV-01, INV-12, INV-14): what a saved product can
 * sell, what waits to ship and what is on hand; a batch-tracked one's batches in a line, a serial-numbered one's units
 * still without a serial with "Add the missing ones". Add stock for someone who may change stock; Stock history, or
 * Batches for a batch-tracked product, for anyone who may see it; and on a serial-numbered product with no options, which
 * has no table to open them from, IMEI / serials.
 */
export function StockCard({
  product,
  stock,
  kind,
  mayManage,
  onOpen,
}: {
  product: ProductDetail;
  stock: ProductStock | undefined;
  kind: StockKind;
  mayManage: boolean;
  onOpen: (sheet: StockSheet) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const titleId = useId();
  const amount = useAmountText();
  const batches = useProductBatches(product.id, { enabled: kind.batch });
  const totals = stock ? totalsOf(stock) : null;
  const unit = kind.unit;

  const open = batches.data?.batches ?? [];
  const earliest = open
    .map((each) => each.expiresOn)
    .filter((each): each is string => each !== null)
    .sort()[0];
  const held = totals ? totals.onHand - totals.missing : 0;

  return (
    <Card role="region" aria-labelledby={titleId}>
      <h3 id={titleId} className="text-[17px] font-semibold">
        {t('stockCardTitle')}
      </h3>
      {totals ? (
        <div className="mt-2">
          <Kv label={t('canSell')} value={amount(String(totals.canSell), unit)} />
          <Kv label={t('waitingShip')} value={amount(String(totals.waiting), unit)} />
          <Kv label={t('onHandL')} value={amount(String(totals.onHand), unit)} />
        </div>
      ) : null}
      {kind.batch && open.length > 0 && totals ? (
        <p className="mt-2 text-[14px] text-fg-muted">
          {earliest
            ? t('batchesSummary', {
                count: open.length,
                amount: amount(String(totals.onHand), unit),
                date: formatDayMonthYear(earliest),
              })
            : t('batchesSummaryNoExpiry', {
                count: open.length,
                amount: amount(String(totals.onHand), unit),
              })}
        </p>
      ) : null}
      {kind.serial && totals && totals.missing > 0 ? (
        <div className="mt-2.5">
          <Banner
            tone="warn"
            action={
              mayManage ? (
                <button
                  type="button"
                  onClick={() => {
                    onOpen({ kind: 'missing', variantId: null });
                  }}
                >
                  {t('addMissing')}
                </button>
              ) : undefined
            }
          >
            {t('serialsHeld', { held, missing: totals.missing })}
          </Banner>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {mayManage ? (
          <Button
            tone="outline"
            size="sm"
            onClick={() => {
              onOpen({ kind: 'add', variantId: null });
            }}
          >
            {t('addStockBtn')}
          </Button>
        ) : null}
        <Button
          tone="ghost"
          size="sm"
          onClick={() => {
            onOpen({ kind: kind.batch ? 'batches' : 'history', variantId: null });
          }}
        >
          {kind.batch ? t('batchesTitle') : t('historyBtn')}
        </Button>
        {kind.serial && product.variantAttributes.length === 0 ? (
          <Button
            tone="ghost"
            size="sm"
            onClick={() => {
              onOpen({ kind: 'serials', variantId: null });
            }}
          >
            {t('serialsBtn')}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/** The Stock card's sheets over the product (agreed in the 11.7c read); the Stock page (11.9) reuses them. */
export function StockSheets({
  sheet,
  product,
  stock,
  kind,
  mayManage,
  onSheet,
}: {
  sheet: StockSheet | null;
  product: StockedProduct;
  stock: ProductStock | undefined;
  kind: StockKind;
  mayManage: boolean;
  onSheet: (sheet: StockSheet | null) => void;
}): React.JSX.Element {
  const holders = useStockHolders(product, stock);
  const close = () => {
    onSheet(null);
  };
  const format = kind.serial ? kind.format : null;
  // "Add the missing ones" from the card: the first variant with units lacking a serial.
  const missingHolder =
    sheet?.kind === 'missing'
      ? (holders.find((each) =>
          sheet.variantId ? each.variantId === sheet.variantId : each.missing > 0,
        ) ?? null)
      : null;
  return (
    <>
      <AddStockSheet
        open={sheet?.kind === 'add'}
        product={product}
        holders={holders}
        initial={sheet?.variantId ?? null}
        unit={kind.unit}
        batch={kind.batch}
        format={format}
        onClose={close}
      />
      <HistorySheet
        open={sheet?.kind === 'history'}
        product={product}
        holders={holders}
        initial={sheet?.variantId ?? null}
        onClose={close}
      />
      <BatchesSheet
        open={sheet?.kind === 'batches'}
        product={product}
        holders={holders}
        unit={kind.unit}
        mayManage={mayManage}
        onClose={close}
      />
      <HeldSerialsSheet
        open={sheet?.kind === 'serials'}
        product={product}
        holders={holders}
        initial={sheet?.variantId ?? null}
        mayManage={mayManage}
        onMissing={(variantId) => {
          onSheet({ kind: 'missing', variantId });
        }}
        onClose={close}
      />
      <MissingSerialsSheet
        product={product}
        holder={missingHolder}
        format={format ?? SerialFormat.Any}
        onClose={close}
      />
    </>
  );
}
