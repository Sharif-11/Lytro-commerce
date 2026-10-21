import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { MediaBandwidth } from '../../../media/services/media-bandwidth';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// BND-02, MED-10: every minute, so a shop crossing its bandwidth is blocked within about two minutes.
const BANDWIDTH_TICK_CRON = '* * * * *';

/**
 * Registers the minute's bandwidth pass (BND-02, MED-10), a cron like the reservation expiry pass: the Worker's usage
 * is not a business transaction to anchor a job to. A doubled run adds nothing twice and writes nothing new.
 */
@Injectable()
export class MediaBandwidthTickWorker implements OnModuleInit {
  private readonly logger = new Logger('MediaBandwidthTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(MediaBandwidth) private readonly bandwidth: MediaBandwidth,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.MediaBandwidthTick);
    await this.pgBoss.boss.schedule(QueueName.MediaBandwidthTick, BANDWIDTH_TICK_CRON, {});
    await this.pgBoss.boss.work(QueueName.MediaBandwidthTick, async () => {
      const result = await this.bandwidth.runMinute();
      if (result.written > 0) {
        this.logger.log(
          `media bandwidth: ${String(result.counted)} shop-minutes added, ${String(result.blocked)} shops blocked, ` +
            `${String(result.written)} store values written`,
        );
      }
    });
  }
}
