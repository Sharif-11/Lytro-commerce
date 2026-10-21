import { Injectable, Logger } from '@nestjs/common';
import type { BandwidthNotice, BandwidthNotifier } from '../ports/bandwidth-notifier';

/**
 * BND-05, D3-5: the stand-in until Phase 7's notification module delivers in-app and push notices. It only logs; the
 * once-per-cycle decision is the bandwidth pass's, and that is what the tests prove.
 */
@Injectable()
export class ConsoleBandwidthNotifier implements BandwidthNotifier {
  private readonly logger = new Logger('Bandwidth');

  bandwidthWarning(notice: BandwidthNotice): Promise<void> {
    this.logger.log(
      `tenant ${notice.tenantId}: media bandwidth at ${String(notice.percent)}% ` +
        `(${String(notice.bytes)} of ${String(notice.limitBytes)} bytes)`,
    );
    return Promise.resolve();
  }
}
