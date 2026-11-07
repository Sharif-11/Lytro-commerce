import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import type { NotificationKind } from '@lytronix/validators';
import type { MailWords } from '../../../common/i18n/bilingual';
import { MailService } from '../../shared/mail/services/mail.service';
import { StaffService } from '../../staff/services/staff.service';
import { ownerReader } from '../../staff/types/owner-contact';
import { fromMailWords } from '../notification-words';
import { Notifications } from './notifications';

/**
 * NTF-05, BIL-14, LIF-18 (Phase 7 Slice 7.3): a notice about the shop's own account -- renewal, balance, limits, its plan
 * and lifecycle -- goes three ways at once, in the caller's transaction: email to the owner in the language they chose
 * (when they have an address), and the bell and push to everyone its kind reaches (the owner; for low balance also the
 * staff who can top up, D7-42). Never by an SMS the shop pays for.
 */
@Injectable()
export class AccountNotices {
  constructor(
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(Notifications) private readonly notifications: Notifications,
  ) {}

  async send(
    tx: Transaction,
    tenantId: string,
    kind: NotificationKind,
    words: MailWords,
    link: string | null,
  ): Promise<void> {
    const owner = ownerReader(await this.staff.ownerContactIn(tx, tenantId));
    if (owner) await this.mail.queueNotice(tx, owner, words);
    await this.notifications.notifyWithin(tx, { tenantId, kind, text: fromMailWords(words), link });
  }
}
