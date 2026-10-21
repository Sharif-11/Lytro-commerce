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

/** BND-03, RTE-03: whether `used` is past the limit and its grace, where a metric serving shoppers stops. */
export function pastGrace(used: number, limit: number | null, gracePercent: number): boolean {
  return limit !== null && used * 100 >= limit * (100 + gracePercent);
}

/**
 * BND-03, BND-05, RTE-03: the shares at which a metric that keeps serving shoppers past its limit is told of: the three
 * warnings, its limit, and its stop once the grace is used too.
 */
export function servingShares(gracePercent: number): readonly number[] {
  return [...USAGE_WARNINGS, 100, 100 + gracePercent];
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
