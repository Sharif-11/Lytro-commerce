import { Inject, Injectable, Logger } from '@nestjs/common';
import { PaymentSessions } from '../../payment-sessions/services/payment-sessions';
import { GatewayCheckouts } from './gateway-checkout';

/**
 * VER-09 (Phase 5 Slice 5.7): the minute pass, for every shop not deleted: each checkout at a wallet past its window with no return is
 * asked after, before the sessions' own pass closes it. One shop's failure never stops the others.
 */
@Injectable()
export class GatewayReconcile {
  private readonly logger = new Logger('GatewayReconcile');

  constructor(
    @Inject(PaymentSessions) private readonly sessions: PaymentSessions,
    @Inject(GatewayCheckouts) private readonly checkouts: GatewayCheckouts,
  ) {}

  async runTick(now = new Date()): Promise<{ shops: number; settled: number }> {
    const shops = await this.sessions.listShopIds();
    let settled = 0;
    for (const shopId of shops) {
      try {
        settled += await this.checkouts.reconcile(shopId, now);
      } catch (error) {
        this.logger.error(`gateway reconcile failed for tenant ${shopId}`, error as Error);
      }
    }
    return { shops: shops.length, settled };
  }
}
