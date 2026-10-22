/** RTE-03, BND-05, LIM-01: the shares of a cycle's limit at which a shop is warned, once each. */
export const USAGE_WARNINGS = [50, 80, 95] as const;

/**
 * LIM-01, BND-05, RTE-03, RTE-12: what a usage notice is about. A share of the limit (50, 80, 95, 100); `stopped` once a
 * metric that keeps serving shoppers has used its grace too (BND-03, RTE-03); `fast_spend` for a fast hour of API
 * requests (RTE-12).
 */
export type UsageLevel = 50 | 80 | 95 | 100 | 'stopped' | 'fast_spend';

/** The level a share sent stands for: anything past the limit is the stop at the grace's end. */
export function levelOf(share: number): UsageLevel {
  if (share > 100) return 'stopped';
  if (share === 50 || share === 80 || share === 95 || share === 100) return share;
  throw new Error(`no usage level at ${String(share)} percent`);
}

// BND-03, RTE-03: how far past its bandwidth or API requests a shop is still served, when the operator has set none.
export const DEFAULT_USAGE_GRACE_PERCENT = 10;

// RTE-12: the share of a cycle's API requests that, spent in one hour, alerts the owner and the operator.
export const DEFAULT_FAST_SPEND_PERCENT = 5;

/**
 * BND-04, RTE-11, PLN-15: what a cycle's packs add to the shop's own limit -- what its packs hold for this cycle (what is
 * left of them, and what this cycle took already) and the grace use written off at a pack bought past the allowance.
 */
export interface CyclePacks {
  available: number;
  free: number;
}

export const NO_PACKS: CyclePacks = { available: 0, free: 0 };

/**
 * BND-04, PLN-15: a cycle's packs, from what the shop bought, what all its cycles took (this one's `packUsed` among
 * them) and this cycle's write-off. Packs carry over: what other cycles did not take is this one's.
 */
export function cyclePacks(
  bought: number,
  takenByAllCycles: number,
  cycle: { packUsed: number; packFree: number },
): CyclePacks {
  return {
    available: Math.max(bought - (takenByAllCycles - cycle.packUsed), 0),
    free: cycle.packFree,
  };
}

/** BND-04, RTE-11: what the shop may use in the cycle -- its own limit, then its packs; null is unlimited (PLN-19). */
export function allowanceOf(limit: number | null, packs: CyclePacks = NO_PACKS): number | null {
  return limit === null ? null : limit + packs.free + packs.available;
}

/**
 * BND-04, PLN-15: what the cycle takes from the shop's packs -- its use past its own limit, less what a pack bought past
 * the allowance wrote off, as far as the packs reach.
 */
export function packTaken(used: number, limit: number | null, packs: CyclePacks): number {
  if (limit === null) return 0;
  return Math.min(Math.max(used - limit - packs.free, 0), packs.available);
}

/**
 * BND-03, RTE-03: whether `used` is past the allowance and the grace after it, where a metric serving shoppers stops.
 * The grace is a share of the shop's own limit; packs never widen it.
 */
export function pastGrace(
  used: number,
  limit: number | null,
  gracePercent: number,
  packs: CyclePacks = NO_PACKS,
): boolean {
  const allowance = allowanceOf(limit, packs);
  return (
    limit !== null && allowance !== null && used * 100 >= allowance * 100 + limit * gracePercent
  );
}

/**
 * BND-03, BND-05, RTE-03: the shares of the cycle's allowance at which a metric that keeps serving shoppers past it is
 * told of: the three warnings, the allowance, and the stop once the grace -- a share of the shop's own limit -- is used
 * too. Without packs the allowance is the limit, and the stop is at 100 plus the grace.
 */
export function servingShares(
  gracePercent: number,
  limit: number | null = null,
  allowance: number | null = null,
): readonly number[] {
  const stop =
    limit !== null && allowance !== null && allowance > 0
      ? 100 + (gracePercent * limit) / allowance
      : 100 + gracePercent;
  return [...USAGE_WARNINGS, 100, stop];
}

/**
 * BND-04, RTE-11: after a pack, the highest of the warnings and the allowance that `used` has already passed against the
 * new allowance -- what the cycle records as sent, so the ones still ahead are sent again.
 */
export function passedShare(used: number, allowance: number): number {
  return [...USAGE_WARNINGS, 100].filter((share) => used * 100 >= allowance * share).pop() ?? 0;
}

/** The share a cycle records as sent: a stop share may fall between whole percents, and is kept rounded up. */
export function recordedShare(share: number): number {
  return Math.ceil(share);
}

/**
 * RTE-03, BND-05, LIM-01: the highest share `used` has now reached against `limit` that was not sent yet (the highest
 * sent is `warned`), or null. An unlimited (null) or zero limit warns of nothing. One rule for every metric, so each
 * warns alike.
 */
export function warningDue(
  used: number,
  limit: number | null,
  warned: number,
  shares: readonly number[] = USAGE_WARNINGS,
): number | null {
  if (limit === null || limit === 0) return null;
  const reached = shares.filter((percent) => used * 100 >= limit * percent).pop();
  return reached === undefined || reached <= warned ? null : reached;
}
