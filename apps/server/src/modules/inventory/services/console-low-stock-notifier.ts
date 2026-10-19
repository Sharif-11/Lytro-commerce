import { Injectable, Logger } from '@nestjs/common';
import type { LowStockNotifier } from '../ports/stock-store';
import type { LowStockNotice } from '../types/inventory';

/**
 * INV-08, D3-5: the stand-in until Phase 7's notification module delivers in-app and push notices. It only logs; the
 * once-per-crossing decision is the ledger's, and that is what the tests prove.
 */
@Injectable()
export class ConsoleLowStockNotifier implements LowStockNotifier {
  private readonly logger = new Logger('LowStock');

  lowStock(notice: LowStockNotice): Promise<void> {
    this.logger.log(
      `tenant ${notice.tenantId}: "${notice.productName}" variant ${notice.variantId} is at ${notice.available} (threshold ${notice.threshold})`,
    );
    return Promise.resolve();
  }
}
