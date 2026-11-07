import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { ChallengeKind, MailKind, type Language } from '@lytronix/validators';
import { inLanguage, type MailWords } from '../../../../common/i18n/bilingual';
import { MINUTE_MS } from '../../../../common/time';
import { MailDeliveryError } from '../../../../common/errors/mail-delivery';
import { MAIL_CLOCK, MAIL_PROVIDER, MAIL_STORE } from '../tokens';
import type { MailStore } from '../ports/mail-store';
import type { MailProvider } from '../ports/mail-provider';
import { MailRefused } from '../providers/resend-mail.provider';
import type { ClaimedMailMessage, QueuedMailMessage } from '../types/messages';

// SMS-18, D6, D28: mail's own outbox, mirroring MessagingService exactly.

/** Wait after the first, second, third and fourth failed attempt. A fifth failure is final. */
export const RETRY_WAIT_MINUTES = [1, 5, 15, 60];
export const MAX_MAIL_ATTEMPTS = 5;
const LEASE_MS = 2 * MINUTE_MS;

/** Who a notice goes to: their address, and the language they chose (null until they choose, then Bangla). */
export interface MailReader {
  email: string;
  language: Language | null;
}

/**
 * AUTH-05, I18N-01: a code's email, in both languages, since the person asking may not have chosen one yet, or may
 * not have a shop to choose it in. The code comes first in each, as the SMS codes say it (D7-26).
 */
function otpText(code: string, purpose: ChallengeKind): { subject: string; body: string } {
  if (purpose === ChallengeKind.Reset) {
    return {
      subject: 'Lytro-এ পাসওয়ার্ড রিসেটের কোড / Your password reset code',
      body:
        `Lytro-এ পাসওয়ার্ড রিসেটের জন্য OTP হচ্ছে ${code}। কোডটি 5 মিনিট কাজ করবে। কারো সাথে শেয়ার করবেন না।\n\n` +
        `Your code is ${code}. It expires in 5 minutes. Do not share it.`,
    };
  }
  return {
    subject: 'Lytro-এ লগইনের কোড / Your sign-in code',
    body:
      `Lytro-এ লগইনের জন্য OTP হচ্ছে ${code}। কোডটি 5 মিনিট কাজ করবে। কারো সাথে শেয়ার করবেন না।\n\n` +
      `Your code is ${code}. It expires in 5 minutes. Do not share it.`,
  };
}

// LIF-16: the owner's finished export, in their language.
const EXPORT_READY: MailWords = {
  bn: {
    subject: 'আপনার ডেটা এক্সপোর্ট রেডি',
    body: 'আপনার চাওয়া ডেটা এক্সপোর্ট রেডি। 24 ঘণ্টার মধ্যে ড্যাশবোর্ড থেকে ডাউনলোড করুন।',
  },
  en: {
    subject: 'Your data export is ready',
    body: 'Your requested data export is ready. Download it from your dashboard within 24 hours.',
  },
};

