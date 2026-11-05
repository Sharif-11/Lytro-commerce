import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { CourierBookingPass } from '../../../couriers/services/courier-booking-pass';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// D6-11: every minute, so a booking whose answer was lost is asked after and an accepted one is finished.
const COURIER_BOOKING_CRON = '* * * * *';

/** Registers the courier bookings' minute pass (Phase 6 Slice 6.1). Safe to run twice: a parcel settles once. */
@Injectable()
export class CourierBookingTickWorker implements OnModuleInit {
  private readonly logger = new Logger('CourierBookingTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(CourierBookingPass) private readonly pass: CourierBookingPass,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.CourierBookingTick);
    await this.pgBoss.boss.schedule(QueueName.CourierBookingTick, COURIER_BOOKING_CRON, {});
    await this.pgBoss.boss.work(QueueName.CourierBookingTick, async () => {
      const result = await this.pass.runTick();
      if (result.settled > 0) {
        this.logger.log(`courier bookings: ${String(result.settled)} parcels settled`);
      }
    });
  }
}
