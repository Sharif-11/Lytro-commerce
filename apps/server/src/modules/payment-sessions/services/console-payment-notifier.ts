import { Injectable, Logger } from '@nestjs/common';
import type { PaymentNotifier, PaymentToVerifyNotice } from '../ports/payment-notifier';

/**
 * VER-01: the stand-in until Phase 7's notification module delivers in-app and push notices, as the order notifier's
 * is. It only logs; that staff are told once, after the transaction ID is kept, is the page's, and the tests prove it.
 */
@Injectable()
export class ConsolePaymentNotifier implements PaymentNotifier {
  private readonly logger = new Logger('PaymentToVerify');

  paymentToVerify(notice: PaymentToVerifyNotice): Promise<void> {
    this.logger.log(
      `tenant ${notice.tenantId}: ${notice.amount} TK by ${notice.method} for order ${notice.orderNumber} to verify`,
    );
    return Promise.resolve();
  }
}
