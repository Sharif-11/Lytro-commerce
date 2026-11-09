import type { Executor, FailedSmsRow, NewSmsMessage, ShopMessages } from '@lytronix/db';
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
  /** ADM-03, D8-30: how many of the shop's messages failed for good since `since`. */
  countFailedForShop(shop: ShopMessages, since: Date): Promise<number>;
  /** ADM-03, D8-30: the shop's messages that failed for good, newest first. */
  failedForShop(
    shop: ShopMessages,
    beforeId: number | null,
    limit: number,
  ): Promise<FailedSmsRow[]>;
  markFailed(
    id: number,
    input: { error: string; attempts: number; nextAttemptAt: Date | null },
  ): Promise<void>;
}
