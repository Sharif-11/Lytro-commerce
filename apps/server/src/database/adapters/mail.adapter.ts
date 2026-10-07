import { Inject, Injectable } from '@nestjs/common';
import { MailRepository, type Executor, type NewMailMessage } from '@lytronix/db';
import type { ClaimedMailMessage } from '../../modules/shared/mail/types/messages';
import type { MailStore } from '../../modules/shared/mail/ports/mail-store';
import { DatabaseService } from '../database.service';

/** The outbox, through the mail repository (D28, mirrors DrizzleMessageStore). */
@Injectable()
export class DrizzleMailStore implements MailStore {
  constructor(
    @Inject(MailRepository) private readonly mail: MailRepository,
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
  ) {}

  insert(executor: Executor, message: NewMailMessage): Promise<number> {
    return this.mail.insert(executor, message);
  }

  claimDue(input: {
    now: Date;
    leaseUntil: Date;
    limit: number;
    onlyId?: number;
  }): Promise<ClaimedMailMessage[]> {
    return this.mail.claimDue(this.database.handle.db, input);
  }

  markSent(id: number, at: Date): Promise<void> {
    return this.mail.markSent(this.database.handle.db, id, at);
  }

  markFailed(
    id: number,
    input: { error: string; attempts: number; nextAttemptAt: Date | null },
  ): Promise<void> {
    return this.mail.markFailed(this.database.handle.db, id, input);
  }
}
