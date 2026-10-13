import { Injectable } from '@nestjs/common';
import type { LowBalanceNotifier } from '../ports/low-balance-notifier';
import { fromPaisa } from './money';

// D6's stub-provider precedent: prints the notice so a developer can read the code; silent in tests. Swapped
// for a real in-app/push/email adapter once the notification module exists.
@Injectable()
export class ConsoleLowBalanceNotifier implements LowBalanceNotifier {
  notifyCrossed(tenantId: string, thresholdPaisa: bigint, balanceAfter: string): Promise<void> {
    if (process.env['NODE_ENV'] !== 'test') {
      console.info(
        `[low-balance-stub] tenant ${tenantId} crossed ${fromPaisa(thresholdPaisa)} TK, now ${balanceAfter}`,
      );
    }
    return Promise.resolve();
  }
}
