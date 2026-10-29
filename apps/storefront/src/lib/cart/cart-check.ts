import type { DeliveryEstimate } from '../api/storefront-api';
import type { CartLine } from './cart-store';

// Slice 12b's read: each time the cart opens its lines are checked against the shop, in the one delivery estimate it
// asks anyway. A line still sold shows the shop's price now, and says so when that changed since it was added; one
// sold out, or no longer sold, stays visible but out of the total. Until the answer comes, the lines are as kept.

export type CartLineState = 'kept' | 'ready' | 'changed' | 'out' | 'gone';

export interface CheckedLine {
  line: CartLine;
  state: CartLineState;
  /** The unit price shown: the shop's now, or the kept one until the check answers. */
  price: string;
  /** The kept price, when the shop's has changed since. */
  was: string | null;
  /** The line's total, from the server's pricing once checked; null for a line out of the total. */
  total: number | null;
  /** PRD-08: the advance the line's product asks, when it asks one. */
  advance: number | null;
}

export interface CheckedCart {
  lines: CheckedLine[];
  /** The units counted in the total. */
  items: number;
  subtotal: number;
  /** Whether any line can be ordered. */
  orderable: boolean;
}

/** The cart's lines as they stand, by the estimate asked for exactly these lines and quantities, or as kept. */
export function checkCart(
  lines: readonly CartLine[],
  estimate: DeliveryEstimate | null,
): CheckedCart {
  const answered = new Map(estimate?.lines.map((line) => [line.variantId, line]) ?? []);
  const checked = lines.map((line): CheckedLine => {
    const now = answered.get(line.variantId);
    if (!now) {
      return {
        line,
        state: 'kept',
        price: line.price,
        was: null,
        total: Number(line.price) * line.quantity,
        advance: null,
      };
    }
    if (!now.onSale || now.price === null) {
      return { line, state: 'gone', price: line.price, was: null, total: null, advance: null };
    }
    if (!now.available) {
      return { line, state: 'out', price: now.price, was: null, total: null, advance: null };
    }
    const changed = Number(now.price) !== Number(line.price);
    const advance = now.advance === null ? 0 : Number(now.advance);
    return {
      line,
      state: changed ? 'changed' : 'ready',
      price: now.price,
      was: changed ? line.price : null,
      total: now.itemTotal === null ? Number(now.price) * line.quantity : Number(now.itemTotal),
      advance: advance > 0 ? advance : null,
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
