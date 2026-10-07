import { Inject, Injectable } from '@nestjs/common';
import { JobOutboxRepository, type Transaction } from '@lytronix/db';
import type { QueueName } from '@lytronix/validators';
import type { JobQueue } from '../ports/job-queue';
import type { EnqueueOptions } from '../types/enqueue-options';

/** Writes the enqueue intent to our own outbox table, inside the caller's transaction (D25). */
@Injectable()
export class OutboxJobQueue implements JobQueue {
  constructor(@Inject(JobOutboxRepository) private readonly outbox: JobOutboxRepository) {}

  enqueue(
    tx: Transaction,
    queueName: QueueName,
    payload: unknown,
    options?: EnqueueOptions,
  ): Promise<void> {
    return this.outbox.insert(tx, {
      queueName,
      payload,
      singletonKey: options?.singletonKey,
      expireInSeconds: options?.expireInSeconds,
      retryLimit: options?.retryLimit,
      retryDelay: options?.retryDelay,
    });
  }
}
