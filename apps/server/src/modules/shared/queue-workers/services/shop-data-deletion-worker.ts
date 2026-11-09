import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { LifecycleService } from '../../../billing/services/lifecycle.service';
import { PgBossClient } from '../../queue/services/pg-boss-client';

interface ShopDataDeletionPayload {
  tenantId: string;
}

/** ADM-13, D8-13: deletes one shop's data on request. One job per request, queued with the request that took it offline. */
@Injectable()
export class ShopDataDeletionWorker implements OnModuleInit {
  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(LifecycleService) private readonly lifecycle: LifecycleService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.ShopDataDeletion);
    await this.pgBoss.boss.work<ShopDataDeletionPayload>(
      QueueName.ShopDataDeletion,
      async (jobs) => {
        for (const job of jobs) {
          await this.lifecycle.eraseRequested(job.data.tenantId);
        }
      },
    );
  }
}
