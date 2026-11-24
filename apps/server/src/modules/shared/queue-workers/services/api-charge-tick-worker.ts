import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { ApiCharges } from '../../../public-api/services/api-charges';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// PF-14: just after midnight in Dhaka, the day before is charged.
const API_CHARGE_CRON = '15 0 * * *';
const API_CHARGE_TZ = 'Asia/Dhaka';

/**
 * PYG-26 (PAYG-FAIR-USE-PLAN PF-14, PF-36, PFQ-9): each night, every pay-as-you-go shop's own website's API requests past
 * the free allowance charged in whole 1,000s, within its cap and its balance, and its warnings sent; and the shops that
 * paid since marked activated. With fair use off it does nothing.
 */
@Injectable()
export class ApiChargeTickWorker implements OnModuleInit {
  private readonly logger = new Logger('ApiChargeTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(ApiCharges) private readonly charges: ApiCharges,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.ApiChargeTick);
    await this.pgBoss.boss.schedule(
      QueueName.ApiChargeTick,
      API_CHARGE_CRON,
      {},
      { tz: API_CHARGE_TZ },
    );
    await this.pgBoss.workOnce(QueueName.ApiChargeTick, async () => {
      const { charged, activated } = await this.charges.chargeDay(new Date());
      if (charged > 0 || activated > 0) {
        this.logger.log(
          `${String(charged)} shops charged for API requests, ${String(activated)} activated`,
        );
      }
    });
  }
}
