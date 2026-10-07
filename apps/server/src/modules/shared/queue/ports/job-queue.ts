import type { Transaction } from '@lytronix/db';
import type { QueueName } from '@lytronix/validators';
import type { EnqueueOptions } from '../types/enqueue-options';

/**
 * The one interface this codebase uses to queue a background job (SCL-08). No caller reaches pg-boss directly,
 * so it stays swappable for a message broker later without touching callers.
 */
export interface JobQueue {
  /** Commits in the caller's own transaction — the enqueue step's atomicity boundary (D25). */
  enqueue(
    tx: Transaction,
    queueName: QueueName,
    payload: unknown,
    options?: EnqueueOptions,
  ): Promise<void>;
}
