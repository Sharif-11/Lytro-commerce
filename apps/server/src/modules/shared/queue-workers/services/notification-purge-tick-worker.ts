import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { NotificationPurge } from '../../../notifications/services/notification-purge';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// D7-39: once a day, in the quiet hours of Asia/Dhaka (with no zone pg-boss reads a schedule as UTC).
const NOTIFICATION_PURGE_CRON = '41 3 * * *';
const NOTIFICATION_PURGE_TZ = 'Asia/Dhaka';

/** NTF-01, D7-39 (Phase 7 Slice 7.3): deletes notifications past the days they are kept (30). Safe to run twice. */
@Injectable()
export class NotificationPurgeTickWorker implements OnModuleInit {
  private readonly logger = new Logger('NotificationPurgeTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(NotificationPurge) private readonly purge: NotificationPurge,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.NotificationPurgeTick);
    await this.pgBoss.boss.schedule(
      QueueName.NotificationPurgeTick,
      NOTIFICATION_PURGE_CRON,
      {},
      { tz: NOTIFICATION_PURGE_TZ },
    );
    await this.pgBoss.workOnce(QueueName.NotificationPurgeTick, async () => {
      const removed = await this.purge.run(new Date());
      if (removed > 0) this.logger.log(`notification clean-up: ${String(removed)} removed`);
    });
  }
}
