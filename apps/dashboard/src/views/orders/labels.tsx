import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { useLocations } from '@/api/delivery';
import { useShopSettings } from '@/api/shop-settings';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { code128 } from '@/lib/code128';
import { bangladeshiPhone } from '@/lib/phone';
import { useShell } from '@/shell/shell-context';
import type { Order } from '@/types/orders';
import { Segments } from '../product/value-sheet';
import { atCounter, useOrderWords } from './order-words';

/** The two thermal label sizes (agreed 2026-10-31, ORD-19 amended), in inches. */
export type LabelSize = '23' | '33';
const SIZE_KEY = 'lytro.label-size';

/** The size picked last on this device (Part 29: "kept for next time"), 3 × 3 at first. */
function storedSize(): LabelSize {
  try {
    return window.localStorage.getItem(SIZE_KEY) === '23' ? '23' : '33';
  } catch {
    return '33';
  }
}

function keepSize(size: LabelSize): void {
  try {
    window.localStorage.setItem(SIZE_KEY, size);
  } catch {
    // A private window keeps nothing: the next print starts at 3 × 3 again.
  }
}

/** The order number as Code 128 bars, scaled to the width it is given. */
function Barcode({ value, className }: { value: string; className: string }): React.JSX.Element {
  const modules = code128(value);
  const bars: { at: number; width: number }[] = [];
  for (let at = 0; at < modules.length; at += 1) {
    if (modules[at] !== '1') continue;
    const last = bars[bars.length - 1];
    if (last && last.at + last.width === at) last.width += 1;
    else bars.push({ at, width: 1 });
  }
  return (
    <svg
      role="img"
      aria-label={value}
      viewBox={`0 0 ${String(modules.length)} 1`}
      preserveAspectRatio="none"
      className={className}
    >
      {bars.map((bar) => (
        <rect key={bar.at} x={bar.at} y={0} width={bar.width} height={1} fill="#000" />
      ))}
    </svg>
  );
}

/**
 * One thermal label (Part 29's `o29Label`, ORD-19 amended): the shop and its phone; the customer's name, phone and
 * address; the order number, courier and tracking code; a barcode of the order number; the cash to collect and the
 * weight; the 3 × 3 label adds the items. Black on white, at its printed size.
 */
export function OrderLabel({ order, size }: { order: Order; size: LabelSize }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const words = useOrderWords();
  const { tenant } = useShell();
  const settings = useShopSettings();
  const locations = useLocations();
  const small = size === '23';
  const zilla =
    order.location === null
      ? null
      : (locations.data?.zillas.find((each) => each.id === order.location?.zillaId) ?? null);
  const where = atCounter(order)
    ? `${t('atCounter')} · ${words.counter(order)}`
    : [
        order.deliveryAddress,
        order.location ? words.named(order.location) : null,
        zilla ? words.named(zilla) : null,
      ]
        .filter(Boolean)
        .join(', ');
  const weight = order.items.reduce(
    (sum, item) => sum + Number(item.weightKg ?? 0) * Number(item.quantity),
    0,
  );
  const shopPhone = settings.data?.contactPhone ?? null;
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-[2px] border border-black bg-white leading-[1.25] text-black ${small ? 'h-[3in] w-[2in] gap-1 p-2 text-[10px]' : 'h-[3in] w-[3in] gap-1.5 p-3 text-[12px]'}`}
    >
      <div className="flex items-baseline justify-between gap-2 border-b border-dashed border-black pb-1">
        <b className={small ? 'text-[12px]' : 'text-[15px]'}>{tenant.shopName}</b>
        {shopPhone ? <span>{bangladeshiPhone.grouped(shopPhone)}</span> : null}
      </div>
      <div>
        <span className={`tracking-[0.04em] uppercase ${small ? 'text-[9px]' : 'text-[10px]'}`}>
          {t('labelTo')}
        </span>
        <div className={`font-bold ${small ? 'text-[12px]' : 'text-[15px]'}`}>
          {order.customerErased ? t('erased') : (order.customerName ?? '')}
        </div>
        {order.customerPhone ? (
          <div className="font-semibold">{bangladeshiPhone.grouped(order.customerPhone)}</div>
        ) : null}
        <div>{where}</div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-dashed border-black pt-1">
        <span>#{order.orderNumber}</span>
        {order.courierName ? <span>{order.courierName}</span> : null}
        {order.trackingCode ? <span>{order.trackingCode}</span> : null}
      </div>
      <Barcode
        value={order.orderNumber}
        className={`mt-auto w-full ${small ? 'h-[34px]' : 'h-[44px]'}`}
      />
      <div className="flex items-center justify-between">
        <b className={small ? 'text-[14px]' : 'text-[18px]'}>
          {t('labelCod')} {formatTaka(order.due)}
        </b>
        {weight > 0 ? (
          <span>
            {t('labelWeight')} {Number(weight.toFixed(3))} kg
          </span>
        ) : null}
      </div>
      {small ? null : (
        <div className="border-t border-dashed border-black pt-1">
          {t('labelItems', {
            count: order.items.length,
            items: order.items
              .map((item) => `${item.productName} ×${String(Number(item.quantity))}`)
              .join(', '),
          })}
        </div>
      )}
    </div>
  );
}

/** Prints the labels at their size: the page set through the CSSOM (the policy allows no inline style), then lifted. */
function printAt(size: LabelSize): void {
  const page = new CSSStyleSheet();
  page.replaceSync(`@page { size: ${size === '23' ? '2in 3in' : '3in 3in'}; margin: 0; }`);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, page];
  const done = () => {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((each) => each !== page);
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

/**
 * Print label (Part 29's `o29-print`, `o29-label-23`): the size, 2 × 3 or 3 × 3 inches, kept for next time; the labels
 * as they will print; Print. One order from its menu, or the orders selected in the list.
 */
export function PrintSheet({
  orders,
  loading = false,
  onClose,
}: {
  orders: Order[];
  loading?: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const [size, setSize] = useState<LabelSize>(storedSize);
  return (
    <>
      <Sheet
        open
        title={t('printTitle')}
        onClose={onClose}
        footer={
          <Button
            wide
            disabled={loading || orders.length === 0}
            onClick={() => {
              printAt(size);
            }}
          >
            <Icon name="printer" />
            {orders.length > 1 ? t('printN', { count: orders.length }) : t('print')}
          </Button>
        }
      >
        <div>
          <h3 className="mb-2 text-[16px] font-semibold">{t('labelSize')}</h3>
          <Segments
            label={t('labelSize')}
            choices={[
              { value: '23', label: t('size23') },
              { value: '33', label: t('size33') },
            ]}
            value={size}
            onChange={(next) => {
              setSize(next);
              keepSize(next);
            }}
          />
          <p className="mt-2 text-[14px] text-fg-muted">{t('printHelp')}</p>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-card bg-neutral-50 p-3">
          {loading ? (
            <SkeletonRows count={2} />
          ) : (
            orders.map((order) => <OrderLabel key={order.id} order={order} size={size} />)
          )}
        </div>
      </Sheet>
      {createPortal(
        <div className="label-print">
          {orders.map((order) => (
            <OrderLabel key={order.id} order={order} size={size} />
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
