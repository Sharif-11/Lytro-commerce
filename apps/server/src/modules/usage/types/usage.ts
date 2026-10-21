import type { UsageMetric } from '@lytronix/validators';
import type { BandwidthDay } from '../../media/types/media';

/** LIM-02: one metric against the shop's limit; null is unlimited (PLN-19). */
export interface UsageFigure {
  metric: UsageMetric;
  used: number;
  limit: number | null;
  /** Bytes for storage and bandwidth, a count for everything else. */
  unit: 'count' | 'bytes';
  /** Whether it starts again each cycle (bandwidth, requests, monthly SMS) or is a running total. */
  perCycle: boolean;
}

/** LIM-02: what the usage page shows: every metric, the cycle the per-cycle ones belong to, and each day's bandwidth. */
export interface ShopUsage {
  cycleStart: Date;
  cycleEnd: Date;
  metrics: UsageFigure[];
  bandwidthDays: BandwidthDay[];
}
