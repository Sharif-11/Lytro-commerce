import { Injectable, Logger } from '@nestjs/common';
import type {
  ConnectionTroubleNotice,
  CourierBackNotice,
  CourierNotifier,
  CourierRetiringNotice,
  ParcelAttentionNotice,
  ParcelMovedNotice,
} from '../ports/courier-notifier';

/** D4-10: the stand-in until Phase 7's notification module delivers these. It only logs, never a customer's details. */
@Injectable()
export class ConsoleCourierNotifier implements CourierNotifier {
  private readonly logger = new Logger('CourierNotices');

  parcelNeedsAttention(notice: ParcelAttentionNotice): Promise<void> {
    this.logger.log(
      `tenant ${notice.tenantId}: order ${notice.orderNumber} on ${notice.courierKey} needs a look: ${notice.why}`,
    );
    return Promise.resolve();
  }

  parcelMoved(notice: ParcelMovedNotice): Promise<void> {
    this.logger.log(
      `tenant ${notice.tenantId}: order ${notice.orderNumber} on ${notice.courierKey}: ${notice.reading}`,
    );
    return Promise.resolve();
  }

  connectionTrouble(notice: ConnectionTroubleNotice): Promise<void> {
    this.logger.log(
      `tenant ${notice.tenantId}: ${notice.courierKey} connection: ${notice.trouble}`,
    );
    return Promise.resolve();
  }

  courierRetiring(notice: CourierRetiringNotice): Promise<void> {
    this.logger.log(
      `tenant ${notice.tenantId}: ${notice.courierKey} is being retired; suggested ${notice.suggestedKey}; default moved to ${notice.defaultMovedTo ?? 'nothing'}`,
    );
    return Promise.resolve();
  }

  courierBack(notice: CourierBackNotice): Promise<void> {
    this.logger.log(`tenant ${notice.tenantId}: ${notice.courierKey} is back`);
    return Promise.resolve();
  }
}
