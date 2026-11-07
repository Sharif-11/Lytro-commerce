import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import type { FraudCheckJob } from '../../../fraud-checks/services/fraud-check-queue';
import { FraudChecks } from '../../../fraud-checks/services/fraud-checks';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// FRD-05 (Slice 7.5): a check that failed for a reason of the server's own is tried once more, a minute later; a check
// the rule or a refusal leaves out is skipped, not failed.
const FRAUD_CHECK_RETRIES = 1;
const FRAUD_CHECK_RETRY_DELAY_SECONDS = 60;

/**
 * FRD-05, FRD-06 (Phase 7 Slice 7.5): runs a new cash-on-delivery order's automatic check, queued in the transaction that
 * made the order. Whatever it does, the order is already made and never touched.
 */
@Injectable()
export class FraudCheckWorker implements OnModuleInit {
  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(FraudChecks) private readonly checks: FraudChecks,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.OrderFraudCheck, {
      retryLimit: FRAUD_CHECK_RETRIES,
      retryDelay: FRAUD_CHECK_RETRY_DELAY_SECONDS,
      notify: true,
    });
    await this.pgBoss.boss.work<FraudCheckJob>(QueueName.OrderFraudCheck, async (jobs) => {
      for (const job of jobs) {
        await this.checks.onNewOrder(job.data);
      }
    });
  }
}
