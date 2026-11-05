import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { CourierChecks } from '../../../couriers/services/courier-checks';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// CRR-15, D6-4: at about 23:00 in Bangladesh, once a night.
const COURIER_NIGHT_CRON = '0 23 * * *';
const COURIER_NIGHT_TZ = 'Asia/Dhaka';

/** Registers the night check (Phase 6 Slice 6.2), on one server at a time, as pg-boss runs a schedule. */
@Injectable()
export class CourierNightTickWorker implements OnModuleInit {
  private readonly logger = new Logger('CourierNightTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(CourierChecks) private readonly checks: CourierChecks,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.CourierNightTick);
    await this.pgBoss.boss.schedule(
      QueueName.CourierNightTick,
      COURIER_NIGHT_CRON,
      {},
      { tz: COURIER_NIGHT_TZ },
    );
    await this.pgBoss.boss.work(QueueName.CourierNightTick, async () => {
      const result = await this.checks.runNight();
      this.logger.log(
        `the night check: ${String(result.checked)} parcels asked after in ${String(result.shops)} shops, ${String(result.moved)} with news`,
      );
    });
  }
}
