import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import {
  CallOutcome,
  FulfillmentStatus,
  OrderHistoryField,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  Permission,
  StatusOverride,
} from '@lytronix/validators';
import { useLocations } from '@/api/delivery';
import { useOrder } from '@/api/orders';
import { Icon } from '@/components/icon';
import { ActionBar } from '@/components/ui/action-bar';
import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { Kv } from '@/components/ui/kv';
import { RowList } from '@/components/ui/list-row';
import { SectionHead } from '@/components/ui/page';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag, type StatusTone } from '@/components/ui/status-tag';
import { Taka } from '@/components/ui/taka';
import { TimelineRow, type TimelineDot } from '@/components/ui/timeline';
import { Button } from '@/components/ui/button';
import { useErrorText } from '@/hooks/use-error-text';
import { dayKey, formatDayMonth } from '@/lib/dates';
import { initialOf } from '@/lib/initial';
import { bangladeshiPhone } from '@/lib/phone';
import { walletColour } from '@/lib/wallet-marks';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import type { Order, OrderCall, OrderHistory, OrderItem, OrderPayment } from '@/types/orders';
import { OrderSheets, type OrderSheet } from './order-actions';
import { choicesOf, voidable } from './order-choices';
import { atCounter, useOrderWords } from './order-words';

/** A call's chip and dot: confirmed in green, no answer in amber, call later in blue, cancelled in red. */
const CALL_LOOK: Record<CallOutcome, { tone: StatusTone; dot: TimelineDot; word: string }> = {
  [CallOutcome.Confirmed]: { tone: 'ok', dot: 'on', word: 'outConfirmed' },
  [CallOutcome.NoAnswer]: { tone: 'warn', dot: 'plain', word: 'outNoAnswer' },
  [CallOutcome.CallBackLater]: { tone: 'info', dot: 'plain', word: 'outLater' },
  [CallOutcome.Cancelled]: { tone: 'bad', dot: 'bad', word: 'outCancel' },
};

/** The order beside the list, or on its own page on a phone (the prototype's `o29Detail`). */
export function OrderDetail({ orderId }: { orderId: string }): React.JSX.Element {
  const errorText = useErrorText();
  const order = useOrder(orderId);
  if (order.data) return <OrderBody order={order.data} />;
  return order.isError ? (
    <Banner tone="bad">{errorText(order.error)}</Banner>
  ) : (
    <Card flush>
      <SkeletonRows count={4} />
    </Card>
  );
}

