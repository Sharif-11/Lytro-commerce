import { useTranslation } from 'react-i18next';
import {
  CancelReason,
  FulfilmentType,
  OrderSource,
  OrderStatus,
  PaymentMethod,
} from '@lytronix/validators';
import type { StatusTone } from '@/components/ui/status-tag';
import { formatTime } from '@/lib/dates';
import type { OrderArea, OrderItem, OrderSummary } from '@/types/orders';

/** Each visible status's chip (ORD-41, the prototype's `STATUS` with Part 29's New, Confirmed and On hold). */
const STATUS: Record<OrderStatus, [StatusTone, string]> = {
  [OrderStatus.Pending]: ['warn', 'stPending'],
  [OrderStatus.Confirmed]: ['info', 'stConfirmed'],
  [OrderStatus.Hold]: ['warn', 'stHold'],
  [OrderStatus.Shipped]: ['info', 'stShipped'],
  [OrderStatus.Delivered]: ['ok', 'stDelivered'],
  [OrderStatus.Returned]: ['neutral', 'stReturned'],
  [OrderStatus.Cancelled]: ['bad', 'stCancelled'],
  [OrderStatus.Processing]: ['info', 'stProcessing'],
  [OrderStatus.Unverified]: ['neutral', 'stUnverified'],
  [OrderStatus.InReview]: ['warn', 'stInReview'],
  [OrderStatus.PartialDelivered]: ['ok', 'stPartialDelivered'],
  [OrderStatus.Completed]: ['ok', 'stCompleted'],
  [OrderStatus.Refunded]: ['neutral', 'stRefunded'],
  [OrderStatus.Rejected]: ['bad', 'stRejected'],
};

/** ORD-52's reasons, in the order the cancel sheet lists them. */
export const CANCEL_REASONS: readonly CancelReason[] = [
  CancelReason.CustomerCancelled,
  CancelReason.FakeOrder,
  CancelReason.Unreachable,
  CancelReason.OutOfStock,
  CancelReason.Duplicate,
  CancelReason.Other,
];

/** A reason by its value, for a note the server wrote as the reason itself. */
const REASON_OF = new Map<string, CancelReason>(CANCEL_REASONS.map((each) => [each, each]));

const REASON: Record<CancelReason, string> = {
  [CancelReason.CustomerCancelled]: 'rCustomerCancelled',
  [CancelReason.FakeOrder]: 'rFakeOrder',
  [CancelReason.Unreachable]: 'rUnreachable',
  [CancelReason.OutOfStock]: 'rOutOfStock',
  [CancelReason.Duplicate]: 'rDuplicate',
  [CancelReason.Other]: 'rOther',
};

const SOURCE: Record<OrderSource, string> = {
  [OrderSource.Storefront]: 'srcStorefront',
  [OrderSource.LandingPage]: 'srcLanding',
  [OrderSource.Dashboard]: 'srcDashboard',
  [OrderSource.Api]: 'srcApi',
};

const METHOD: Record<PaymentMethod, string> = {
  [PaymentMethod.CashOnDelivery]: 'mCashOnDelivery',
  [PaymentMethod.Cash]: 'mCash',
  [PaymentMethod.Bkash]: 'mBkash',
  [PaymentMethod.Nagad]: 'mNagad',
  [PaymentMethod.Rocket]: 'mRocket',
  [PaymentMethod.Upay]: 'mUpay',
  [PaymentMethod.Bank]: 'mBank',
};

/** Handed over at the counter rather than sent: no calls, address or shipping (MNU-04). */
export const atCounter = (order: { fulfilmentType: FulfilmentType }): boolean =>
  order.fulfilmentType !== FulfilmentType.Delivery;

/** How orders read: their status chips, reasons, sources, payment methods, areas and items. */
export function useOrderWords() {
  const { t, i18n } = useTranslation('orders');
  const bn = i18n.language === 'bn';

  const status = (state: OrderStatus): { tone: StatusTone; word: string } => {
    const [tone, key] = STATUS[state];
    return { tone, word: t(key) };
  };

  const reason = (why: CancelReason): string => t(REASON[why]);

  /** A cancel's note read back: the reason's word when the server kept the reason itself as the note. */
  const reasonNote = (note: string | null): string | null => {
    if (note === null) return null;
    const known = REASON_OF.get(note);
    return known === undefined ? note : reason(known);
  };

  const source = (from: OrderSource): string => t(SOURCE[from]);

  const method = (how: PaymentMethod): string => t(METHOD[how]);

  /** "Mirpur, Dhaka": the thana and its district, in the reader's language. */
  const area = (where: OrderArea): string =>
    bn
      ? `${where.thana.nameBn}, ${where.zilla.nameBn}`
      : `${where.thana.nameEn}, ${where.zilla.nameEn}`;

  /** A thana's or district's name in the reader's language. */
  const named = (place: { nameEn: string; nameBn: string }): string =>
    bn ? place.nameBn : place.nameEn;

  /** A counter order's chip: Takeaway, or its table (MNU-04). */
  const counter = (order: Pick<OrderSummary, 'fulfilmentType' | 'tableRef'>): string =>
    order.fulfilmentType === FulfilmentType.DineIn && order.tableRef
      ? t('table', { table: order.tableRef })
      : t('takeaway');

  /** "L · Black": the values that make the variant, then what the customer asked for (ATR-08). */
  const variant = (item: Pick<OrderItem, 'attributes' | 'captured'>): string =>
    [
      ...item.attributes.filter((each) => each.variantDefining).map((each) => each.value),
      ...item.captured.map((each) => `${each.name}: ${each.value}`),
    ].join(' · ');

  /** A combo's items as ordered: "Cotton panjabi · M, Check lungi" (CMB-04). */
  const inside = (item: Pick<OrderItem, 'components'>): string =>
    item.components
      .map((part) => {
        const made = part.attributes
          .filter((each) => each.variantDefining)
          .map((each) => each.value);
        const many = Number(part.quantity) > 1 ? ` ×${String(Number(part.quantity))}` : '';
        return [part.productName, ...made].join(' · ') + many;
      })
      .join(', ');

  const time = (iso: string): string => formatTime(iso, i18n.language);

  return {
    status,
    reason,
    reasonNote,
    source,
    method,
    area,
    named,
    counter,
    variant,
    inside,
    time,
  };
}
