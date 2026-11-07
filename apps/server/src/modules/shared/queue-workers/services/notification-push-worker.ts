import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import type { NotificationPushJob } from '../../../notifications/services/notifications';
import { PushSender } from '../../../notifications/services/push-sender';
import { PgBossClient } from '../../queue/services/pg-boss-client';

/**
 * NTF-02 (Phase 7 Slice 7.3): sends each notification's push, queued in the transaction that wrote it. A failed push is
 * counted against its browser and never tried again (the bell already has it), so the job doesn't retry.
 */
@Injectable()
export class NotificationPushWorker implements OnModuleInit {
  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(PushSender) private readonly sender: PushSender,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.NotificationPush, { retryLimit: 0, notify: true });
    await this.pgBoss.boss.work<NotificationPushJob>(QueueName.NotificationPush, async (jobs) => {
      for (const job of jobs) {
        await this.sender.send(job.data);
      }
    });
  }
}
