import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { QueueName } from '@lytronix/validators';
import type { JobQueue } from '../../shared/queue/ports/job-queue';
import { JOB_QUEUE } from '../../shared/queue/tokens';
import type { PackAutoBuys } from '../ports/pack-auto-buys';
import type { PackAutoBuy } from '../types/pack-auto-buy';

/**
 * BND-04, RTE-11, SCL-08: a pack to buy joins the job queue in the transaction that reached the allowance, so a count
 * that rolls back buys nothing, and the pack worker buys it afterwards.
 */
@Injectable()
export class QueuedPackAutoBuys implements PackAutoBuys {
  constructor(@Inject(JOB_QUEUE) private readonly jobs: JobQueue) {}

  queue(tx: Transaction, buy: PackAutoBuy): Promise<void> {
    return this.jobs.enqueue(tx, QueueName.PackAutoBuy, buy);
  }
}
