import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import type { MailWords } from '../../../common/i18n/bilingual';
import { MailService } from '../../shared/mail/services/mail.service';
import { StaffService } from '../../staff/services/staff.service';
import { ownerReader } from '../../staff/types/owner-contact';
import type { LowBalanceNotifier } from '../ports/low-balance-notifier';
import { fromPaisa } from './money';

/** BAL-13: what the owner reads when the balance falls below a threshold, or runs out (threshold 0). */
export function lowBalanceWords(thresholdPaisa: bigint, balanceAfter: string): MailWords {
  if (thresholdPaisa === 0n) {
    return {
      bn: {
        subject: 'আপনার ব্যালেন্স শেষ',
        body:
          `আপনার শপের ব্যালেন্স শেষ: ${balanceAfter} TK। SMS, অর্ডার ফি আর অন্য চার্জ দিতে থাকতে ড্যাশবোর্ড ` +
          'থেকে ব্যালেন্স টপ-আপ করুন।',
      },
      en: {
        subject: 'Your balance has run out',
        body:
          `Your shop's balance has run out: ${balanceAfter} TK. Top up from the dashboard to keep paying for SMS, ` +
          'order fees and other charges.',
      },
    };
  }
  const threshold = fromPaisa(thresholdPaisa);
  return {
    bn: {
      subject: 'আপনার ব্যালেন্স কম',
      body:
        `আপনার শপের ব্যালেন্স ${balanceAfter} TK, ${threshold} TK-এর কম। SMS, অর্ডার ফি আর অন্য চার্জ দিতে থাকতে ` +
        'ড্যাশবোর্ড থেকে ব্যালেন্স টপ-আপ করুন।',
    },
    en: {
      subject: 'Your balance is low',
      body:
        `Your shop's balance is ${balanceAfter} TK, below ${threshold} TK. Top up from the dashboard to keep paying ` +
        'for SMS, order fees and other charges.',
    },
  };
}

/** WAL-21: what the owner reads when a payment's verification fee couldn't be paid, so staff check it by hand. */
export function feeShortWords(balance: string): MailWords {
  return {
    bn: {
      subject: 'ব্যালেন্স কম, তাই পেমেন্ট নিজে থেকে ভেরিফাই হচ্ছে না',
      body:
        `আপনার ${balance} TK ব্যালেন্স দিয়ে একটা পেমেন্ট নিজে থেকে ভেরিফাই করার ছোট ফি দেওয়া যায়নি, তাই পেমেন্টটি ` +
        'হাতে চেক করা হবে, ফ্রিতে। পেমেন্ট যেন নিজে থেকে ভেরিফাই হয়, সেজন্য ড্যাশবোর্ড থেকে ব্যালেন্স টপ-আপ করুন।',
    },
    en: {
      subject: 'Your balance is too low to verify payments by themselves',
      body:
        `Your balance of ${balance} TK could not pay the small fee for verifying a payment by itself, so that payment ` +
        'is checked by hand, for free. Top up from the dashboard so payments verify by themselves.',
    },
  };
}

/**
 * BAL-13: emails the owner when the balance falls below a threshold, in the language they chose. Never SMS (the
 * requirement's own rule). The in-app notice is the dashboard's balance banner, read from `GET /balance`.
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
    const owner = ownerReader(await this.staff.ownerContactIn(tx, tenantId));
    if (!owner) return;
    await this.mail.queueNotice(tx, owner, lowBalanceWords(thresholdPaisa, balanceAfter));
  }

  async notifyFeeShort(tx: Transaction, tenantId: string, balance: string): Promise<void> {
    const owner = ownerReader(await this.staff.ownerContactIn(tx, tenantId));
    if (!owner) return;
    await this.mail.queueNotice(tx, owner, feeShortWords(balance));
  }
}
