import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import {
  PLATFORM_AD_RETRIES,
  PLATFORM_AD_RETRY_DELAY_SECONDS,
  PlatformAdSender,
} from '../../../platform-ads/services/platform-ad-sender';
import type { PlatformAdJob } from '../../../platform-ads/types/platform-ad';
import { PgBossClient } from '../../queue/services/pg-boss-client';

/**
 * MKT-02: tells Lytro's own Meta pixel of a sign-up, a shop, a shop's first order or its first paid plan. Enqueued in
 * the transaction where it happened (SCL-08); Meta being away fails the try, and the job tries again later.
 */
@Injectable()
export class PlatformAdWorker implements OnModuleInit {
  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(PlatformAdSender) private readonly sender: PlatformAdSender,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.PlatformAdEvent, {
      retryLimit: PLATFORM_AD_RETRIES,
      retryDelay: PLATFORM_AD_RETRY_DELAY_SECONDS,
      retryBackoff: true,
      notify: true,
    });
    // DAT-38: held back while degraded mode is on, as its retries can wait.
    await this.pgBoss.workPausable<PlatformAdJob>(QueueName.PlatformAdEvent, async (jobs) => {
      for (const job of jobs) {
        await this.sender.send(job.data);
      }
    });
  }
}
