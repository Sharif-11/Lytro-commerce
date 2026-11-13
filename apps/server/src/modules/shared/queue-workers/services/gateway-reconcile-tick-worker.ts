import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { LytroCheckouts } from '../../../lytro-payments/services/lytro-checkouts';
import { GatewayReconcile } from '../../../gateway/services/gateway-reconcile';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// VER-09: every minute, so a checkout that ran out with no return is asked after before its session closes.
const GATEWAY_RECONCILE_CRON = '* * * * *';

/** Registers the gateway's minute pass (Phase 5 Slice 5.7). Safe to run twice: a settled payment settles once. */
@Injectable()
export class GatewayReconcileTickWorker implements OnModuleInit {
  private readonly logger = new Logger('GatewayReconcileTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(GatewayReconcile) private readonly reconcile: GatewayReconcile,
    @Inject(LytroCheckouts) private readonly lytro: LytroCheckouts,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.GatewayReconcileTick);
    await this.pgBoss.boss.schedule(QueueName.GatewayReconcileTick, GATEWAY_RECONCILE_CRON, {});
    await this.pgBoss.workOnce(QueueName.GatewayReconcileTick, async () => {
      const result = await this.reconcile.runTick(new Date());
      const lytro = await this.lytro.reconcile(new Date());
      if (lytro > 0) this.logger.log(`Lytro's checkout: ${String(lytro)} payments settled`);
      if (result.settled > 0) {
        this.logger.log(`gateway reconcile: ${String(result.settled)} payments settled`);
      }
    });
  }
}
