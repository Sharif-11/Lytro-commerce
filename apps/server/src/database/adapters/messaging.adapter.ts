import { Inject, Injectable } from '@nestjs/common';
import { SmsRepository, type Executor, type NewSmsMessage } from '@lytronix/db';
import type { ClaimedMessage } from '../../modules/shared/messaging/types/messages';
import type { MessageStore } from '../../modules/shared/messaging/ports/message-store';
import { DatabaseService } from '../database.service';

/** The outbox, through the SMS repository. */
@Injectable()
export class DrizzleMessageStore implements MessageStore {
  constructor(
    @Inject(SmsRepository) private readonly sms: SmsRepository,
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
  ) {}

  insert(executor: Executor, message: NewSmsMessage): Promise<number> {
    return this.sms.insert(executor, message);
  }

  claimDue(input: {
    now: Date;
    leaseUntil: Date;
    limit: number;
    onlyId?: number;
  }): Promise<ClaimedMessage[]> {
    return this.sms.claimDue(this.database.handle.db, input);
  }

  markSent(id: number, at: Date): Promise<void> {
    return this.sms.markSent(this.database.handle.db, id, at);
  }

  markFailed(
    id: number,
    input: { error: string; attempts: number; nextAttemptAt: Date | null },
  ): Promise<void> {
    return this.sms.markFailed(this.database.handle.db, id, input);
  }
}
