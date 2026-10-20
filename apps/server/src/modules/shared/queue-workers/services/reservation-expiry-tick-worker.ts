import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { ReservationExpiryService } from '../../../inventory/services/reservation-expiry.service';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// INV-16: every minute, so stock held for an unpaid order comes free within a minute of its time running out.
const RESERVATION_TICK_CRON = '* * * * *';

/**
 * Registers the reservation expiry pass (INV-16), a cron like the daily expiry pass: the time running out is not a
 * business transaction to anchor a job to. The pass is safe to run twice, so a retried or doubled run changes nothing.
 */
@Injectable()
export class ReservationExpiryTickWorker implements OnModuleInit {
  private readonly logger = new Logger('ReservationExpiryTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(ReservationExpiryService) private readonly expiry: ReservationExpiryService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.ReservationExpiryTick);
    await this.pgBoss.boss.schedule(QueueName.ReservationExpiryTick, RESERVATION_TICK_CRON, {});
    await this.pgBoss.boss.work(QueueName.ReservationExpiryTick, async () => {
      const result = await this.expiry.runTick(new Date());
      if (result.released > 0) {
        this.logger.log(
          `reservation expiry: ${String(result.released)} released across ${String(result.shops)} shops`,
        );
      }
    });
  }
}
