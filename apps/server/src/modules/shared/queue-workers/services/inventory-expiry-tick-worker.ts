import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { BatchExpiryService } from '../../../inventory/services/batch-expiry.service';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// INV-13: just after midnight in Asia/Dhaka, the moment yesterday's last sellable day ends.
const EXPIRY_TICK_CRON = '5 0 * * *';
const EXPIRY_TICK_TZ = 'Asia/Dhaka';

/**
 * Registers the daily expiry pass (INV-13), a cron like the lifecycle tick (D2-6): there is no single business
 * transaction to anchor it to. The pass itself is safe to run twice, so a retried or doubled run changes nothing.
 */
@Injectable()
export class InventoryExpiryTickWorker implements OnModuleInit {
  private readonly logger = new Logger('InventoryExpiryTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(BatchExpiryService) private readonly expiry: BatchExpiryService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.InventoryExpiryTick);
    await this.pgBoss.boss.schedule(
      QueueName.InventoryExpiryTick,
      EXPIRY_TICK_CRON,
      {},
      { tz: EXPIRY_TICK_TZ },
    );
    await this.pgBoss.boss.work(QueueName.InventoryExpiryTick, async () => {
      const result = await this.expiry.runDaily(new Date());
      this.logger.log(
        `expiry pass: ${String(result.shops)} shops, ${String(result.refreshed)} variants refreshed, ${String(result.notices)} notices`,
      );
    });
  }
}
