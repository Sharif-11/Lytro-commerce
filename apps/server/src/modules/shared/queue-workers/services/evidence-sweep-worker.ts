import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { PaymentEvidence } from '../../../payment-evidence/services/payment-evidence';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// D8-47: once a night in Asia/Dhaka, clear of the 03:30 to 03:47 clean-up jobs and 02:30's record of each shop's day.
const EVIDENCE_SWEEP_CRON = '10 4 * * *';
const EVIDENCE_SWEEP_TZ = 'Asia/Dhaka';

/** D8-47 (Phase 8 Slice 8.5): removes payment screenshots past their two years. Safe to run twice. */
@Injectable()
export class EvidenceSweepWorker implements OnModuleInit {
  private readonly logger = new Logger('EvidenceSweep');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(PaymentEvidence) private readonly evidence: PaymentEvidence,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.EvidenceSweep);
    await this.pgBoss.boss.schedule(
      QueueName.EvidenceSweep,
      EVIDENCE_SWEEP_CRON,
      {},
      { tz: EVIDENCE_SWEEP_TZ },
    );
    await this.pgBoss.workOnce(QueueName.EvidenceSweep, async () => {
      const removed = await this.evidence.sweep();
      this.logger.log(`payment screenshots removed: ${String(removed)}`);
    });
  }
}
