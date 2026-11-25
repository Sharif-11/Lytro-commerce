import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { monogramLetter } from '@lytronix/validators';
import { useLocations } from '@/api/delivery';
import { useShopSettings } from '@/api/shop-settings';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { QrCode } from '@/components/ui/qr-code';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { code128 } from '@/lib/code128';
import { formatPrintedAt } from '@/lib/dates';
import { bangladeshiPhone } from '@/lib/phone';
import { useShell } from '@/shell/shell-context';
import { hasDesign, type Order } from '@/types/orders';
import { Segments } from '../product/value-sheet';
import { labelCode, labelCourier, labelId, labelWeightKg } from './label-facts';
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

/** The parcel's ID as Code 128 bars, scaled to the width it is given. */
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

/** A label's own name for a fact ("ORDER", "নাম"): small spaced capitals in English, Bangla larger and not spaced. */
function Cap({
  small,
  children,
}: {
  small: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <span
      className={`font-semibold tracking-[0.08em] whitespace-nowrap text-[#333] uppercase [html[lang=bn]_&]:tracking-normal [html[lang=bn]_&]:normal-case ${small ? 'text-[6.5px] [html[lang=bn]_&]:text-[8px]' : 'text-[7px] [html[lang=bn]_&]:text-[8.5px]'}`}
    >
      {children}
    </span>
  );
}

/** One row beside the QR: its name at the left, its value bold at the right; "—" for a value not known. */
function Fact({
  name,
  value,
  small,
}: {
  name: string;
  value: string | null;
  small: boolean;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-1.5">
      <Cap small={small}>{name}</Cap>
      <b
        className={`min-w-0 text-right [overflow-wrap:anywhere] ${small ? 'text-[8px]' : 'text-[9.5px]'}`}
      >
        {value ?? '—'}
      </b>
    </div>
  );
}

/** One of the customer's rows: its name in a column of its own, the value bold and wrapping beside it. */
function Person({
  name,
  value,
  small,
}: {
  name: string;
  value: string;
  small: boolean;
}): React.JSX.Element {
  return (
    <div
      className={`grid items-baseline gap-1 ${small ? 'grid-cols-[36px_1fr]' : 'grid-cols-[44px_1fr]'}`}
    >
      <Cap small={small}>{name}</Cap>
      <b
        className={`leading-[1.25] [overflow-wrap:anywhere] ${small ? 'text-[9px]' : 'text-[10.5px]'}`}
      >
        {value}
      </b>
    </div>
  );
}

