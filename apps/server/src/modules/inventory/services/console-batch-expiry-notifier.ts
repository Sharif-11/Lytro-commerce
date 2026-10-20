import { Injectable, Logger } from '@nestjs/common';
import type { BatchExpiryNotifier } from '../ports/stock-batch-store';
import type { BatchExpiryNotice } from '../types/inventory';

/**
 * INV-13, D3-5: the stand-in until Phase 7's notification module delivers in-app and push notices. It only logs; the
 * once-per-batch decision is the expiry pass's, and that is what the tests prove.
 */
@Injectable()
export class ConsoleBatchExpiryNotifier implements BatchExpiryNotifier {
  private readonly logger = new Logger('BatchExpiry');

  expiringSoon(notice: BatchExpiryNotice): Promise<void> {
    this.logger.log(
      `tenant ${notice.tenantId}: "${notice.productName}" batch ${notice.batchCode ?? notice.batchId} (${notice.quantity}) expires ${notice.expiresOn}`,
    );
    return Promise.resolve();
  }
}
