import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { LifecycleService } from '../../../billing/services/lifecycle.service';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// LIF-03: within 15 minutes of each boundary -- every 5 minutes comfortably clears that SLA.
const LIFECYCLE_TICK_CRON = '*/5 * * * *';

/**
 * Registers the recurring lifecycle tick (D2-6). The first use of pg-boss's own `boss.schedule()` in this
 * codebase -- every other job here is a one-shot, routed through the transactional outbox (JobRelay); this
 * one has no single business transaction to anchor to, so it is a true cron instead.
 */
@Injectable()
export class LifecycleTickWorker implements OnModuleInit {
  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(LifecycleService) private readonly lifecycle: LifecycleService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.LifecycleTick);
    await this.pgBoss.boss.schedule(QueueName.LifecycleTick, LIFECYCLE_TICK_CRON, {});
    await this.pgBoss.boss.work(QueueName.LifecycleTick, async () => {
      await this.lifecycle.runTick(new Date());
    });
  }
}
