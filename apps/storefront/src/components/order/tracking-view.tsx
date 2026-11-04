import { OrderStatus } from '@lytronix/validators/enums';
import type { TrackedItem, TrackedOrder, TrackingStepName } from '@/lib/api/storefront-api';
import { dayMonthTime } from '@/lib/i18n/dates';
import { money, type Words } from '@/lib/i18n/words';
import { quantityText } from '@/lib/order/order-form';
import { Icon } from '../icon';
import { LineExtras, SummaryLine, TaxRows } from './order-parts';

// ORD-17, SFT-08 (the prototype's `tracking`, Slice 4.8e): the ID search, the order's steps with their times, its courier
// once shipped, and its items and totals beside them. Never the customer's address or phone.

const STEPS = ['placed', 'confirmed', 'shipped', 'delivered'] as const;
type Step = (typeof STEPS)[number];

export function SearchBox({ value, words }: { value: string; words: Words }) {
  return (
    <form className="sbox" action="/track" method="get" role="search">
      <Icon name="search" />
      <input
        name="id"
        aria-label={words.t('tr_id')}
        placeholder={words.t('tr_id')}
        defaultValue={value}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        style={{ fontFamily: 'ui-monospace,Menlo,monospace', letterSpacing: '.08em' }}
      />
      <button type="submit" className="btn sm dark">
        {words.t('tr_find')}
      </button>
    </form>
  );
}

/** `/track` with nothing to look for yet. */
export function TrackingStart({ words }: { words: Words }) {
  return (
    <>
      <div>
        <h1 className="pt">{words.t('tr_title')}</h1>
        <div className="sub">{words.t('e48TrackHint')}</div>
      </div>
      <SearchBox value="" words={words} />
    </>
  );
}

/** An ID that finds nothing, or too many looks in a minute (RTE-06). */
export function TrackingRefused({
  trackingId,
  busy,
  words,
}: {
  trackingId: string;
  busy: boolean;
  words: Words;
}) {
  return (
    <>
      <div>
        <h1 className="pt">{words.t('tr_title')}</h1>
      </div>
      <SearchBox value={trackingId} words={words} />
      <div className="banner bad" role="alert">
        <Icon name="warn" />
        <span>{busy ? words.t('e48BusyP') : words.t('e48TrackNone')}</span>
      </div>
    </>
  );
}

/** The furthest step the order has taken. */
function stageOf(order: TrackedOrder): Step {
  const taken = new Set<TrackingStepName>(order.timeline.map((row) => row.step));
  return [...STEPS].reverse().find((step) => taken.has(step)) ?? 'placed';
}

function isCancelled(order: TrackedOrder): boolean {
  return order.status === OrderStatus.Cancelled || order.status === OrderStatus.Rejected;
}

function isReturned(order: TrackedOrder): boolean {
  return order.status === OrderStatus.Returned || order.status === OrderStatus.Refunded;
}

function courierLine(courier: NonNullable<TrackedOrder['courier']>, words: Words): string {
  const named = words.t('tr_courier', {
    c: courier.name ?? '',
    code: courier.trackingCode ?? '',
  });
  // Staff may have typed either alone: no empty half, and no dangling dot.
  return courier.trackingCode ? named : named.replace(/ · $/, '');
}

function itemDetail(item: TrackedItem, words: Words): string {
  const options = item.attributes.map((row) => row.value).join(' · ');
  const quantity = quantityText(item.quantity, item.stockUnit, words);
  return options === '' ? `× ${quantity}` : `${options} × ${quantity}`;
}

function partsOf(item: TrackedItem): string | null {
  if (item.components.length === 0) return null;
  return item.components
    .map((part) => {
      const name = [part.productName, ...part.attributes.map((row) => row.value)].join(' ');
      const units = Number(part.quantity);
      return units === 1 ? name : `${name} × ${String(units)}`;
    })
    .join(', ');
}

