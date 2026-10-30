import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import {
  META_PURCHASE_RETRIES,
  META_PURCHASE_RETRY_DELAY_SECONDS,
  MetaPurchaseSender,
  type MetaPurchasePayload,
} from '../../../public-api/services/meta-purchase-sender';
import { PgBossClient } from '../../queue/services/pg-boss-client';

/**
 * LND-16: tells Meta's Conversions API of a shopper's order. Enqueued in the transaction that made the order (SCL-08);
 * Meta being away fails the try, and the job tries again later, never touching the order.
 */
@Injectable()
export class MetaPurchaseWorker implements OnModuleInit {
  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(MetaPurchaseSender) private readonly sender: MetaPurchaseSender,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.MetaPurchase, {
      retryLimit: META_PURCHASE_RETRIES,
      retryDelay: META_PURCHASE_RETRY_DELAY_SECONDS,
      retryBackoff: true,
      notify: true,
    });
    await this.pgBoss.boss.work<MetaPurchasePayload>(QueueName.MetaPurchase, async (jobs) => {
      for (const job of jobs) {
        await this.sender.send(job.data);
      }
    });
  }
}
