import { Injectable, Logger } from '@nestjs/common';
import type { OrderNotifier, PlacedOrderNotice } from '../ports/order-notifier';

/**
 * ORD-20, D4-10: the stand-in until Phase 7's notification module delivers in-app and push notices. It only logs; that
 * a shopper's order is told of once, and a staff order never, is the order flow's, and that is what the tests prove.
 */
@Injectable()
export class ConsoleOrderNotifier implements OrderNotifier {
  private readonly logger = new Logger('NewOrder');

  orderPlaced(notice: PlacedOrderNotice): Promise<void> {
    this.logger.log(
      `tenant ${notice.tenantId}: order ${notice.orderNumber} placed through ${notice.source}, ${notice.grandTotal} TK`,
    );
    return Promise.resolve();
  }
}
