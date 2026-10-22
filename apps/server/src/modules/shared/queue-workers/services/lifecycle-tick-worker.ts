import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { AddonLifecycleService } from '../../../billing/services/addon-lifecycle.service';
import { DowngradeService } from '../../../billing/services/downgrade.service';
import { LifecycleService } from '../../../billing/services/lifecycle.service';
import { TrialLifecycleService } from '../../../billing/services/trial-lifecycle.service';
import { PlanPaymentsService } from '../../../payments/services/plan-payments.service';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// LIF-03: within 15 minutes of each boundary -- every 5 minutes comfortably clears that SLA.
const LIFECYCLE_TICK_CRON = '*/5 * * * *';

/**
 * Registers the recurring lifecycle tick (D2-6). The first use of pg-boss's own `boss.schedule()` in this
 * codebase -- every other job here is a one-shot, routed through the transactional outbox (JobRelay); this
 * one has no single business transaction to anchor to, so it is a true cron instead.
 *
 * Five independent due-date scans share this one tick, each its own `WHERE ... <= now` query against its
 * own candidate list (TRL-01/07, DWN-06/08/15/17, the lifecycle job's own LIF/BIL-14/PYG-21 passes,
 * BIL-15's stale-quote sweep, and PLN-14's add-on passes) -- not separate schedules, since they all need the
 * same cadence. The add-ons' runs last: it reads the periods and quotes the others just changed.
 */
@Injectable()
export class LifecycleTickWorker implements OnModuleInit {
  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(LifecycleService) private readonly lifecycle: LifecycleService,
    @Inject(TrialLifecycleService) private readonly trials: TrialLifecycleService,
    @Inject(DowngradeService) private readonly downgrade: DowngradeService,
    @Inject(PlanPaymentsService) private readonly planPayments: PlanPaymentsService,
    @Inject(AddonLifecycleService) private readonly addons: AddonLifecycleService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.LifecycleTick);
    await this.pgBoss.boss.schedule(QueueName.LifecycleTick, LIFECYCLE_TICK_CRON, {});
    await this.pgBoss.boss.work(QueueName.LifecycleTick, async () => {
      const now = new Date();
      await this.trials.convertExpiredTrials();
      await this.downgrade.applyDueChanges(now);
      await this.downgrade.sendFinalWarnings(now);
      await this.lifecycle.runTick(now);
      await this.planPayments.expireStalePending(now);
      // PLN-14: after the plans' own renewals and lapses, and the quotes they expired.
      await this.addons.runTick(now);
    });
  }
}
