import type { Executor, NewMailMessage, NewMailSuppression } from '@lytronix/db';
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
  markSent(id: number, at: Date, providerMessageId?: string | null): Promise<void>;
  markFailed(
    id: number,
    input: { error: string; attempts: number; nextAttemptAt: Date | null },
  ): Promise<void>;
  /** NTF-06 (Slice 7.3): never sent, its address being stopped. */
  markSuppressed(id: number): Promise<void>;
  /** NTF-06: whether Lytro has stopped emailing this address. */
  isSuppressed(email: string): Promise<boolean>;
  /** NTF-06: the address works again. Whether it had been stopped. */
  lift(email: string): Promise<boolean>;
  /** NTF-06: the address bounced for good or complained, so Lytro stops emailing it. */
  suppress(row: NewMailSuppression): Promise<void>;
}
