import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { Reconciliation } from '../../../reconciliation/services/reconciliation';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// DAT-52, D9-16 (Phase 9 Slice 9.5, the user 2026-11-13): at 06:00 in Asia/Dhaka, after the 05:30 backup (Slice 9.3), with
// the day it compares long over.
const RECONCILIATION_CRON = '0 6 * * *';
const RECONCILIATION_TZ = 'Asia/Dhaka';

/** DAT-52: yesterday's money compared, once across servers; a second run of the same day adds nothing. */
@Injectable()
export class ReconciliationTickWorker implements OnModuleInit {
  private readonly logger = new Logger('ReconciliationTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(Reconciliation) private readonly reconciliation: Reconciliation,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.ReconciliationTick);
    await this.pgBoss.boss.schedule(
      QueueName.ReconciliationTick,
      RECONCILIATION_CRON,
      {},
      { tz: RECONCILIATION_TZ },
    );
    await this.pgBoss.workOnce(QueueName.ReconciliationTick, async () => {
      const result = await this.reconciliation.run();
      this.logger.log(
        `reconciliation of ${result.day}: ${String(result.found)} differences, ${String(result.added)} new, ` +
          `${String(result.failed)} checks failed`,
      );
    });
  }
}
