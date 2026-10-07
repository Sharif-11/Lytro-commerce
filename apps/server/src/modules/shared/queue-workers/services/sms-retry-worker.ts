import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import {
  MessagingService,
  OTP_RETRY_DELAY_SECONDS,
  OTP_RETRY_LIMIT,
} from '../../messaging/services/messaging.service';
import type { SmsRetryPayload } from '../../messaging/types/messages';
import { PgBossClient } from '../../queue/services/pg-boss-client';

/**
 * Registers the OTP retry queue and its handler (D27). `expireInSeconds` here is only a safety-net default for
 * the queue itself — `MessagingService.queueOtpRetry` always passes the real, per-job value, bounded to that
 * code's own remaining TTL, which overrides this.
 */
@Injectable()
export class SmsRetryWorker implements OnModuleInit {
  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(MessagingService) private readonly messaging: MessagingService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.OtpRetry, {
      retryLimit: OTP_RETRY_LIMIT,
      retryDelay: OTP_RETRY_DELAY_SECONDS,
      expireInSeconds: 300,
      notify: true,
    });
    await this.pgBoss.boss.work<SmsRetryPayload>(QueueName.OtpRetry, async (jobs) => {
      for (const job of jobs) {
        await this.messaging.retrySend(job.data);
      }
    });
  }
}
