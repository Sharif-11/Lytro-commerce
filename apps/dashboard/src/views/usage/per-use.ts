import { AddonKind } from '@lytronix/validators';
import type { AddonOffer } from '@/types/addons';
import type { PayPerUse, ShopUsage } from '@/types/usage';

/** PLN-20: the address reads' pay-per-use figures; the server sends them as the one entry. */
export function readsOf(usage: ShopUsage | undefined): PayPerUse | null {
  return usage?.payPerUse[0] ?? null;
}

/** The reads allowance's share used, in whole percent. */
export function readsPercent(reads: PayPerUse): number | null {
  const pool = reads.allowance;
  if (!pool || pool.total === 0) return null;
  return Math.round((pool.used / pool.total) * 100);
}

/** The reads pack for sale, if any. */
export function readsOffer(offers: readonly AddonOffer[]): AddonOffer | null {
  return offers.find((each) => each.addon.kind === AddonKind.Allowance) ?? null;
}
