import { Injectable, Logger } from '@nestjs/common';
import type { RequestQuotaNotifier } from '../ports/api-key-store';
import type { RequestQuotaNotice } from '../types/api-access';

/**
 * RTE-03, D3-5: the stand-in until Phase 7's notification module delivers in-app and push notices. It only logs; the
 * once-per-share decision is the quota's, and that is what the tests prove.
 */
@Injectable()
export class ConsoleRequestQuotaNotifier implements RequestQuotaNotifier {
  private readonly logger = new Logger('RequestQuota');

  quotaWarning(notice: RequestQuotaNotice): Promise<void> {
    this.logger.log(
      `tenant ${notice.tenantId}: ${String(notice.percent)}% of the cycle's API requests used (${String(notice.requests)} of ${String(notice.limit)})`,
    );
    return Promise.resolve();
  }
}
