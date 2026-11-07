import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { OPERATOR_INBOXES } from '../tokens';
import { MailService } from './mail.service';

/** Where Lytro's own operators read their email: every enrolled operator account's address, the fast-spend alert's too. */
export interface OperatorInboxes {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  list(): Promise<string[]>;
}

/**
 * D7-43 (Slice 7.3's read, agreed 2026-11-07): a notice about Lytro itself rather than a shop -- Lytro's own listener
 * phone revoked or sending too much, wallet messages it couldn't read -- is emailed to every operator, in English, through
 * the same outbox as every other email. How many it went to; none enrolled is logged, never thrown.
 */
@Injectable()
export class OperatorAlerts {
  private readonly logger = new Logger('OperatorAlerts');

  constructor(
    @Inject(OPERATOR_INBOXES) private readonly inboxes: OperatorInboxes,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  async alert(subject: string, body: string): Promise<number> {
    const emails = await this.inboxes.list();
    if (emails.length === 0) {
      this.logger.warn(`no operator has an email for: ${subject}`);
      return 0;
    }
    await this.inboxes.run(async (tx) => {
      for (const email of emails) await this.mail.queueLifecycleNotice(tx, email, subject, body);
    });
    return emails.length;
  }
}