@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_STORE) private readonly store: MailStore,
    @Inject(MAIL_PROVIDER) private readonly provider: MailProvider,
    @Inject(MAIL_CLOCK) private readonly clock: () => Date,
  ) {}

  async queueOtp(
    tx: Transaction,
    to: string,
    code: string,
    purpose: ChallengeKind,
  ): Promise<QueuedMailMessage> {
    const { subject, body } = otpText(code, purpose);
    const id = await this.store.insert(tx, {
      toEmail: to,
      kind: MailKind.Otp,
      subject: null,
      body: null,
    });
    return { id, toEmail: to, subject, body };
  }

  /**
   * LIF-18, PYG-21: a platform-sent notice to a person, never billed to the tenant (LIF-10's carve-out), in the language
   * they chose (Slice 7.3's read).
   */
  queueNotice(tx: Transaction, to: MailReader, words: MailWords): Promise<QueuedMailMessage> {
    const { subject, body } = inLanguage(words, to.language);
    return this.queueLifecycleNotice(tx, to.email, subject, body);
  }

  /** A platform-sent notice in words already chosen: to Lytro's own operators, who read English (D7-43). */
  async queueLifecycleNotice(
    tx: Transaction,
    to: string,
    subject: string,
    body: string,
  ): Promise<QueuedMailMessage> {
    const id = await this.store.insert(tx, {
      toEmail: to,
      kind: MailKind.LifecycleNotice,
      subject,
      body,
    });
    return { id, toEmail: to, subject, body };
  }

  /** LIF-16: the owner's export finished -- email only, deliberately never SMS (sidesteps whether a
   * self-requested export should count against the essential-SMS allowance by not using that channel). */
  async queueDataExportReady(tx: Transaction, to: MailReader): Promise<QueuedMailMessage> {
    const { subject, body } = inLanguage(EXPORT_READY, to.language);
    const id = await this.store.insert(tx, {
      toEmail: to.email,
      kind: MailKind.DataExportReady,
      subject,
      body,
    });
    return { id, toEmail: to.email, subject, body };
  }

  /**
   * NTF-06 (Slice 7.3's read): a code the person asked for reached this address, so it works again and Lytro may email
   * it. Whether it had been stopped.
   */
  unsuppress(email: string): Promise<boolean> {
    return this.store.lift(email);
  }

  /** NTF-06: whether Lytro has stopped emailing this address, for the dashboard's banner. */
  isSuppressed(email: string): Promise<boolean> {
    return this.store.isSuppressed(email);
  }

  /**
   * Sends a one-time code during its request. A failure is recorded, then reported, since no code arrived. A stopped
   * address is still tried (NTF-06): only a code can prove it works again.
   */
  async deliverOtp(message: QueuedMailMessage): Promise<void> {
    try {
      const sent = await this.provider.send({
        to: message.toEmail,
        subject: message.subject,
        body: message.body,
        idempotencyKey: this.keyOf(message.id),
      });
      await this.store.markSent(message.id, this.clock(), sent.providerMessageId);
    } catch (error) {
      await this.store.markFailed(message.id, {
        error: this.describe(error),
        attempts: 1,
        nextAttemptAt: null,
      });
      throw new MailDeliveryError();
    }
  }

  /** Tries to send messages whose transaction has committed. */
  async dispatch(messages: readonly QueuedMailMessage[]): Promise<void> {
    for (const message of messages) {
      try {
        const now = this.clock();
        const [claimed] = await this.store.claimDue({
          now,
          leaseUntil: new Date(now.getTime() + LEASE_MS),
          limit: 1,
          onlyId: message.id,
        });
        if (claimed) await this.sendClaimed(claimed);
      } catch (error) {
        console.error(
          `[mail] could not dispatch message ${String(message.id)}: ${this.describe(error)}`,
        );
      }
    }
  }

  /** Sends one batch of messages that are due. Called by the retry worker. */
  async runDue(limit = 20): Promise<number> {
    const now = this.clock();
    const due = await this.store.claimDue({
      now,
      leaseUntil: new Date(now.getTime() + LEASE_MS),
      limit,
    });
    for (const message of due) {
      await this.sendClaimed(message);
    }
    return due.length;
  }

  private async sendClaimed(message: ClaimedMailMessage): Promise<void> {
    // NTF-06: checked as it goes, not as it was queued, so a bounce heard in between still stops it.
    if (await this.store.isSuppressed(message.toEmail)) {
      await this.store.markSuppressed(message.id);
      return;
    }
    try {
      const sent = await this.provider.send({
        to: message.toEmail,
        subject: message.subject,
        body: message.body,
        idempotencyKey: this.keyOf(message.id),
      });
      await this.store.markSent(message.id, this.clock(), sent.providerMessageId);
    } catch (error) {
      const attempts = message.attempts + 1;
      // D7-3: a refusal would be refused again, so it is final at once.
      const final = error instanceof MailRefused || attempts >= MAX_MAIL_ATTEMPTS;
      const wait = RETRY_WAIT_MINUTES[attempts - 1] ?? 60;
      const nextAttemptAt = final ? null : new Date(this.clock().getTime() + wait * MINUTE_MS);
      await this.store.markFailed(message.id, {
        error: this.describe(error),
        attempts,
        nextAttemptAt,
      });
      if (final) {
        // Operator alert, as a log line: emailing the operators that email failed could fail the same way.
        console.error(
          `[mail] message ${String(message.id)} failed permanently: ${this.describe(error)}`,
        );
      }
    }
  }

  /** D7-3: one key per outbox row, so every retry of one email is the same email to the provider. */
  private keyOf(id: number): string {
    return `lytro-mail-${String(id)}`;
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
