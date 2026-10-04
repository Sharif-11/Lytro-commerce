import { SmsRepository, type Database, type Executor } from '@lytronix/db';
import type {
  ClaimedMessage,
  MessageKind,
  MessageStore,
} from '../../messaging/services/messaging.service';

/** The outbox, through the SMS repository. */
export class DrizzleMessageStore implements MessageStore {
  private readonly sms = new SmsRepository();

  constructor(private readonly db: Database) {}

  insert(
    executor: Executor,
    message: { toPhone: string; kind: MessageKind; body: string | null },
  ): Promise<number> {
    return this.sms.insert(executor, message);
  }

  async claimDue(input: {
    now: Date;
    leaseUntil: Date;
    limit: number;
    onlyId?: number;
  }): Promise<ClaimedMessage[]> {
    const rows = await this.sms.claimDue(this.db, input);
    return rows.map((row) => ({
      id: row.id,
      toPhone: row.toPhone,
      body: row.body,
      attempts: row.attempts,
    }));
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
