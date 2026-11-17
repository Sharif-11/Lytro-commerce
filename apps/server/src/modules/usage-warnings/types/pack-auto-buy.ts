import type { UsageMetric } from '@lytronix/validators';

/**
 * RTE-11, PLN-15: one pack to buy from the balance, queued by the minute's count that reached the cycle's
 * allowance, and bought by the pack worker.
 */
export interface PackAutoBuy {
  tenantId: string;
  /** Requests; a job queued before D9-31 may still name bandwidth, which buys nothing. */
  metric: UsageMetric;
  /** The cycle it belongs to, as ISO 8601, since it travels through the job queue. */
  cycleStart: string;
}
