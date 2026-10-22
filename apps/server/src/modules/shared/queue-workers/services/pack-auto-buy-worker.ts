import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { AddonPackService } from '../../../billing/services/addon-pack.service';
import type { PackAutoBuy } from '../../../usage-warnings/types/pack-auto-buy';
import { PgBossClient } from '../../queue/services/pg-boss-client';

/**
 * BND-04, RTE-11, PLN-15: buys each pack auto-buy asked for, queued in the minute's count that reached the cycle's
 * allowance (SCL-08). A failed try is tried again later; a pack is bought at most once for each ask, since the cycle
 * records the ask and the purchase settles it.
 */
@Injectable()
export class PackAutoBuyWorker implements OnModuleInit {
  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(AddonPackService) private readonly packs: AddonPackService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.PackAutoBuy, {
      retryLimit: 5,
      retryDelay: 30,
      retryBackoff: true,
      notify: true,
    });
    await this.pgBoss.boss.work<PackAutoBuy>(QueueName.PackAutoBuy, async (jobs) => {
      for (const job of jobs) {
        await this.packs.autoBuy(job.data);
      }
    });
  }
}
