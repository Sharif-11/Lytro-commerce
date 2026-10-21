import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { UsageNoticeSender } from '../../../usage/services/usage-notice-sender';
import type { UsageNotice } from '../../../usage-warnings/types/usage-notice';
import { PgBossClient } from '../../queue/services/pg-boss-client';

/**
 * LIM-01, BND-05, RTE-03, RTE-12: writes and sends each usage notice, queued in the transaction that crossed its share
 * of a limit (SCL-08). A failed try is tried again later; the message itself is only queued once the try succeeds.
 */
@Injectable()
export class UsageNoticeWorker implements OnModuleInit {
  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(UsageNoticeSender) private readonly sender: UsageNoticeSender,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.UsageNotice, {
      retryLimit: 5,
      retryDelay: 60,
      retryBackoff: true,
      notify: true,
    });
    await this.pgBoss.boss.work<UsageNotice>(QueueName.UsageNotice, async (jobs) => {
      for (const job of jobs) {
        await this.sender.send(job.data);
      }
    });
  }
}
