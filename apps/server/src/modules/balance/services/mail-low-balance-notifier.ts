import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { MailService } from '../../shared/mail/services/mail.service';
import { StaffService } from '../../staff/services/staff.service';
import type { LowBalanceNotifier } from '../ports/low-balance-notifier';
import { fromPaisa } from './money';

/**
 * BAL-13: emails the owner when the balance falls below a threshold. Never SMS (the requirement's own rule).
 * The in-app notice is the dashboard's balance banner, read from `GET /balance`; push has no provider yet.
 */
@Injectable()
export class MailLowBalanceNotifier implements LowBalanceNotifier {
  constructor(
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  async notifyCrossed(
    tx: Transaction,
    tenantId: string,
    thresholdPaisa: bigint,
    balanceAfter: string,
  ): Promise<void> {
    const owner = await this.staff.ownerContactIn(tx, tenantId);
    if (!owner?.email) return;
    const topUp = 'Top up from the dashboard to keep paying for SMS, order fees and other charges.';
    const [subject, body] =
      thresholdPaisa === 0n
        ? [
            'Your balance has run out',
            `Your shop's balance has run out: ${balanceAfter} TK. ${topUp}`,
          ]
        : [
            'Your balance is low',
            `Your shop's balance is ${balanceAfter} TK, below ${fromPaisa(thresholdPaisa)} TK. ${topUp}`,
          ];
    await this.mail.queueLifecycleNotice(tx, owner.email, subject, body);
  }

  async notifyFeeShort(tx: Transaction, tenantId: string, balance: string): Promise<void> {
    const owner = await this.staff.ownerContactIn(tx, tenantId);
    if (!owner?.email) return;
    await this.mail.queueLifecycleNotice(
      tx,
      owner.email,
      'Your balance is too low to verify payments by themselves',
      `Your balance of ${balance} TK could not pay the small fee for verifying a payment by itself, so that payment is checked by hand, for free. Top up from the dashboard so payments verify by themselves.`,
    );
  }
}
