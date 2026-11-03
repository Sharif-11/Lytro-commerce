import { PaymentPolicy } from '@lytronix/validators/enums';
import type { DeliveryEstimate, EstimateLine } from '../api/storefront-api';
import { addOnsPriceOf, type CartLine, lineKey } from './cart-store';

// Slice 12b's read: each time the cart opens its lines are checked against the shop, in the one delivery estimate it
// asks anyway. A line still sold shows the shop's price now, and says so when that changed since it was added; one
// sold out, or no longer sold, stays visible but out of the total. Slice 4.8e: so does a line whose add-ons no longer
// fit, or the order refused as sold out. Until the answer comes, the lines are as kept.

export type CartLineState = 'kept' | 'ready' | 'changed' | 'out' | 'gone' | 'refit';

export interface CheckedLine {
  line: CartLine;
  /** Its key in the cart. */
  key: string;
  state: CartLineState;
  /** The unit price shown: the shop's now, or the kept one until the check answers. */
  price: string;
  /** The kept price, when the shop's has changed since. */
  was: string | null;
  /** The line's total, from the server's pricing once checked; null for a line out of the total. */
  total: number | null;
  /** PRD-08: the advance the line's product asks, when it asks one. */
  advance: number | null;
  /** PRD-08 (Slice 4.8e): how it is paid for, once the check knows. */
  paymentPolicy: PaymentPolicy | null;
}

export interface CheckedCart {
  lines: CheckedLine[];
  /** The units counted in the total. */
  items: number;
  subtotal: number;
  /** Whether any line can be ordered. */
  orderable: boolean;
}

/** PRD-08: whether a line must be paid for before delivery; until Phase 5 such a line cannot be ordered here. */
export function paysFirst(line: CheckedLine): boolean {
  return line.paymentPolicy !== null && line.paymentPolicy !== PaymentPolicy.None;
}

/** Whether a line is out of the total and must be removed before an order can be placed. */
export function isOffLine(line: CheckedLine): boolean {
  return line.state === 'out' || line.state === 'gone' || line.state === 'refit';
}

/** Answers each line by the next unused answer for its variant, so a line just removed or added never reads another's. */
function answerer(
  estimate: DeliveryEstimate | null,
): (variantId: string) => EstimateLine | undefined {
  const waiting = new Map<string, EstimateLine[]>();
  for (const line of estimate?.lines ?? []) {
    waiting.set(line.variantId, [...(waiting.get(line.variantId) ?? []), line]);
  }
  return (variantId) => waiting.get(variantId)?.shift();
}

/** The cart's lines as they stand, by the estimate asked for these lines and quantities, or as kept. `refused` holds the
    keys of lines the shop just refused as sold out, though the last check could still sell them. */
export function checkCart(
  lines: readonly CartLine[],
  estimate: DeliveryEstimate | null,
  refused: ReadonlySet<string> = new Set(),
): CheckedCart {
  const answerFor = answerer(estimate);
  const checked = lines.map((line): CheckedLine => {
    const key = lineKey(line);
    const off = (state: CartLineState, price: string): CheckedLine => ({
      line,
      key,
      state,
      price,
      was: null,
      total: null,
      advance: null,
      paymentPolicy: null,
    });
    if (refused.has(key)) return off('out', line.price);
    const now = answerFor(line.variantId);
    if (!now) {
      return {
        line,
        key,
        state: 'kept',
        price: line.price,
        was: null,
        total: (Number(line.price) + addOnsPriceOf(line)) * line.quantity,
        advance: null,
        paymentPolicy: null,
      };
    }
    if (!now.onSale || now.price === null) return off('gone', line.price);
    if (!now.available) return off('out', now.price);
    if (!now.choicesFit) return off('refit', now.price);
    const changed = Number(now.price) !== Number(line.price);
    const advance = now.advance === null ? 0 : Number(now.advance);
    return {
      line,
      key,
      state: changed ? 'changed' : 'ready',
      price: now.price,
      was: changed ? line.price : null,
      total:
        now.itemTotal === null
          ? (Number(now.price) + addOnsPriceOf(line)) * line.quantity
          : Number(now.itemTotal),
      advance: advance > 0 ? advance : null,
      paymentPolicy: now.paymentPolicy,
    };
  });
  const counted = checked.filter((line) => line.total !== null);
  return {
    lines: checked,
    items: counted.reduce((sum, line) => sum + line.line.quantity, 0),
    subtotal: counted.reduce((sum, line) => sum + (line.total ?? 0), 0),
    orderable: counted.length > 0,
  };
}

/** What a delivery charge makes of a sum: the exact charge once there is one, else the shop's range, else the sum. */
export function totalWith(
  subtotal: number,
  exact: number | null,
  range: { from: string; to: string } | null,
): { from: number; to: number } {
  if (exact !== null) return { from: subtotal + exact, to: subtotal + exact };
  if (range !== null) {
    return { from: subtotal + Number(range.from), to: subtotal + Number(range.to) };
  }
  return { from: subtotal, to: subtotal };
}
