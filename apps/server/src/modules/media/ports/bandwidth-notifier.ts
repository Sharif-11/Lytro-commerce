import type { UsageWarning } from '../../../common/usage-warnings';

/** BND-05: a shop's media has used this share of its cycle's bandwidth. */
export interface BandwidthNotice {
  tenantId: string;
  cycleStart: Date;
  percent: UsageWarning;
  bytes: number;
  limitBytes: number;
}

/**
 * BND-05, LIM-01, D3-5: tells the shop it has used 50, 80 or 95 percent of its bandwidth, once each per cycle. Phase 7's
 * notification module delivers it in the app and by push; until then a console stand-in.
 */
export interface BandwidthNotifier {
  bandwidthWarning(notice: BandwidthNotice): Promise<void>;
}
