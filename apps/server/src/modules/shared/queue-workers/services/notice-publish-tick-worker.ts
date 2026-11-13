import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { NoticePublisher } from '../../../notices/services/notice-publisher';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// NTC-11: every minute, so a notice set for 10:00 is out by 10:01.
const NOTICE_PUBLISH_CRON = '* * * * *';

/** NTC-06, NTC-11 (Phase 7 Slice 7.4): sends the notices whose time has come. Safe to run twice at once. */
@Injectable()
export class NoticePublishTickWorker implements OnModuleInit {
  private readonly logger = new Logger('NoticePublishTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(NoticePublisher) private readonly publisher: NoticePublisher,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.NoticePublishTick);
    await this.pgBoss.boss.schedule(QueueName.NoticePublishTick, NOTICE_PUBLISH_CRON, {});
    await this.pgBoss.workOnce(QueueName.NoticePublishTick, async () => {
      const result = await this.publisher.runTick(new Date());
      if (result.notices > 0) {
        this.logger.log(`notices: ${String(result.notices)} sent to ${String(result.shops)} shops`);
      }
    });
  }
}
