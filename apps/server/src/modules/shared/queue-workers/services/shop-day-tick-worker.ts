import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { ShopDays } from '../../../reports/services/shop-days';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// D8-9: once a night, at 02:30 in Asia/Dhaka, after the day it records has ended (with no zone pg-boss reads a schedule
// as UTC). Clear of the 03:30 to 03:47 clean-up jobs.
const SHOP_DAY_CRON = '30 2 * * *';
const SHOP_DAY_TZ = 'Asia/Dhaka';

/** ADM-09, D8-9 (Phase 8 Slice 8.4): records each shop's day for the operator's reports. Safe to run twice. */
@Injectable()
export class ShopDayTickWorker implements OnModuleInit {
  private readonly logger = new Logger('ShopDayTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(ShopDays) private readonly days: ShopDays,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.ShopDayTick);
    await this.pgBoss.boss.schedule(QueueName.ShopDayTick, SHOP_DAY_CRON, {}, { tz: SHOP_DAY_TZ });
    await this.pgBoss.workOnce(QueueName.ShopDayTick, async () => {
      const result = await this.days.run();
      this.logger.log(
        `shops' days: ${String(result.days)} recorded for ${String(result.shops)} shops`,
      );
    });
  }
}
