import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { OrderAccess, OrderSource, OrderStatus, type CancelReason } from '@lytronix/validators';
import {
  LOOK_TAB,
  MORE_TABS,
  ORDER_TABS,
  useOrderCount,
  type OrderFilter,
  type OrderTab,
} from '@/api/orders';
import { Button } from '@/components/ui/button';
import { CheckBox } from '@/components/ui/check-row';
import { Chip, ChipRow } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { RowChevron, RowList } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { StatusTag } from '@/components/ui/status-tag';
import { Icon } from '@/components/icon';
import { dayLabel, groupByDay } from '@/lib/dates';
import { bangladeshiPhone } from '@/lib/phone';
import { useShell } from '@/shell/shell-context';
import type { OrderSummary } from '@/types/orders';
import { CANCEL_REASONS, atCounter, useOrderWords } from './order-words';

const TAB_WORD: Record<OrderTab, string> = {
  pending: 'tabConfirm',
  confirmed: 'tabConfirmed',
  processing: 'tabProcessing',
  hold: 'tabHold',
  shipped: 'tabShipped',
  all: 'tabAll',
  look: 'crTabLook',
  delivered: 'tabDelivered',
  returned: 'tabReturned',
  cancelled: 'tabCancelled',
};

/** The day groups' headings (the prototype's `.daylbl`): Today, Yesterday, then Earlier for everything before. */
type Day = 'today' | 'yesterday' | 'earlier';

function groupsOf(orders: OrderSummary[]): { day: Day; orders: OrderSummary[] }[] {
  const groups: { day: Day; orders: OrderSummary[] }[] = [];
  for (const group of groupByDay(orders, (order) => order.createdAt)) {
    const label = dayLabel(group.iso);
    const day: Day = label.kind === 'date' ? 'earlier' : label.kind;
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.orders.push(...group.items);
    else groups.push({ day, orders: [...group.items] });
  }
  return groups;
}

