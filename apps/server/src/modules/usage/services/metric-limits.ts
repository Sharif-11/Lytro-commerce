import { limitOf, UsageMetric, type PlanLimits, type UsageLimitKey } from '@lytronix/validators';
import { GB } from '../../media/services/media-bandwidth';
import { MB } from '../../media/services/media-limits';

/** LIM-02: the limit each metric is judged against, and how many of the metric's units one of the limit's is. */
const METRIC_LIMITS: Readonly<Record<UsageMetric, { key: UsageLimitKey; unit: number }>> = {
  [UsageMetric.Products]: { key: 'products', unit: 1 },
  [UsageMetric.Seats]: { key: 'staff', unit: 1 },
  [UsageMetric.Storage]: { key: 'storage_mb', unit: MB },
  [UsageMetric.Bandwidth]: { key: 'bandwidth_gb', unit: GB },
  [UsageMetric.Requests]: { key: 'requests_monthly', unit: 1 },
  [UsageMetric.EssentialSmsMonthly]: { key: 'essential_sms_monthly', unit: 1 },
  [UsageMetric.EssentialSmsTotal]: { key: 'essential_sms_total', unit: 1 },
};

/** LIM-02: the limit a metric is judged against, and how many of the metric's units one of the limit's is. */
export function metricLimitKey(metric: UsageMetric): { key: UsageLimitKey; unit: number } {
  return METRIC_LIMITS[metric];
}

/** PLN-19: a metric's limit under these limits, in the metric's own unit (bytes for storage and bandwidth); null is
 * unlimited. */
export function metricLimit(limits: PlanLimits | null, metric: UsageMetric): number | null {
  const { key, unit } = metricLimitKey(metric);
  const limit = limitOf(limits, key);
  return limit === null ? null : limit * unit;
}

/** BND-03, RTE-03: the metrics that keep serving shoppers past their limit, through the grace, then stop. */
export const SERVING_METRICS: ReadonlySet<UsageMetric> = new Set([
  UsageMetric.Bandwidth,
  UsageMetric.Requests,
]);
