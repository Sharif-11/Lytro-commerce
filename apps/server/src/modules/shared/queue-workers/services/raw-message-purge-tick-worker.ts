import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { RawMessagePurge } from '../../../reconciliation/services/raw-message-purge';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// DAT-51 (Phase 9 Slice 9.5): once a night, at 03:55 in Asia/Dhaka, clear of the 03:23 to 03:47 clean-up jobs.
const RAW_PURGE_CRON = '55 3 * * *';
const RAW_PURGE_TZ = 'Asia/Dhaka';

/** DAT-51: couriers' messages and gateways' answers past their days, removed. Safe to run twice. */
@Injectable()
export class RawMessagePurgeTickWorker implements OnModuleInit {
  private readonly logger = new Logger('RawMessagePurgeTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(RawMessagePurge) private readonly purge: RawMessagePurge,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.RawMessagePurgeTick);
    await this.pgBoss.boss.schedule(
      QueueName.RawMessagePurgeTick,
      RAW_PURGE_CRON,
      {},
      {
        tz: RAW_PURGE_TZ,
      },
    );
    await this.pgBoss.workOnce(QueueName.RawMessagePurgeTick, async () => {
      const result = await this.purge.run();
      this.logger.log(
        `raw messages removed: ${String(result.courierMessages)} from couriers, ` +
          `${String(result.gatewayAnswers)} gateway answers`,
      );
    });
  }
}
