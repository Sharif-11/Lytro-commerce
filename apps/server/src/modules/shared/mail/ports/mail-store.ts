import type { Executor, NewMailMessage } from '@lytronix/db';
import type { ClaimedMailMessage } from '../types/messages';

// Recording and claiming outbox messages. Implemented in database/adapters (D28, mirrors MessageStore).
export interface MailStore {
  insert(executor: Executor, message: NewMailMessage): Promise<number>;
  claimDue(input: {
    now: Date;
    leaseUntil: Date;
    limit: number;
    onlyId?: number;
  }): Promise<ClaimedMailMessage[]>;
  markSent(id: number, at: Date): Promise<void>;
  markFailed(
    id: number,
    input: { error: string; attempts: number; nextAttemptAt: Date | null },
  ): Promise<void>;
}