function OrderBody({ order }: { order: Order }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const { viewer, slug } = useShell();
  const words = useOrderWords();
  const [open, setOpen] = useState<OrderSheet | null>(null);
  const may = (permission: Permission) => allows(viewer, [permission]);
  const can = choicesOf(order, may);
  const counter = atCounter(order);
  const shown = words.status(order.status);
  const menu = can.hold || can.release || can.edit || can.cancel || can.delete || can.print;
  // QTA-03: the month's limit a ship just passed, said until the page is left.
  const [limit, setLimit] = useState<number | null>(null);

  const next = can.handOver ? (
    <Button
      onClick={() => {
        setOpen({ kind: 'handover' });
      }}
    >
      {t('handOver')}
    </Button>
  ) : can.call && order.status === OrderStatus.Pending ? (
    <CallLink
      order={order}
      onCall={() => {
        setOpen({ kind: 'call' });
      }}
    >
      <Icon name="phone" />
      {t('callTo')}
    </CallLink>
  ) : can.call && order.status === OrderStatus.Hold ? (
    <CallLink
      order={order}
      onCall={() => {
        setOpen({ kind: 'call' });
      }}
    >
      <Icon name="phone" />
      {t('callAgain')}
    </CallLink>
  ) : can.ship ? (
    <Button
      onClick={() => {
        setOpen({ kind: 'ship' });
      }}
    >
      <Icon name="truck" />
      {t('markShipped')}
    </Button>
  ) : can.deliver ? (
    <Button
      onClick={() => {
        setOpen({ kind: 'deliver' });
      }}
    >
      {t('deliveredBtn')}
    </Button>
  ) : can.returnItems ? (
    <Button
      tone="outline"
      onClick={() => {
        setOpen({ kind: 'return' });
      }}
    >
      <Icon name="undo" />
      {t('returnItems')}
    </Button>
  ) : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-[1_1_auto]">
          <h1 className="num text-[20px] leading-[1.3] font-bold [overflow-wrap:anywhere]">
            #{order.orderNumber}
          </h1>
          <p className="mt-0.5 text-[14px] text-fg-muted">
            {t('placed', {
              time: placedWhen(order.createdAt, words.time, t),
              source: words.source(order.source),
            })}
          </p>
        </div>
        <div className="ml-auto flex flex-none items-center gap-2">
          <StatusTag tone={shown.tone}>{shown.word}</StatusTag>
          {menu ? (
            <button
              type="button"
              aria-label={t('menuTitle', { number: order.orderNumber })}
              onClick={() => {
                setOpen({ kind: 'menu' });
              }}
              className="flex size-9 flex-none items-center justify-center rounded-button border border-line-strong bg-surface text-neutral-700"
            >
              <Icon name="more" />
            </button>
          ) : null}
        </div>
      </div>
      <StateBanner order={order} />
      {limit !== null ? (
        <Banner
          tone="warn"
          action={
            <Link to="/$shop/plan" params={{ shop: slug }}>
              {t('seePlans')}
            </Link>
          }
        >
          {t('limitPrompt', { limit })}
        </Banner>
      ) : null}
      <CustomerCard
        order={order}
        canCall={can.call}
        onCall={() => {
          setOpen({ kind: 'call' });
        }}
      />
      {counter ? null : <CallsCard calls={order.calls} />}
      <ItemsCard items={order.items} />
      <PricingCard order={order} />
      <PaymentsCard
        order={order}
        canRecord={can.recordPayment}
        onRecord={() => {
          setOpen({ kind: 'pay' });
        }}
        onVoid={(payment) => {
          setOpen({ kind: 'void', payment });
        }}
      />
      {counter ? null : <ShippingCard order={order} />}
      <TimelineCard order={order} />
      {next ? <ActionBar>{next}</ActionBar> : null}
      <OrderSheets
        order={order}
        open={open}
        can={can}
        onOpen={setOpen}
        onShipped={(shipped) => {
          setLimit(shipped.limitPrompt?.limit ?? null);
          setOpen(null);
        }}
        onClose={() => {
          setOpen(null);
        }}
      />
    </>
  );
}

/** "Today 11:42 am", "Yesterday 6:12 pm", or the day it was placed. */
function placedWhen(
  iso: string,
  time: (iso: string) => string,
  t: (key: string) => string,
): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const day = dayKey(iso);
  if (day === today) return `${t('today')} ${time(iso)}`;
  if (day === yesterday) return `${t('yesterday')} ${time(iso)}`;
  return `${formatDayMonth(iso)} ${time(iso)}`;
}

/** The time of something on the order: the clock for today's, the day for anything earlier. */
function useWhen(): (iso: string) => string {
  const words = useOrderWords();
  return (iso) =>
    dayKey(iso) === dayKey(new Date().toISOString()) ? words.time(iso) : formatDayMonth(iso);
}

/** Dials the customer, then asks how the call went (agreed in the 4.8a read). */
function CallLink({
  order,
  onCall,
  small = false,
  children,
}: {
  order: Order;
  onCall: () => void;
  small?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <a
      href={`tel:${order.customerPhone ?? ''}`}
      onClick={onCall}
      className={small ? buttonClass('outline', 'xs') : buttonClass('primary', 'md')}
    >
      {children}
    </a>
  );
}

