import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { QueueName } from '@lytronix/validators';
import type { JobQueue } from '../../shared/queue/ports/job-queue';
import { JOB_QUEUE } from '../../shared/queue/tokens';
import type { UsageNotices } from '../ports/usage-notices';
import type { UsageNotice } from '../types/usage-notice';

/**
 * LIM-01, SCL-08: a usage notice joins the job queue in the transaction that crossed it, so a write that rolls back
 * warns no one, and the usage-notice worker writes and sends it afterwards.
 */
@Injectable()
export class QueuedUsageNotices implements UsageNotices {
  constructor(@Inject(JOB_QUEUE) private readonly jobs: JobQueue) {}

  queue(tx: Transaction, notice: UsageNotice): Promise<void> {
    return this.jobs.enqueue(tx, QueueName.UsageNotice, notice);
  }
}
