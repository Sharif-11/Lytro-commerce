import type { BillingInfoRow } from '@lytronix/db';
import { ADDON_PERIOD_DAYS, TenantState } from '@lytronix/validators';
import { DAY_MS } from '../../../common/time';

/**
 * PLN-14, PLN-15: whether the shop can take an add-on or a pack now -- a paid period running, or no period at all on
 * pay-as-you-go or a no-expiry plan (PLN-18), where an add-on runs its own 30 days. A trial or a lapsed shop cannot.
 */
export function canTake(info: BillingInfoRow | null, now: Date): info is BillingInfoRow {
  if (info?.state === TenantState.PayAsYouGo) return true;
  return (
    info?.state === TenantState.Active &&
    (info.periodEnd === null || (info.periodStart !== null && info.periodEnd > now))
  );
}

/** PLN-14: where a fresh add-on ends -- with the shop's paid period, or its own 30 days when it has none. */
export function periodEndFor(info: BillingInfoRow, now: Date): Date {
  return info.periodEnd ?? new Date(now.getTime() + ADDON_PERIOD_DAYS * DAY_MS);
}