/** The line for the order's state: a new order's call to make, a hold's time, a cancelled order's reason. */
function StateBanner({ order }: { order: Order }): React.JSX.Element | null {
  const { t } = useTranslation('orders');
  const words = useOrderWords();
  if (order.status === OrderStatus.Pending && !atCounter(order)) {
    return <Banner tone="info">{t('bannerNew')}</Banner>;
  }
  if (order.status === OrderStatus.Hold && order.holdUntil) {
    return (
      <Banner tone="warn">
        {t('bannerHold', { time: placedWhen(order.holdUntil, words.time, t) })}
      </Banner>
    );
  }
  if (order.status === OrderStatus.Cancelled && order.cancelReason) {
    const said = words.reasonNote(order.cancelNote);
    const reason = words.reason(order.cancelReason);
    const note = said && said !== reason ? ` · ${said}` : '';
    return (
      <Banner tone="bad">
        {t('bannerCancelled', { reason })}
        {note}
      </Banner>
    );
  }
  return null;
}

/** The customer: name, phone and Call, where it goes and their own note, and their order count (CUS-01). */
function CustomerCard({
  order,
  canCall,
  onCall,
}: {
  order: Order;
  canCall: boolean;
  onCall: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const words = useOrderWords();
  const locations = useLocations();
  const counter = atCounter(order);
  const name = order.customerErased ? t('erased') : (order.customerName ?? '');
  const zilla =
    order.location === null
      ? null
      : (locations.data?.zillas.find((each) => each.id === order.location?.zillaId) ?? null);
  const where = [
    order.deliveryAddress,
    order.location
      ? [words.named(order.location), zilla ? words.named(zilla) : null].filter(Boolean).join(', ')
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card>
      <SectionHead
        link={
          order.customerOrders !== null ? (
            <span className="text-fg-muted">{t('ordersN', { count: order.customerOrders })}</span>
          ) : undefined
        }
      >
        {t('customer')}
      </SectionHead>
      <div className="flex items-center gap-3 pt-3 pb-1">
        <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-brand-100 font-semibold text-primary-text">
          {initialOf(name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[16px] font-medium">{name}</span>
          {order.customerPhone ? (
            <span className="num text-[14px] text-fg-muted">
              {bangladeshiPhone.grouped(order.customerPhone)}
            </span>
          ) : null}
        </span>
        {canCall || (counter && order.customerPhone) ? (
          // At the counter the button only dials: a counter order keeps no calls (Part 29's `o29-takeaway`).
          <CallLink order={order} onCall={counter ? () => undefined : onCall} small>
            <Icon name="phone" />
            {t('call')}
          </CallLink>
        ) : null}
      </div>
      {counter ? (
        <p className="mt-1 text-[14px] text-fg-muted">
          {t('atCounter')} · {words.counter(order)}
        </p>
      ) : (
        <>
          {where ? <p className="mt-1 mb-2.5 text-[14px] text-fg-muted">{where}</p> : null}
          {order.shopperNote ? (
            <div className="border-t border-line pt-2">
              <div className="flex justify-between gap-3 py-2 text-[15px]">
                <span className="text-fg-muted">{t('shopperNote')}</span>
                <span className="text-right">{order.shopperNote}</span>
              </div>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** The calls made and how each went (ORD-51), the unanswered ones counted. */
function CallsCard({ calls }: { calls: OrderCall[] }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const when = useWhen();
  const missed = calls.filter((call) => call.outcome === CallOutcome.NoAnswer).length;
  return (
    <Card>
      <SectionHead
        link={
          missed > 0 ? (
            <StatusTag tone="warn">{t('noAnswer', { count: missed })}</StatusTag>
          ) : undefined
        }
      >
        {t('calls')}
      </SectionHead>
      {calls.length === 0 ? (
        <p className="mt-1.5 text-[14px] text-fg-muted">{t('noCalls')}</p>
      ) : (
        <div className="mt-2">
          {calls.map((call) => {
            const look = CALL_LOOK[call.outcome];
            return (
              <TimelineRow
                key={call.id}
                dot={look.dot}
                text={<StatusTag tone={look.tone}>{t(look.word)}</StatusTag>}
                sub={
                  <>
                    {call.note ? <span className="block">{call.note}</span> : null}
                    <span className="block">
                      {t('callBy', { who: call.by?.name ?? '', time: when(call.at) })}
                    </span>
                  </>
                }
                when=""
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** The items as ordered (ORD-46): a combo's items inside it, add-ons with their price, quantity times price. */
function ItemsCard({ items }: { items: OrderItem[] }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const words = useOrderWords();
  return (
    <Card flush>
      <div className="px-4 pt-4 pb-1">
        <h3 className="text-[16px] font-semibold">{t('itemsTitle')}</h3>
      </div>
      <RowList>
        {items.map((item) => {
          const variant = words.variant(item);
          return (
            <div key={item.id} className="flex min-h-16 items-start gap-3 px-4 py-3">
              <span className="flex size-12 flex-none items-center justify-center overflow-hidden rounded-button bg-gradient-to-br from-neutral-100 to-neutral-200 text-neutral-400">
                {item.thumbnail ? (
                  <img src={item.thumbnail.url} alt="" className="size-full object-cover" />
                ) : (
                  <Icon name="image" />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[16px] font-medium">
                  {item.productName}
                  {item.components.length > 0 ? (
                    <>
                      {' '}
                      <StatusTag tone="neutral">{t('combo')}</StatusTag>
                    </>
                  ) : null}
                </span>
                {variant ? <span className="text-[14px] text-fg-muted">{variant}</span> : null}
                {item.components.length > 0 ? (
                  <span className="text-[14px] text-fg-muted">
                    {t('inside', { items: words.inside(item) })}
                  </span>
                ) : null}
                {item.modifiers.map((modifier) => (
                  <span key={modifier.optionId} className="text-[14px] text-fg-muted">
                    {t('addOn', { name: modifier.optionName })}{' '}
                    {Number(modifier.priceChange) !== 0 ? (
                      <span className="num">{formatTaka(modifier.priceChange)}</span>
                    ) : null}
                  </span>
                ))}
                <span className="num text-[14px] text-fg-muted">
                  {Number(item.quantity)} × {formatTaka(item.unitPrice)}
                </span>
                {Number(item.returnedQuantity) > 0 ? (
                  <span className="text-[14px] text-fg-muted">
                    {t('backN', { count: Number(item.returnedQuantity) })}
                  </span>
                ) : null}
              </span>
              <span className="num flex-none text-[16px] font-semibold">
                {formatTaka(item.itemTotal)}
              </span>
            </div>
          );
        })}
      </RowList>
    </Card>
  );
}

/** The money (TAX-03): subtotal, delivery, the total with the tax inside it, then what is paid and due. */
function PricingCard({ order }: { order: Order }): React.JSX.Element {
  const { t, i18n } = useTranslation('orders');
  const counter = atCounter(order);
  const due = Number(order.due);
  const paid = Number(order.grandTotal) - due;
  const zone = order.deliveryChargeByHand
    ? t('byHand')
    : order.deliveryZone
      ? i18n.language === 'bn'
        ? order.deliveryZone.name.bn
        : order.deliveryZone.name.en
      : t('byHand');
  return (
    <Card>
      <h3 className="text-[16px] font-semibold">{t('pricing')}</h3>
      <Kv label={t('subtotal')} value={formatTaka(order.subtotal)} />
      {counter ? null : (
        <Kv label={t('deliveryZone', { zone })} value={formatTaka(order.deliveryCharge)} />
      )}
      {Number(order.discount) > 0 ? (
        <Kv label={t('discount')} value={`−${formatTaka(order.discount)}`} />
      ) : null}
      <Kv label={t('total')} value={formatTaka(order.grandTotal)} total />
      {order.taxes.map((tax) => (
        <p key={tax.name} className="-mt-0.5 mb-1.5 text-[13px] text-fg-muted">
          {t('taxIn', { name: tax.name, rate: Number(tax.rate) })}{' '}
          <span className="num">
            <Taka amount={tax.amount} />
          </span>
        </p>
      ))}
      {paid > 0 ? <Kv label={t('paid')} value={formatTaka(paid)} /> : null}
      {due === 0 && paid > 0 ? (
        <Kv label={t('due')} value={formatTaka(0)} />
      ) : due > 0 ? (
        <Kv
          label={counter || paid > 0 ? t('due') : t('cod')}
          value={<span className="font-semibold text-accent-text">{formatTaka(due)}</span>}
        />
      ) : null}
    </Card>
  );
}

/**
 * The payments received (ORD-15), each with who recorded it; a voided one struck through (ORD-22). Record payment while
 * something is due, and Void on a payment recorded by mistake, for someone who may manage payments.
 */
function PaymentsCard({
  order,
  canRecord,
  onRecord,
  onVoid,
}: {
  order: Order;
  canRecord: boolean;
  onRecord: () => void;
  onVoid: (payment: OrderPayment) => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const { viewer } = useShell();
  const may = (permission: Permission) => allows(viewer, [permission]);
  return (
    <Card>
      <SectionHead
        link={
          canRecord ? (
            <button type="button" onClick={onRecord}>
              {t('recordPay')}
            </button>
          ) : undefined
        }
      >
        {t('payment')}
      </SectionHead>
      {order.payments.length === 0 ? (
        <p className="mt-1.5 text-[14px] text-fg-muted">
          {atCounter(order) ? t('noPaymentsCounter') : t('noPayments')}
        </p>
      ) : (
        order.payments.map((payment) => (
          <PaymentRow
            key={payment.id}
            payment={payment}
            onVoid={
              voidable(payment, may)
                ? () => {
                    onVoid(payment);
                  }
                : null
            }
          />
        ))
      )}
    </Card>
  );
}

function PaymentRow({
  payment,
  onVoid,
}: {
  payment: OrderPayment;
  onVoid: (() => void) | null;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const words = useOrderWords();
  const when = useWhen();
  const wallet = walletColour(payment.method);
  const cashLike =
    payment.method === PaymentMethod.CashOnDelivery || payment.method === PaymentMethod.Cash;
  return (
    <div className="flex items-center gap-3 pt-3">
      {wallet ? (
        <span
          className="flex size-10 flex-none items-center justify-center rounded-button border border-line bg-white text-[11px] font-bold"
          style={{ color: wallet }}
        >
          {words.method(payment.method)}
        </span>
      ) : (
        <span className="flex size-10 flex-none items-center justify-center rounded-button bg-neutral-100 text-fg-muted">
          <Icon name={payment.method === PaymentMethod.CashOnDelivery ? 'truck' : 'banknote'} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={`num text-[16px] font-medium ${payment.voided ? 'text-fg-muted line-through' : ''}`}
        >
          {formatTaka(payment.amount)} ·{' '}
          {cashLike || !payment.transactionId
            ? words.method(payment.method)
            : t('trxId', { id: payment.transactionId })}
        </span>
        <span className="num text-[14px] text-fg-muted">
          {[
            payment.senderNumber ? bangladeshiPhone.grouped(payment.senderNumber) : null,
            t('payBy', { who: payment.verifiedBy?.name ?? '', time: when(payment.verifiedAt) }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {payment.voided ? (
          <span className="text-[14px] text-danger-text">
            {t('voided', { reason: payment.voided.reason })}
          </span>
        ) : null}
      </span>
      {onVoid ? (
        <Button tone="ghost" size="xs" onClick={onVoid}>
          {t('voidIt')}
        </Button>
      ) : null}
    </div>
  );
}

/** Shipping by hand (ORD-09): the courier and tracking once sent, else when they are added. */
function ShippingCard({ order }: { order: Order }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const when = useWhen();
  const shipped = order.history
    .filter(
      (each) =>
        each.field === OrderHistoryField.FulfillmentStatus && each.to === FulfillmentStatus.Shipped,
    )
    .at(-1);
  return (
    <Card>
      <h3 className="text-[16px] font-semibold">{t('shipping')}</h3>
      {order.shippedAt ? (
        <>
          <Kv label={t('courier')} value={order.courierName ?? ''} />
          <Kv
            label={t('tracking')}
            value={
              <>
                {order.trackingCode}
                {order.trackingCode && order.trackingLink ? ' · ' : null}
                {order.trackingLink ? (
                  <a
                    href={order.trackingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-primary no-underline"
                  >
                    {t('openLink')}
                  </a>
                ) : null}
              </>
            }
          />
          <Kv
            label={t('shippedBy')}
            value={[shipped?.by?.name, when(order.shippedAt)].filter(Boolean).join(' · ')}
          />
        </>
      ) : (
        <p className="mt-1.5 text-[14px] text-fg-muted">{t('notShipped')}</p>
      )}
    </Card>
  );
}

/** What happened to the order, newest first. */
function TimelineCard({ order }: { order: Order }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const when = useWhen();
  const line = useTimelineLine(order);
  const lines = [...order.history]
    .reverse()
    .map((each, index) => ({ key: index, each, shown: line(each) }))
    .filter((row) => row.shown !== null);
  return (
    <Card>
      <h3 className="text-[16px] font-semibold">{t('timeline')}</h3>
      <div className="mt-2">
        {lines.map(({ key, each, shown }) =>
          shown ? (
            <TimelineRow
              key={key}
              dot={shown.dot}
              text={shown.text}
              sub={shown.sub || undefined}
              when={when(each.at)}
            />
          ) : null,
        )}
      </div>
    </Card>
  );
}

/** How a history entry reads on the timeline; null for one it leaves out (a payment's status, on Payments). */
function useTimelineLine(order: Order) {
  const { t } = useTranslation('orders');
  const words = useOrderWords();
  const counter = atCounter(order);
  const by = (each: OrderHistory) => each.by?.name ?? null;
  const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');

  return (each: OrderHistory): { dot: TimelineDot; text: string; sub: string } | null => {
    switch (each.field) {
      case OrderHistoryField.Created:
        return {
          dot: 'plain',
          text: t('tlPlaced'),
          sub: join(
            words.source(order.source),
            order.source === OrderSource.Dashboard ? by(each) : null,
          ),
        };
      case OrderHistoryField.Confirmed:
        return { dot: 'on', text: t('tlConfirmed'), sub: join(each.note, by(each)) };
      case OrderHistoryField.StatusOverride:
        if (each.to === StatusOverride.Cancelled) {
          return {
            dot: 'bad',
            text: t('tlCancelled'),
            sub: join(words.reasonNote(each.note), by(each)),
          };
        }
        if (each.to === StatusOverride.Hold) {
          return { dot: 'plain', text: t('tlHold'), sub: join(each.note, by(each)) };
        }
        if (each.to === StatusOverride.InReview) {
          return { dot: 'plain', text: t('tlInReview'), sub: join(each.note, by(each)) };
        }
        return { dot: 'plain', text: t('tlReleased'), sub: join(each.note, by(each)) };
      case OrderHistoryField.FulfillmentStatus:
        if (each.to === FulfillmentStatus.Shipped) {
          return counter
            ? null
            : { dot: 'on', text: t('tlShipped'), sub: join(order.courierName, order.trackingCode) };
        }
        if (each.to === FulfillmentStatus.Delivered) {
          const collected = order.payments.find(
            (payment) =>
              payment.voided === null &&
              (payment.method === PaymentMethod.CashOnDelivery ||
                (counter && payment.method === PaymentMethod.Cash)),
          );
          return {
            dot: 'on',
            text: counter ? t('tlHandedOver') : t('tlDelivered'),
            sub: collected
              ? `${formatTaka(collected.amount)} ${words.method(collected.method)}`
              : join(by(each)),
          };
        }
        if (each.to === FulfillmentStatus.Returned) {
          return { dot: 'plain', text: t('tlReturned'), sub: join(each.note, by(each)) };
        }
        return null;
      case OrderHistoryField.UnitPrice:
        return {
          dot: 'plain',
          text: t('tlPrice'),
          sub: t('tlPriceSub', {
            product: each.note ?? '',
            from: formatTaka(each.from ?? 0),
            to: formatTaka(each.to ?? 0),
          }),
        };
      case OrderHistoryField.DeliveryCharge:
        return {
          dot: 'plain',
          text: t('tlDeliveryCharge'),
          sub: `${formatTaka(each.from ?? 0)} → ${formatTaka(each.to ?? 0)}`,
        };
      case OrderHistoryField.Return:
        return { dot: 'plain', text: t('tlItemsBack'), sub: join(each.note, by(each)) };
      default:
        return null;
    }
  };
}
