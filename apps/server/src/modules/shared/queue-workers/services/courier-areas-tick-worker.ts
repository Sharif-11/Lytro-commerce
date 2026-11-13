import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { CourierAreaList } from '../../../couriers/services/courier-area-list';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// CUS-10, read agreed 2026-11-06: once a week, early on Sunday in Bangladesh, when few bookings are made.
const COURIER_AREAS_CRON = '0 3 * * 0';
const COURIER_AREAS_TZ = 'Asia/Dhaka';

/** Registers the weekly read of couriers' area lists (Phase 6 Slice 6.4), on one server at a time. One courier failing stops no other. */
@Injectable()
export class CourierAreasTickWorker implements OnModuleInit {
  private readonly logger = new Logger('CourierAreasTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(CourierAreaList) private readonly areas: CourierAreaList,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.CourierAreasTick);
    await this.pgBoss.boss.schedule(
      QueueName.CourierAreasTick,
      COURIER_AREAS_CRON,
      {},
      { tz: COURIER_AREAS_TZ },
    );
    await this.pgBoss.workOnce(QueueName.CourierAreasTick, () => this.run());
  }

  async run(): Promise<void> {
    for (const courierKey of this.areas.refreshable()) {
      try {
        await this.areas.refresh(courierKey, null);
      } catch (error) {
        this.logger.error(`the weekly read of ${courierKey}'s areas failed`, error as Error);
      }
    }
  }
}
