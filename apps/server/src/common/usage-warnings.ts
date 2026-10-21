/** RTE-03, BND-05, LIM-01: the shares of a cycle's limit at which a shop is warned, once each. */
export const USAGE_WARNINGS = [50, 80, 95] as const;
export type UsageWarning = (typeof USAGE_WARNINGS)[number];

/**
 * RTE-03, BND-05, LIM-01: the highest warning `used` has now reached against `limit` that was not sent yet (the
 * highest sent is `warned`), or null. An unlimited (null) or zero limit warns of nothing. One rule for every metric,
 * so each warns alike.
 */
export function warningDue(
  used: number,
  limit: number | null,
  warned: number,
): UsageWarning | null {
  if (limit === null || limit === 0) return null;
  const reached = USAGE_WARNINGS.filter((percent) => used * 100 >= limit * percent).pop();
  return reached === undefined || reached <= warned ? null : reached;
}
