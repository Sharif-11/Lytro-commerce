import { Inject, Injectable, Logger } from '@nestjs/common';
import { PaymentSessions } from './payment-sessions';

/** What one pass did, for its log line and the tests. */
export interface PaymentSessionExpiryResult {
  shops: number;
  expired: number;
  told: number;
}

/**
 * PAY-03, D5-4 (Slice 5.2): the minute pass, for every shop not deleted -- a session nobody paid in time expires, and a
 * checkout's order is cancelled with it -- and (Slice 5.4b) staff are told of each payment still waiting [5] minutes on
 * (VER-07). One shop's failure never stops the others.
 */
@Injectable()
export class PaymentSessionExpiry {
  private readonly logger = new Logger('PaymentSessionExpiry');

  constructor(@Inject(PaymentSessions) private readonly sessions: PaymentSessions) {}

  async runTick(now = new Date()): Promise<PaymentSessionExpiryResult> {
    const shops = await this.sessions.listShopIds();
    let expired = 0;
    let told = 0;
    for (const shopId of shops) {
      try {
        expired += await this.sessions.expireDue(shopId, now);
        told += await this.sessions.tellStaffDue(shopId, now);
      } catch (error) {
        this.logger.error(`payment session expiry failed for tenant ${shopId}`, error as Error);
      }
    }
    return { shops: shops.length, expired, told };
  }
}
