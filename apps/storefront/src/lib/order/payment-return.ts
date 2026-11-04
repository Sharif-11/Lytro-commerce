import { OrderStatus, PaymentSessionState } from '@lytronix/validators/enums';
import type { TrackedOrder } from '../api/storefront-api';

/** PAY-08: where an order owing an advance stands, for its page to say. */
export type PaymentStanding = 'paid' | 'checking' | 'unpaid' | 'gone';

/**
 * PAY-08, PAY-11, PAY-17 (Slice 5.8's part 2): what the order's own page says of its advance, read from the order, never
 * from what the redirect claimed. Null for an order that owed none, which has the ordinary confirmation.
 */
export function paymentStandingOf(
  order: Pick<TrackedOrder, 'grandTotal' | 'codAmount' | 'status' | 'payment'>,
): PaymentStanding | null {
  if (Number(order.grandTotal) <= Number(order.codAmount)) return null;
  if (order.status === OrderStatus.Cancelled) return 'gone';
  switch (order.payment?.state) {
    case PaymentSessionState.AwaitingPayment:
      return 'unpaid';
    case PaymentSessionState.Checking:
    case PaymentSessionState.NeedsReview:
      return 'checking';
    case PaymentSessionState.Expired:
    case PaymentSessionState.Failed:
    case PaymentSessionState.Cancelled:
      return 'gone';
    case PaymentSessionState.Verified:
      return 'paid';
    case undefined:
      // A payment no longer open: taken, unless the order still waits for one.
      return order.status === OrderStatus.Unverified ? 'checking' : 'paid';
  }
}

/** PAY-03: the whole minutes an order's hold has left, never less than one while it is open. */
export function minutesLeft(expiresAt: string, now: number): number {
  return Math.max(Math.ceil((Date.parse(expiresAt) - now) / 60_000), 1);
}