export function TrackingView({
  order,
  words,
  showAccount,
}: {
  order: TrackedOrder;
  words: Words;
  /** ORD-18: the way to every order with the phone; a landing page's frame has none. */
  showAccount: boolean;
}) {
  const at = new Map(order.timeline.map((row) => [row.step, row.at]));
  const when = (step: TrackingStepName) => {
    const time = at.get(step);
    return time === undefined ? '' : dayMonthTime(time);
  };
  const cancelled = isCancelled(order);
  const stage = stageOf(order);
  const index = STEPS.indexOf(stage);
  // Only a shipped order has one, and a shipped order is returned, never cancelled (ORD-52).
  const { courier } = order;
  const stageWord = `tr_${stage}` as const;

  return (
    <>
      <div>
        <h1 className="pt">{words.t('tr_title')}</h1>
      </div>
      <SearchBox value={order.trackingId} words={words} />
      {cancelled ? (
        <div className="banner bad">
          <Icon name="warn" />
          <span>{words.t('e48CancelledP')}</span>
        </div>
      ) : null}
      <div className="two">
        <div className="card2">
          <div className="sechead">
            <h3>#{order.orderNumber}</h3>
            {cancelled ? (
              <span className="st out">{words.t('e48Cancelled')}</span>
            ) : isReturned(order) ? (
              <span className="st out">{words.t('e48Returned')}</span>
            ) : (
              <span className="st ok plain">{words.t(stageWord)}</span>
            )}
          </div>
          <div className="tl">
            {cancelled ? (
              <>
                <div className="s done">
                  <div className="t">{words.t('tr_placed')}</div>
                  <div className="d">{when('placed')}</div>
                </div>
                <div className="s now">
                  <div className="t" style={{ color: 'var(--danger)' }}>
                    {words.t('e48Cancelled')}
                  </div>
                  <div className="d">{when('cancelled')}</div>
                </div>
              </>
            ) : (
              STEPS.map((step, position) => {
                const state =
                  position < index
                    ? 'done'
                    : position === index
                      ? stage === 'placed'
                        ? 'now'
                        : 'done'
                      : 'todo';
                return (
                  <div className={`s ${state}`} key={step}>
                    <div className="t">{words.t(`tr_${step}`)}</div>
                    {state === 'todo' ? null : (
                      <div className="d">
                        {stage === 'placed' ? words.t('e48WaitCall') : when(step)}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {courier ? (
            <div className="line">
              <Icon name="truck" />
              <span>
                {courierLine(courier, words)}
                {courier.trackingLink ? (
                  <>
                    {' · '}
                    <a
                      className="lnk"
                      style={{ color: 'var(--accent-text)' }}
                      href={courier.trackingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {words.t('e48OpenLink')}
                    </a>
                  </>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>
        <div className="side card2">
          <h3>{words.t('tr_items')}</h3>
          {order.items.map((item, position) => (
            <SummaryLine
              key={position}
              name={item.productName}
              image={null}
              detail={itemDetail(item, words)}
              total={item.itemTotal}
            >
              <LineExtras
                parts={partsOf(item)}
                addOns={item.modifiers.map((row) => ({
                  name: row.optionName,
                  price: row.priceChange,
                }))}
                answers={item.captured}
                words={words}
              />
            </SummaryLine>
          ))}
          <div className="sum">
            <div className="r">
              <span className="k">{words.t('subtotal')}</span>
              <span>{money(order.subtotal)}</span>
            </div>
            <div className="r">
              <span className="k">{words.t('delivery')}</span>
              <span>{money(order.deliveryCharge)}</span>
            </div>
            {Number(order.discount) > 0 ? (
              <div className="r">
                <span className="k">{words.t('discount')}</span>
                <span>−{money(order.discount)}</span>
              </div>
            ) : null}
            <div className="r total">
              <span>{words.t('grand_total')}</span>
              <span className="price">{money(order.grandTotal)}</span>
            </div>
            <TaxRows taxes={order.taxes} words={words} />
          </div>
          {showAccount ? (
            <a className="btn ghost block" href="/account">
              <Icon name="user" />
              {words.t('tr_phone')}
            </a>
          ) : null}
        </div>
      </div>
    </>
  );
}
