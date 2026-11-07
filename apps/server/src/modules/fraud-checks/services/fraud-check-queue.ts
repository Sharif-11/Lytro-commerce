import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { QueueName } from '@lytronix/validators';
import type { JobQueue } from '../../shared/queue/ports/job-queue';
import { JOB_QUEUE } from '../../shared/queue/tokens';

/** FRD-05: a new cash-on-delivery order, queued for its automatic check. */
export interface FraudCheckJob {
  tenantId: string;
  orderId: string;
  phone: string;
  /** What the order collects on delivery, for the rule's smallest amount. */
  codAmount: string;
}

/**
 * FRD-05, FRD-06, D7-50 (Phase 7 Slice 7.5): the one way a new order reaches its automatic check. Called in the
 * transaction that made the order, so the job commits with the order or not at all; the rule, the check and its outside
 * call all happen apart from it, and never hold the order up. One job per order: the order's ID is its key.
 */
@Injectable()
export class FraudCheckQueue {
  constructor(@Inject(JOB_QUEUE) private readonly jobs: JobQueue) {}

  async queue(tx: Transaction, job: FraudCheckJob): Promise<void> {
    await this.jobs.enqueue(tx, QueueName.OrderFraudCheck, job, { singletonKey: job.orderId });
  }
}
