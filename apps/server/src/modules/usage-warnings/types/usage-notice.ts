import type { UsageMetric } from '@lytronix/validators';
import type { UsageLevel } from '../../../common/usage-warnings';

export type { UsageLevel };

/** LIM-01: one notice, queued in the transaction that crossed it and written and sent by the usage-notice worker. */
export interface UsageNotice {
  tenantId: string;
  metric: UsageMetric;
  level: UsageLevel;
  used: number;
  limit: number;
  /** The cycle it belongs to, as ISO 8601, since it travels through the job queue. */
  cycleStart: string;
}
