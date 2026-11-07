import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import {
  SMS_EVENT_RETRIES,
  SMS_EVENT_RETRY_DELAY_SECONDS,
  SmsEventSender,
} from '../../../sms-events/services/sms-event-sender';
import type { SmsEventJob } from '../../../sms-events/services/sms-event-queue';
import { PgBossClient } from '../../queue/services/pg-boss-client';

/**
 * SMS-01, SMS-08 (Slice 7.2): sends an order's SMS events, queued in the transaction where the order changed. A send that
 * failed (and was given back) throws, so the job tries again later, never touching the order.
 */
@Injectable()
export class SmsEventWorker implements OnModuleInit {
  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(SmsEventSender) private readonly sender: SmsEventSender,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.OrderSms, {
      retryLimit: SMS_EVENT_RETRIES,
      retryDelay: SMS_EVENT_RETRY_DELAY_SECONDS,
      retryBackoff: true,
      notify: true,
    });
    await this.pgBoss.boss.work<SmsEventJob>(QueueName.OrderSms, async (jobs) => {
      for (const job of jobs) {
        await this.sender.send(job.data);
      }
    });
  }
}
