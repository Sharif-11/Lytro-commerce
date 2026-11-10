import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { MediaCosts } from '../../../media-costs/services/media-costs';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// D8-57: each hour, at 17 past, clear of the jobs on the hour. Cloudflare's R2 figures arrive within the hour or so.
const MEDIA_COST_CRON = '17 * * * *';

/** MED-12, D8-57 (Phase 8 Slice 8.6): reads R2's recent days from Cloudflare, then sends the budget's alert if due. */
@Injectable()
export class MediaCostTickWorker implements OnModuleInit {
  private readonly logger = new Logger('MediaCostTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(MediaCosts) private readonly costs: MediaCosts,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.MediaCostTick);
    await this.pgBoss.boss.schedule(QueueName.MediaCostTick, MEDIA_COST_CRON);
    await this.pgBoss.boss.work(QueueName.MediaCostTick, async () => {
      const result = await this.costs.pull();
      if (result.days > 0) {
        this.logger.log(
          `media costs: ${String(result.days)} days read, ${String(result.rows)} bucket rows${result.alerted ? ', alert sent' : ''}`,
        );
      }
    });
  }
}
