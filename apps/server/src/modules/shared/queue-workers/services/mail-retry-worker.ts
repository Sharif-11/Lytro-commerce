import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import {
  MailService,
  OTP_RETRY_DELAY_SECONDS,
  OTP_RETRY_LIMIT,
} from '../../mail/services/mail.service';
import type { MailRetryPayload } from '../../mail/types/messages';
import { PgBossClient } from '../../queue/services/pg-boss-client';

/**
 * Registers the mail OTP retry queue and its handler (D29, mirrors SmsRetryWorker). `expireInSeconds` here is
 * only a safety-net default for the queue itself — `MailService.queueOtpRetry` always passes the real, per-job
 * value, bounded to that code's own remaining TTL, which overrides this.
 */
@Injectable()
export class MailRetryWorker implements OnModuleInit {
  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.MailOtpRetry, {
      retryLimit: OTP_RETRY_LIMIT,
      retryDelay: OTP_RETRY_DELAY_SECONDS,
      expireInSeconds: 300,
      notify: true,
    });
    await this.pgBoss.boss.work<MailRetryPayload>(QueueName.MailOtpRetry, async (jobs) => {
      for (const job of jobs) {
        await this.mail.retrySend(job.data);
      }
    });
  }
}
