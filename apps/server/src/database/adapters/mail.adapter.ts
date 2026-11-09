import { Inject, Injectable } from '@nestjs/common';
import {
  MailRepository,
  MailSuppressionRepository,
  type Executor,
  type NewMailMessage,
  type NewMailSuppression,
} from '@lytronix/db';
import type { ClaimedMailMessage } from '../../modules/shared/mail/types/messages';
import type { MailStore } from '../../modules/shared/mail/ports/mail-store';
import { DatabaseService } from '../database.service';

/** The outbox, through the mail repository (D28, mirrors DrizzleMessageStore). */
@Injectable()
export class DrizzleMailStore implements MailStore {
  constructor(
    @Inject(MailRepository) private readonly mail: MailRepository,
    @Inject(MailSuppressionRepository) private readonly suppressions: MailSuppressionRepository,
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

  markSent(id: number, at: Date, providerMessageId: string | null = null): Promise<void> {
    return this.mail.markSent(this.database.handle.db, id, at, providerMessageId);
  }

  markSuppressed(id: number): Promise<void> {
    return this.mail.markSuppressed(this.database.handle.db, id);
  }

  isSuppressed(email: string): Promise<boolean> {
    return this.suppressions.isSuppressed(this.database.handle.db, email);
  }

  lift(email: string): Promise<boolean> {
    return this.suppressions.lift(this.database.handle.db, email);
  }

  suppress(row: NewMailSuppression): Promise<boolean> {
    return this.suppressions.suppress(this.database.handle.db, row);
  }

  markFailed(
    id: number,
    input: { error: string; attempts: number; nextAttemptAt: Date | null },
  ): Promise<void> {
    return this.mail.markFailed(this.database.handle.db, id, input);
  }
}
