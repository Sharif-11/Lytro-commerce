import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { CourierChecks } from '../../../couriers/services/courier-checks';
import { CourierPayouts } from '../../../couriers/services/courier-payouts';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// CRR-15, D6-4: at about 23:00 in Bangladesh, once a night.
const COURIER_NIGHT_CRON = '0 23 * * *';
const COURIER_NIGHT_TZ = 'Asia/Dhaka';

/**
 * Registers the night check (Phase 6 Slice 6.2), on one server at a time, as pg-boss runs a schedule. After it, the payouts couriers
 * list are read (CRR-17, Slice 6.5); either failing leaves the other to run.
 */
@Injectable()
export class CourierNightTickWorker implements OnModuleInit {
  private readonly logger = new Logger('CourierNightTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(CourierChecks) private readonly checks: CourierChecks,
    @Inject(CourierPayouts) private readonly payouts: CourierPayouts,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.CourierNightTick);
    await this.pgBoss.boss.schedule(
      QueueName.CourierNightTick,
      COURIER_NIGHT_CRON,
      {},
      { tz: COURIER_NIGHT_TZ },
    );
    await this.pgBoss.workOnce(QueueName.CourierNightTick, async () => {
      try {
        const result = await this.checks.runNight();
        this.logger.log(
          `the night check: ${String(result.checked)} parcels asked after in ${String(result.shops)} shops, ${String(result.moved)} with news`,
        );
      } finally {
        const paid = await this.payouts.runNight();
        this.logger.log(
          `payouts: ${String(paid.asked)} calls in ${String(paid.shops)} shops, ${String(paid.payouts)} new payouts settling ${String(paid.parcels)} parcels`,
        );
      }
    });
  }
}
