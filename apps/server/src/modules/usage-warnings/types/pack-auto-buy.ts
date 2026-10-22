import type { UsageMetric } from '@lytronix/validators';

/**
 * BND-04, RTE-11, PLN-15: one pack to buy from the balance, queued by the minute's count that reached the cycle's
 * allowance, and bought by the pack worker.
 */
export interface PackAutoBuy {
  tenantId: string;
  metric: UsageMetric.Bandwidth | UsageMetric.Requests;
  /** The cycle it belongs to, as ISO 8601, since it travels through the job queue. */
  cycleStart: string;
}