/** The shop's logo in a circle, or its letter white on black when it has none (Steadfast's head). */
function LabelMark({ small }: { small: boolean }): React.JSX.Element {
  const { tenant, slug } = useShell();
  const box = small ? 'size-[26px] text-[12px]' : 'size-8 text-[15px]';
  if (tenant.logo) {
    return (
      <img
        src={tenant.logo.urls.thumbnail}
        alt=""
        className={`flex-none rounded-full bg-white object-contain ${box}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-flex flex-none items-center justify-center rounded-full bg-black font-bold text-white ${box}`}
    >
      {monogramLetter(tenant.shopName, slug)}
    </span>
  );
}

/**
 * One thermal label, laid out as Steadfast's own (TENANT-DASHBOARD-DESIGN §7.47, ORD-19): the shop's logo, name and
 * phone; the parcel's ID as a barcode with its characters under it; a QR of the same ID beside the order, courier, ID
 * and weight; the customer's name, phone and address; the cash to collect in a box; the 3 × 3's items; when it was
 * printed and Lytro's mark. Black on white at its printed size, with no outer border (a thermal roll's edge drifts).
 */
export function OrderLabel({
  order,
  size,
  printedAt,
}: {
  order: Order;
  size: LabelSize;
  /** When the labels were opened to print, ISO. */
  printedAt: string;
}): React.JSX.Element {
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
  const code = labelCode(order);
  const weight = labelWeightKg(order);
  const shopPhone = settings.data?.contactPhone ?? null;
  return (
    <div
      className={`flex h-[3in] flex-col overflow-hidden bg-white leading-[1.2] text-black shadow-[0_1px_2px_rgba(16,32,31,0.06),0_4px_12px_rgba(16,32,31,0.06)] print:shadow-none ${small ? 'w-[2in]' : 'w-[3in]'}`}
    >
      <div
        className={`flex items-center justify-between gap-2 border-b-[1.5px] border-black ${small ? 'px-1.5 py-1' : 'px-2 py-[5px]'}`}
      >
        <LabelMark small={small} />
        <div className="min-w-0 text-right">
          <b className={`block truncate ${small ? 'text-[9.5px]' : 'text-[11.5px]'}`}>
            {tenant.shopName}
          </b>
          {shopPhone ? (
            <span className={small ? 'text-[7px]' : 'text-[8px]'}>
              {bangladeshiPhone.display(shopPhone)}
            </span>
          ) : null}
        </div>
      </div>
      <div
        className={`border-b border-[#999] ${small ? 'px-2 pt-1 pb-[2px]' : 'px-[10px] pt-[5px] pb-[3px]'}`}
      >
        <Barcode value={code} className={`block w-full ${small ? 'h-[22px]' : 'h-[26px]'}`} />
        <div
          className={`mt-[2px] text-center font-bold tracking-[0.18em] ${small ? 'text-[7px]' : 'text-[8px]'}`}
        >
          {code}
        </div>
      </div>
      <div className="flex border-b border-[#999]">
        <div className={`border-r border-[#999] ${small ? 'px-1 py-[3px]' : 'px-1.5 py-1'}`}>
          <QrCode
            text={code}
            label={t('labelQr', { code })}
            size={small ? 52 : 62}
            className="block"
          />
        </div>
        <div
          className={`flex min-w-0 flex-1 flex-col justify-between ${small ? 'px-1.5 py-1' : 'px-2 py-[5px]'}`}
        >
          <Fact small={small} name={t('labelOrder')} value={order.orderNumber} />
          <Fact small={small} name={t('labelCourier')} value={labelCourier(order)} />
          <Fact small={small} name={t('labelId')} value={labelId(order)} />
          <Fact
            small={small}
            name={t('labelWeight')}
            value={weight === null ? null : `${String(weight)} kg`}
          />
        </div>
      </div>
      <div className={`flex flex-col gap-[3px] ${small ? 'px-1.5 py-[5px]' : 'px-2 py-1.5'}`}>
        <Person
          small={small}
          name={t('labelName')}
          value={order.customerErased ? t('erased') : (order.customerName ?? '—')}
        />
        <Person
          small={small}
          name={t('labelPhone')}
          value={order.customerPhone ? bangladeshiPhone.display(order.customerPhone) : '—'}
        />
        <Person small={small} name={t('labelAddress')} value={where || '—'} />
      </div>
      <div
        className={`flex flex-none items-center justify-between gap-1.5 border border-black ${small ? 'mx-1.5 px-1.5 py-[3px]' : 'mx-2 px-2 py-1'}`}
      >
        <span
          className={`font-bold tracking-[0.08em] whitespace-nowrap uppercase [html[lang=bn]_&]:tracking-normal [html[lang=bn]_&]:normal-case ${small ? 'text-[6.5px] [html[lang=bn]_&]:text-[8px]' : 'text-[7.5px] [html[lang=bn]_&]:text-[9px]'}`}
        >
          {t('labelCod')}
        </span>
        <b className={small ? 'text-[12px]' : 'text-[14px]'}>{formatTaka(order.due)}</b>
      </div>
      {small ? null : (
        <div className="min-h-0 flex-1 overflow-hidden px-2 pt-[5px] text-[8.5px] leading-[1.3]">
          <LabelItems order={order} />
        </div>
      )}
      <div
        className={`mt-auto flex items-center justify-between gap-1.5 border-t border-[#999] py-[3px] whitespace-nowrap text-[#333] ${small ? 'px-1.5 text-[6px]' : 'px-2 text-[7px]'}`}
      >
        <span>{t('labelPrinted', { at: formatPrintedAt(printedAt) })}</span>
        <span>
          <b className="text-black">Lytro</b> · lytro.app
        </span>
      </div>
    </div>
  );
}

/**
 * The 3×3 label's items (ORD-19): "name ×qty", and a design's line its design, size and SKU (PD-9, Part 40's
 * `pd-print`), "Irani burka (Stripe · 54 · IB-D2-54) ×1"; a SKU never breaks across lines.
 */
function LabelItems({ order }: { order: Order }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const words = useOrderWords();
  // The sentence's own words around the list, as the language puts them.
  const [before = '', after = ''] = t('labelItems', {
    count: order.items.length,
    items: '\u0000',
  }).split('\u0000');
  return (
    <>
      {before}
      {order.items.map((item, index) => {
        const quantity = `×${String(Number(item.quantity))}`;
        const details = hasDesign(item)
          ? [words.variant(item), item.sku].filter((each): each is string => Boolean(each))
          : [];
        return (
          <span key={item.id}>
            {index > 0 ? ', ' : null}
            {item.productName}
            {details.length > 0 ? (
              <>
                {' ('}
                {details.map((each, at) => (
                  <span key={each}>
                    {at > 0 ? ' · ' : null}
                    {at === details.length - 1 && item.sku ? (
                      <span className="whitespace-nowrap">{each}</span>
                    ) : (
                      each
                    )}
                  </span>
                ))}
                {')'}
              </>
            ) : null}{' '}
            {quantity}
          </span>
        );
      })}
      {after}
    </>
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
  // The label's "Printed:" time: when the sheet opened, the same on every label of the batch.
  const [printedAt] = useState(() => new Date().toISOString());
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
            orders.map((order) => (
              <OrderLabel key={order.id} order={order} size={size} printedAt={printedAt} />
            ))
          )}
        </div>
      </Sheet>
      {createPortal(
        <div className="label-print">
          {orders.map((order) => (
            <OrderLabel key={order.id} order={order} size={size} printedAt={printedAt} />
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
