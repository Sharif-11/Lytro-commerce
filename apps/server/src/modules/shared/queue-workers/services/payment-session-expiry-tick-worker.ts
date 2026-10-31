import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { PaymentSessionExpiry } from '../../../payment-sessions/services/payment-session-expiry';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// PAY-03, D5-4: every minute, so an order nobody paid for is cancelled within a minute of its time running out.
const PAYMENT_SESSION_TICK_CRON = '* * * * *';

/**
 * Registers the payment session expiry pass (Phase 5 Slice 5.2), a cron like the stock hold's: the time running out is
 * not a business transaction to anchor a job to. The pass is safe to run twice, so a retried or doubled run changes
 * nothing.
 */
@Injectable()
export class PaymentSessionExpiryTickWorker implements OnModuleInit {
  private readonly logger = new Logger('PaymentSessionExpiryTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(PaymentSessionExpiry) private readonly expiry: PaymentSessionExpiry,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.PaymentSessionExpiryTick);
    await this.pgBoss.boss.schedule(
      QueueName.PaymentSessionExpiryTick,
      PAYMENT_SESSION_TICK_CRON,
      {},
    );
    await this.pgBoss.boss.work(QueueName.PaymentSessionExpiryTick, async () => {
      const result = await this.expiry.runTick(new Date());
      if (result.expired > 0) {
        this.logger.log(
          `payment session expiry: ${String(result.expired)} expired across ${String(result.shops)} shops`,
        );
      }
    });
  }
}
