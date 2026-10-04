import { SmsRepository, type Database, type Executor, type NewSmsMessage } from '@lytronix/db';
import type { ClaimedMessage, MessageStore } from '../../messaging/services/messaging.service';

/** The outbox, through the SMS repository. */
export class DrizzleMessageStore implements MessageStore {
  private readonly sms = new SmsRepository();

  constructor(private readonly db: Database) {}

  insert(executor: Executor, message: NewSmsMessage): Promise<number> {
    return this.sms.insert(executor, message);
  }

  claimDue(input: {
    now: Date;
    leaseUntil: Date;
    limit: number;
    onlyId?: number;
  }): Promise<ClaimedMessage[]> {
    return this.sms.claimDue(this.db, input);
  }

  markSent(id: number, at: Date): Promise<void> {
    return this.sms.markSent(this.db, id, at);
  }

  markFailed(
    id: number,
    input: { error: string; attempts: number; nextAttemptAt: Date | null },
  ): Promise<void> {
    return this.sms.markFailed(this.db, id, input);
  }
}
