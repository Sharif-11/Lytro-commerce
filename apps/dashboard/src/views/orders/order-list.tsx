import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { OrderStatus, type CancelReason } from '@lytronix/validators';
import {
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
import { dayLabel, groupByDay } from '@/lib/dates';
import { useShell } from '@/shell/shell-context';
import type { OrderSummary } from '@/types/orders';
import { CANCEL_REASONS, atCounter, useOrderWords } from './order-words';

const TAB_WORD: Record<OrderTab, string> = {
  pending: 'tabConfirm',
  confirmed: 'tabConfirmed',
  hold: 'tabHold',
  shipped: 'tabShipped',
  all: 'tabAll',
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
}: {
  filter: OrderFilter;
  onTab: (tab: OrderTab, reason?: CancelReason) => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const [more, setMore] = useState(false);
  const inMore = (MORE_TABS as readonly OrderTab[]).includes(filter.tab);
  return (
    <>
      {/* Beside an order the column is narrow: the tabs wrap there (the prototype's `.split .list-col .chips`). */}
      <ChipRow role="group" className="lg:flex-wrap lg:overflow-visible">
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
 * One order (the prototype's `o29Row`): its full number and the customer; where it goes or the counter's chip, its
 * items, and what needs doing -- the unanswered calls, a hold's time, a cancelled order's reason; the total over its
 * status.
 */
function OrderRow({
  order,
  selected,
  search,
  picking,
}: {
  order: OrderSummary;
  selected: boolean;
  search: Record<string, string | undefined>;
  picking: Picking | null;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const { slug } = useShell();
  const words = useOrderWords();
  const shown = words.status(order.status);
  const note =
    order.status === OrderStatus.Hold && order.holdUntil ? (
      <span className="text-warning">{t('callAt', { time: words.time(order.holdUntil) })}</span>
    ) : order.unansweredCalls > 0 &&
      (order.status === OrderStatus.Pending || order.status === OrderStatus.Hold) ? (
      <span className="text-warning">{t('noAnswer', { count: order.unansweredCalls })}</span>
    ) : order.status === OrderStatus.Cancelled && order.cancelReason ? (
      words.reason(order.cancelReason)
    ) : null;
  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[16px] font-medium">
          <span className="num mr-1.5 font-semibold text-fg-muted">#{order.orderNumber}</span>
          {order.customerErased ? t('erased') : (order.customerName ?? '')}
        </span>
        <span className="truncate text-[14px] text-fg-muted">
          {atCounter(order) ? (
            <span className="mr-1.5">
              <StatusTag tone="neutral">{words.counter(order)}</StatusTag>
            </span>
          ) : order.area ? (
            `${words.area(order.area)} · `
          ) : null}
          {t('items', { count: order.items })}
          {note ? <> · {note}</> : null}
        </span>
      </span>
      <span className="flex flex-none flex-col items-end gap-1 text-right">
        <span className="num text-[16px] font-semibold">{formatTaka(order.grandTotal)}</span>
        <StatusTag tone={shown.tone}>{shown.word}</StatusTag>
      </span>
    </>
  );
  // Picking to print: the row ticks itself rather than opening the order.
  return picking ? (
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

/** Orders placed between two days (ORD-13), as Part 29's `o29-dates` draws it. */
export function DatesSheet({
  open,
  filter,
  onShow,
  onClose,
}: {
  open: boolean;
  filter: OrderFilter;
  onShow: (from: string | undefined, to: string | undefined) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const [from, setFrom] = useState(filter.from ?? '');
  const [to, setTo] = useState(filter.to ?? '');
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
              onShow(undefined, undefined);
            }}
          >
            {t('datesClear')}
          </Button>
          <Button
            onClick={() => {
              onShow(from || undefined, to || undefined);
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
    </Sheet>
  );
}
