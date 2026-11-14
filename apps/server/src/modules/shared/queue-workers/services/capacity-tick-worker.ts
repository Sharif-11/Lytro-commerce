import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { CapacityCheck } from '../../../monitoring/services/capacity-check';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// Each morning at 09:10 in Dhaka, when the owner reads email.
const CAPACITY_CRON = '10 9 * * *';
const CAPACITY_TZ = 'Asia/Dhaka';

/** DAT-55 (Phase 9 Slice 9.6): whether paying shops or revenue say it's time for the second server. */
@Injectable()
export class CapacityTickWorker implements OnModuleInit {
  private readonly logger = new Logger('CapacityTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(CapacityCheck) private readonly capacity: CapacityCheck,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.CapacityTick);
    await this.pgBoss.boss.schedule(QueueName.CapacityTick, CAPACITY_CRON, {}, { tz: CAPACITY_TZ });
    await this.pgBoss.workOnce(QueueName.CapacityTick, async () => {
      const { figures, told } = await this.capacity.run();
      this.logger.log(
        `${String(figures.payingShops)} paying shops, ${figures.monthlyRevenue.toFixed(2)} TK a month${told.length > 0 ? `; told: ${told.join(', ')}` : ''}`,
      );
    });
  }
}
