import { Injectable, Logger } from '@nestjs/common';
import type {
  GatewayAttentionNotice,
  MoneyForClosedOrderNotice,
  PaymentNotifier,
  PaymentToVerifyNotice,
  PaymentVerifiedNotice,
} from '../ports/payment-notifier';

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

  paymentVerified(notice: PaymentVerifiedNotice): Promise<void> {
    this.logger.log(
      `tenant ${notice.tenantId}: ${notice.amount} TK for order ${notice.orderNumber} verified by the listener`,
    );
    return Promise.resolve();
  }

  gatewayNeedsAttention(notice: GatewayAttentionNotice): Promise<void> {
    this.logger.warn(`tenant ${notice.tenantId}: the ${notice.method} gateway needs attention`);
    return Promise.resolve();
  }

  moneyForClosedOrder(notice: MoneyForClosedOrderNotice): Promise<void> {
    this.logger.warn(
      `tenant ${notice.tenantId}: ${notice.amount} TK arrived for closed order ${notice.orderNumber}`,
    );
    return Promise.resolve();
  }
}
