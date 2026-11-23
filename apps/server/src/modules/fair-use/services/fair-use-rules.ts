import { OrderAccess, OrderSource, TenantState } from '@lytronix/validators';

/** PF-20: where an order that locks comes from -- Lytro's storefront, its landing pages, and the shop's public key. */
const LOCKING_SOURCES: ReadonlySet<OrderSource> = new Set([
  OrderSource.Storefront,
  OrderSource.LandingPage,
  OrderSource.Api,
]);

/**
 * PYG-22, PYG-24 (PF-1, PF-20, PF-33): how a new order starts. With fair use on, a pay-as-you-go shop's order from Lytro
 * arrives locked; every other order -- typed in the dashboard, or placed on a trial or a plan -- is open, and keeps the
 * rule it arrived under.
 */
export function accessForNewOrder(
  fairUseOn: boolean,
  state: TenantState,
  source: OrderSource,
): OrderAccess {
  return fairUseOn && state === TenantState.PayAsYouGo && LOCKING_SOURCES.has(source)
    ? OrderAccess.Locked
    : OrderAccess.Open;
}

/**
 * PYG-25 (PF-13, PFQ-2): whether a shop's storefront, landing pages and public key are paused -- with fair use on, a
 * pay-as-you-go shop that never paid a plan or the activation top-up.
 */
export function storefrontPaused(
  fairUseOn: boolean,
  shop: { state: TenantState; storefrontActivatedAt: Date | null },
): boolean {
  return fairUseOn && shop.state === TenantState.PayAsYouGo && shop.storefrontActivatedAt === null;
}

/** PYG-29 (PF-15, PF-40): whether a shop's storefront hides its direct contact -- every pay-as-you-go shop, with fair use on. */
export function contactHidden(fairUseOn: boolean, state: TenantState): boolean {
  return fairUseOn && state === TenantState.PayAsYouGo;
}

/** PYG-22: an order whose customer the shop hasn't reached through Lytro yet: its name, phone and address held back. */
export function isLocked(access: OrderAccess): boolean {
  return access === OrderAccess.Locked;
}

/** PYG-22 (PF-22): an order whose address is still held back -- locked, or with only its phone shown. */
export function addressHidden(access: OrderAccess): boolean {
  return access === OrderAccess.Locked || access === OrderAccess.Phone;
}
