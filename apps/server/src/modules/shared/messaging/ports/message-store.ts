import type { Executor, NewSmsMessage } from '@lytronix/db';
import type { ClaimedMessage } from '../types/messages';

// Recording and claiming outbox messages. Implemented in database/adapters.
export interface MessageStore {
  insert(executor: Executor, message: NewSmsMessage): Promise<number>;
  claimDue(input: {
    now: Date;
    leaseUntil: Date;
    limit: number;
    onlyId?: number;
  }): Promise<ClaimedMessage[]>;
  markSent(id: number, at: Date): Promise<void>;
  markFailed(
    id: number,
    input: { error: string; attempts: number; nextAttemptAt: Date | null },
  ): Promise<void>;
}
