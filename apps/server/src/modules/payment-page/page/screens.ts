import {
  PaymentMethod,
  PaymentMethodKind,
  PaymentPageReviewReason,
  PaymentSessionState,
  PaymentWay,
} from '@lytronix/validators';
import type { ShopperPaymentMethod } from '../../payment-methods/types/payment-methods';
import type { PaymentPageSession } from '../../payment-sessions/types/payment-sessions';
import type { PageLanguage } from './words';

/** PAY-17: how long the page shows the ring before saying it will confirm shortly. */
const VERIFICATION_WINDOW_MS = 30_000;

/** What the page draws from: the session's read, the shop, and where a link with no return address leads. */
export interface PageData {
  ref: string;
  session: PaymentPageSession;
  shop: { name: string; logoUrl: string | null; contactPhone: string | null };
  /** The order's tracking page, on a shop whose storefront is on. */
  orderPageUrl: string | null;
}

/** What the address asks of the page. */
export interface PageAsk {
  language: PageLanguage;
  /** The wallet the shopper picked. */
  wallet: PaymentMethod | null;
  /** Back to the picker, whatever the session had chosen. */
  pick: boolean;
  /** To pay a wallet on automated by hand, after its checkout couldn't start or the shopper asked to. */
  hand: boolean;
  /** To correct a typed ID. */
  change: boolean;
  /** Arriving from paying, rather than opening the page again later. */
  just: boolean;
  reported: boolean;
}

export type PageScreen =
  | 'pick'
  | 'no-methods'
  | 'handing'
  | 'wallet'
  | 'bank'
  | 'change'
  | 'checking'
  | 'late'
  | 'manual'
  | 'verified'
  | 'verified-done'
  | 'paid'
  | 'review'
  | 'review-sender'
  | 'review-other'
  | 'rejected'
  | 'expired'
  | 'cancelled';

/** PAY-08: the session's address to return to, with its ID and status; a link with none leads to the order's page. */
export function returnAddressOf(data: PageData, status: string): string | null {
  const { returnUrl, sessionId, trackingId } = data.session;
  if (returnUrl === null) return data.orderPageUrl;
  const address = new URL(returnUrl);
  address.searchParams.set('session_id', sessionId);
  address.searchParams.set('status', status);
  // A return address is given as the order is placed, before it has a tracking ID.
  address.searchParams.set('tracking_id', trackingId);
  return address.toString();
}

/** PAY-01: where close leads while the session is open. */
export function closeAddressOf(data: PageData): string | null {
  return data.session.cancelUrl ?? returnAddressOf(data, 'cancelled');
}

/** The method the page is on, if any: the one asked for, or the session's until the shopper leaves it. */
export function chosenMethodOf(data: PageData, ask: PageAsk): ShopperPaymentMethod | null {
  const { session } = data;
  if (ask.pick) return null;
  const wanted = ask.wallet ?? (session.gatewayResult === null ? session.method : null);
  return session.methods.find((row) => row.method === wanted) ?? null;
}

function openScreenOf(data: PageData, ask: PageAsk): PageScreen {
  if (data.session.methods.length === 0) return 'no-methods';
  const chosen = chosenMethodOf(data, ask);
  if (chosen === null) return 'pick';
  if (chosen.way === PaymentWay.Automated && !ask.hand) return 'handing';
  return chosen.kind === PaymentMethodKind.Bank ? 'bank' : 'wallet';
}

/** PAYMENT-PAGE-DESIGN §2: the one screen a session shows, worked out from it and the address. */
export function screenOf(data: PageData, ask: PageAsk, now: Date): PageScreen {
  const { session } = data;
  const correcting = ask.change && session.idChangesLeft > 0;
  switch (session.state) {
    case PaymentSessionState.AwaitingPayment:
      return openScreenOf(data, ask);
    case PaymentSessionState.Checking: {
      if (correcting) return 'change';
      if (!session.listenerOnline) return 'manual';
      const typedAt = session.submitted?.submittedAt.getTime() ?? 0;
      return now.getTime() - typedAt < VERIFICATION_WINDOW_MS ? 'checking' : 'late';
    }
    case PaymentSessionState.NeedsReview:
      if (correcting) return 'change';
      if (session.review?.reason === PaymentPageReviewReason.Amount) return 'review';
      if (session.review?.reason === PaymentPageReviewReason.Sender) return 'review-sender';
      return 'review-other';
    case PaymentSessionState.Verified:
      if (!ask.just) return 'paid';
      return returnAddressOf(data, 'verified') === null ? 'verified-done' : 'verified';
    case PaymentSessionState.Failed:
      return 'rejected';
    case PaymentSessionState.Expired:
      return 'expired';
    case PaymentSessionState.Cancelled:
      return 'cancelled';
  }
}

/** The screens that wait on someone else, whose page keeps checking (PAY-17). */
export const WAITING_SCREENS: ReadonlySet<PageScreen> = new Set<PageScreen>([
  'checking',
  'late',
  'manual',
  'review',
  'review-sender',
  'review-other',
]);
