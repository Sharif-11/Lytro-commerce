import {
  claimDueMessages,
  insertSmsMessage,
  markSmsFailed,
  markSmsSent,
  type Database,
  type Executor,
} from '@lytronix/db';
import type {
  ClaimedMessage,
  MessageKind,
  MessageStore,
} from '../../messaging/services/messaging.service';

/** The outbox, through the database package. */
export class DrizzleMessageStore implements MessageStore {
  constructor(private readonly db: Database) {}

  insert(
    executor: Executor,
    message: { toPhone: string; kind: MessageKind; body: string | null },
  ): Promise<number> {
    return insertSmsMessage(executor, message);
  }

  async claimDue(input: {
    now: Date;
    leaseUntil: Date;
    limit: number;
    onlyId?: number;
  }): Promise<ClaimedMessage[]> {
    const rows = await claimDueMessages(this.db, input);
    return rows.map((row) => ({
      id: row.id,
      toPhone: row.toPhone,
      body: row.body,
      attempts: row.attempts,
    }));
  }

  markSent(id: number, at: Date): Promise<void> {
    return markSmsSent(this.db, id, at);
  }

  markFailed(
    id: number,
    input: { error: string; attempts: number; nextAttemptAt: Date | null },
  ): Promise<void> {
    return markSmsFailed(this.db, id, input);
  }
}