/** The tabs (agreed in the 4.8a read): the day's work first with their counts, More for the rest. */
export function OrderTabs({
  filter,
  onTab,
  short = 0,
  onShort,
}: {
  filter: OrderFilter;
  onTab: (tab: OrderTab, reason?: CancelReason) => void;
  /** INV-25 (ORDERS-BEYOND-STOCK OB-11): how many orders still wait for stock. */
  short?: number;
  onShort?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const [more, setMore] = useState(false);
  const inMore = (MORE_TABS as readonly OrderTab[]).includes(filter.tab);
  return (
    <>
      {/* Beside an order the column is narrow: the tabs wrap there (the prototype's `.split .list-col .chips`). */}
      <ChipRow role="group" className="lg:flex-wrap lg:overflow-visible">
        {/* OB-11: the orders still waiting for stock, first in the row, while there are any. */}
        {onShort && (short > 0 || filter.short === true) ? (
          <Chip
            on={filter.short === true}
            count={short}
            className={filter.short === true ? 'bg-warning text-white' : 'text-warning'}
            onClick={onShort}
          >
            <Icon name="alert" size={16} />
            {t('obs.chip')}
          </Chip>
        ) : null}
        {ORDER_TABS.map((tab) => (
          <TabChip
            key={tab}
            tab={tab}
            on={filter.tab === tab}
            onClick={() => {
              onTab(tab);
            }}
          />
        ))}
        <LookChip
          on={filter.tab === LOOK_TAB}
          onClick={() => {
            onTab(LOOK_TAB);
          }}
        />
        <Chip
          on={inMore}
          aria-haspopup="dialog"
          onClick={() => {
            setMore(true);
          }}
        >
          {inMore ? t(TAB_WORD[filter.tab]) : t('more')} ▾
        </Chip>
      </ChipRow>
      <Sheet
        open={more}
        title={t('moreTitle')}
        onClose={() => {
          setMore(false);
        }}
      >
        <RowList>
          {MORE_TABS.map((tab) => (
            <MoreRow
              key={tab}
              tab={tab}
              onClick={() => {
                setMore(false);
                onTab(tab);
              }}
            />
          ))}
        </RowList>
        <div>
          <h3 className="mb-2 text-[16px] font-semibold">{t('reasonHead')}</h3>
          <div className="flex flex-wrap gap-2">
            <Chip
              on={filter.reason === undefined}
              onClick={() => {
                setMore(false);
                onTab('cancelled');
              }}
            >
              {t('anyReason')}
            </Chip>
            {CANCEL_REASONS.map((why) => (
              <ReasonChip
                key={why}
                reason={why}
                counted={more}
                on={filter.tab === 'cancelled' && filter.reason === why}
                onClick={() => {
                  setMore(false);
                  onTab('cancelled', why);
                }}
              />
            ))}
          </div>
        </div>
      </Sheet>
    </>
  );
}

function TabChip({
  tab,
  on,
  onClick,
}: {
  tab: OrderTab;
  on: boolean;
  onClick: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const count = useOrderCount(tab);
  return (
    <Chip on={on} count={count.data ?? null} onClick={onClick}>
      {t(TAB_WORD[tab])}
    </Chip>
  );
}

/**
 * Needs a look (agreed 2026-11-06), after the day's tabs: what couriers reported that staff should check, with its count. It
 * shows while anything waits, or while it is the tab open.
 */
function LookChip({ on, onClick }: { on: boolean; onClick: () => void }): React.JSX.Element | null {
  const { t } = useTranslation('orders');
  const count = useOrderCount(LOOK_TAB);
  if (!on && !count.data) return null;
  return (
    <Chip on={on} count={count.data ?? null} onClick={onClick}>
      {t(TAB_WORD[LOOK_TAB])}
    </Chip>
  );
}

function MoreRow({ tab, onClick }: { tab: OrderTab; onClick: () => void }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const count = useOrderCount(tab);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left"
    >
      <span className="flex-1 text-[16px] font-medium">{t(TAB_WORD[tab])}</span>
      <span className="num text-fg-muted">{count.data ?? ''}</span>
      <RowChevron />
    </button>
  );
}

/** A cancel reason, with how many orders it cancelled once there are any (Part 29's `o29-more`). */
function ReasonChip({
  reason,
  counted,
  on,
  onClick,
}: {
  reason: CancelReason;
  counted: boolean;
  on: boolean;
  onClick: () => void;
}): React.JSX.Element {
  const words = useOrderWords();
  const count = useOrderCount('cancelled', { reason, enabled: counted });
  return (
    <Chip on={on} count={count.data ? count.data : null} onClick={onClick}>
      {words.reason(reason)}
    </Chip>
  );
}

/** The rows under Today, Yesterday and Earlier, the open one marked on a desktop. */
/** Orders being picked to print their labels (Part 29's `o29-select`): which, and a pick. */
export interface Picking {
  picked: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

export function OrderRows({
  orders,
  selected,
  search,
  picking = null,
}: {
  orders: OrderSummary[];
  selected: string | null;
  search: Record<string, string | undefined>;
  picking?: Picking | null;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  return (
    <div>
      {groupsOf(orders).map((group) => (
        <div key={group.day}>
          <div className="bg-neutral-50 px-4 pt-3 pb-1 text-[13px] font-semibold text-neutral-700">
            {t(group.day)}
          </div>
          <RowList>
            {group.orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                selected={order.id === selected}
                search={search}
                picking={picking}
              />
            ))}
          </RowList>
        </div>
      ))}
    </div>
  );
}

/**
 * One order (the prototype's `o29Row`, as ORDERS-BEYOND-STOCK OB-20 has it -- the owner, 2026-11-25: "in order list just
 * customer phone number, his address and order total and the image", keeping the status, the "স্টক কম" chip and the
 * name): the photos its lines were ordered with, the customer's name and phone, the address on two lines (the delivery
 * line, then thana and zilla, each cut with "…"), the total and the status, and what it still waits for. A locked
 * pay-as-you-go order shows its masked name and phone and its zilla alone (PF-21, PF-25).
 */
export function OrderRow({
  order,
  selected,
  search,
  picking,
  wide = false,
}: {
  order: OrderSummary;
  selected: boolean;
  search: Record<string, string | undefined>;
  picking: Picking | null;
  /** On a page of its own, not the list beside an open order (a customer's orders, the search): today's time too. */
  wide?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const { slug } = useShell();
  const words = useOrderWords();
  const shown = words.status(order.status);
  const short = Number(order.short);
  // The owner, 2026-11-25: a held order's call-back time stays on its row.
  const callBack = order.status === OrderStatus.Hold ? order.holdUntil : null;
  const phone =
    order.customerPhone === null
      ? null
      : // PF-7: a locked order's phone is already masked (017•••••842); any other is one run of digits (#447).
        order.access === OrderAccess.Locked
        ? order.customerPhone
        : bangladeshiPhone.display(order.customerPhone);
  const content = (
    <>
      {/* OB-20: the number isn't shown, but a screen reader still names the order by it. */}
      <span className="sr-only">#{order.orderNumber} </span>
      <OrderThumbs thumbs={order.thumbs} lines={order.items} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[16px] font-medium">
          {order.customerErased ? t('erased') : (order.customerName ?? '')}
        </span>
        {phone !== null && !order.customerErased ? (
          <span className="num truncate text-[15px] text-fg-muted">{phone}</span>
        ) : null}
        {atCounter(order) ? (
          <span>
            <StatusTag tone="neutral">{words.counter(order)}</StatusTag>
          </span>
        ) : (
          <>
            {order.deliveryAddress ? (
              <span className="truncate text-[14px] text-fg-muted">{order.deliveryAddress}</span>
            ) : null}
            {order.area ? (
              <span className="truncate text-[14px] text-fg-muted">{words.area(order.area)}</span>
            ) : null}
          </>
        )}
        {short > 0 || callBack || order.attention !== null ? (
          // OB-20 as the owner amended it (2026-11-25): what needs doing, each only when it applies -- the stock it
          // waits for, a courier's news to look at, and when to call back.
          <span className="flex flex-wrap items-center gap-1.5">
            {short > 0 ? (
              <StatusTag tone="warn">
                <Icon name="alert" size={14} />
                {t('obs.short', { count: short })}
              </StatusTag>
            ) : null}
            {order.attention !== null ? (
              <StatusTag tone="warn">
                <Icon name="alert" size={14} />
                {t('crLineLook')}
              </StatusTag>
            ) : null}
            {callBack ? (
              <span className="text-[14px] font-medium text-warning">
                {t('obs.callBack', { time: words.time(callBack) })}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      <span
        className={`flex flex-none flex-col items-end gap-1 text-right sm:flex-row sm:items-center sm:gap-4 ${wide ? '' : 'lg:flex-col lg:items-end lg:gap-1'}`}
      >
        <span className="num text-[16px] font-semibold">{formatTaka(order.grandTotal)}</span>
        {order.access === OrderAccess.Locked ? (
          <StatusTag tone="neutral">
            <Icon name="lock" size={14} />
            {t('fair.lockedTag')}
          </StatusTag>
        ) : order.access === OrderAccess.Phone && order.status === OrderStatus.Pending ? (
          <StatusTag tone="info">{t('fair.phoneTag')}</StatusTag>
        ) : (
          <StatusTag tone={shown.tone}>{shown.word}</StatusTag>
        )}
        {wide && dayLabel(order.createdAt).kind === 'today' ? (
          <span className="hidden min-w-[60px] text-right text-[13px] text-fg-subtle lg:inline">
            {words.time(order.createdAt)}
          </span>
        ) : null}
      </span>
    </>
  );
  // Picking to print: the row ticks itself rather than opening the order.
  return picking ? (
    short > 0 ? (
      // OB-9: an order still short of stock can't leave, so its label isn't printed.
      <div
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 opacity-80"
        aria-disabled="true"
      >
        <span className="w-6 flex-none" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-3">{content}</span>
          <span className="text-[13px] font-medium text-warning">{t('obs.cantPrint')}</span>
        </span>
      </div>
    ) : (
      <label className="flex min-h-16 w-full cursor-pointer items-center gap-3 px-4 py-3">
        <CheckBox
          checked={picking.picked.has(order.id)}
          label={`#${order.orderNumber}`}
          onChange={() => {
            picking.onToggle(order.id);
          }}
        />
        {content}
      </label>
    )
  ) : (
    <Link
      to="/$shop/orders/$orderId"
      params={{ shop: slug, orderId: order.id }}
      search={search}
      aria-current={selected ? 'page' : undefined}
      className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left text-[inherit] no-underline ${selected ? 'bg-primary-soft' : ''}`}
    >
      {content}
    </Link>
  );
}

const SOURCES = [
  OrderSource.Dashboard,
  OrderSource.Storefront,
  OrderSource.LandingPage,
  OrderSource.Api,
] as const;

/** Orders placed between two days (ORD-13) and from where (LND-09), as Part 34's `o29-dates` draws it. */
export function DatesSheet({
  open,
  filter,
  onShow,
  onClose,
}: {
  open: boolean;
  filter: OrderFilter;
  onShow: (
    from: string | undefined,
    to: string | undefined,
    source: OrderSource | undefined,
  ) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const [from, setFrom] = useState(filter.from ?? '');
  const [to, setTo] = useState(filter.to ?? '');
  const [source, setSource] = useState(filter.source);
  return (
    <Sheet
      open={open}
      title={t('datesTitle')}
      onClose={onClose}
      footer={
        <>
          <Button
            tone="outline"
            onClick={() => {
              setFrom('');
              setTo('');
              setSource(undefined);
              onShow(undefined, undefined, undefined);
            }}
          >
            {t('datesClear')}
          </Button>
          <Button
            onClick={() => {
              onShow(from || undefined, to || undefined, source);
            }}
          >
            {t('datesShow')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t('datesFrom')}
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => {
            setFrom(event.target.value);
          }}
        />
        <Field
          label={t('datesTo')}
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => {
            setTo(event.target.value);
          }}
        />
      </div>
      <h3 className="mt-1 text-[16px] font-semibold">{t('sourceTitle')}</h3>
      <div className="flex flex-wrap gap-2">
        <Chip
          on={source === undefined}
          onClick={() => {
            setSource(undefined);
          }}
        >
          {t('sourceAll')}
        </Chip>
        {SOURCES.map((each) => (
          <Chip
            key={each}
            on={source === each}
            onClick={() => {
              setSource(each);
            }}
          >
            {t(`source_${each}`)}
          </Chip>
        ))}
      </div>
    </Sheet>
  );
}

/**
 * OB-20: the photos an order's first lines were ordered with -- each design's own photo -- stacked, each 14 px further
 * right so its design shows, then "+N" for the lines beyond them.
 */
function OrderThumbs({ thumbs, lines }: { thumbs: string[]; lines: number }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const more = lines - thumbs.length;
  return (
    <span
      className="relative h-11 flex-none"
      style={{ width: `${String(44 + Math.max(0, thumbs.length - 1) * 14)}px` }}
      aria-hidden="true"
    >
      {thumbs.length === 0 ? (
        <span className="absolute inset-y-0 left-0 grid w-11 place-items-center rounded-[10px] bg-neutral-100 text-fg-muted">
          <Icon name="box" size={20} />
        </span>
      ) : (
        thumbs.map((url, at) => (
          <img
            key={`${String(at)} ${url}`}
            src={url}
            alt=""
            loading="lazy"
            className="absolute top-0 h-11 w-11 rounded-[10px] border-2 border-surface object-cover"
            style={{ left: `${String(at * 14)}px`, zIndex: thumbs.length - at }}
          />
        ))
      )}
      {more > 0 ? (
        <span className="num absolute -bottom-1 right-[-6px] z-10 rounded-full bg-fg px-1.5 text-[12px] font-semibold text-surface">
          {t('obs.more', { count: more })}
        </span>
      ) : null}
    </span>
  );
}
