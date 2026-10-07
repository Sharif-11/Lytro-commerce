import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { ChallengeKind, MailKind, QueueName } from '@lytronix/validators';
import { MINUTE_MS } from '../../../../common/time';
import { MailDeliveryError } from '../../../../common/errors/mail-delivery';
import type { JobQueue } from '../../queue/ports/job-queue';
import { JOB_QUEUE } from '../../queue/tokens';
import { MAIL_CLOCK, MAIL_PROVIDER, MAIL_STORE } from '../tokens';
import type { MailStore } from '../ports/mail-store';
import type { MailProvider } from '../ports/mail-provider';
import type { ClaimedMailMessage, MailRetryPayload, QueuedMailMessage } from '../types/messages';

// SMS-18, D6, D28: mail's own outbox, mirroring MessagingService exactly.

/** Wait after the first, second, third and fourth failed attempt. A fifth failure is final. */
export const RETRY_WAIT_MINUTES = [1, 5, 15, 60];
export const MAX_MAIL_ATTEMPTS = 5;
const LEASE_MS = 2 * MINUTE_MS;

// D29: a bounded pg-boss retry for an OTP email's failed synchronous send, mirroring D27's SMS retry exactly.
export const OTP_RETRY_LIMIT = 2;
export const OTP_RETRY_DELAY_SECONDS = 20;

@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_STORE) private readonly store: MailStore,
    @Inject(MAIL_PROVIDER) private readonly provider: MailProvider,
    @Inject(MAIL_CLOCK) private readonly clock: () => Date,
    @Inject(JOB_QUEUE) private readonly jobQueue: JobQueue,
  ) {}

  async queueOtp(
    tx: Transaction,
    to: string,
    code: string,
    purpose: ChallengeKind,
  ): Promise<QueuedMailMessage> {
    const subject =
      purpose === ChallengeKind.Reset ? 'Your password reset code' : 'Your sign-in code';
    const body = `Your code is ${code}. It expires in 5 minutes. Do not share it.`;
    const id = await this.store.insert(tx, {
      toEmail: to,
      kind: MailKind.Otp,
      subject: null,
      body: null,
    });
    return { id, toEmail: to, subject, body };
  }

  async queueShopReady(tx: Transaction, to: string, liveUrl: string): Promise<QueuedMailMessage> {
    const subject = 'Your shop is ready';
    const body = `Your shop is ready: ${liveUrl}`;
    const id = await this.store.insert(tx, {
      toEmail: to,
      kind: MailKind.ShopReady,
      subject,
      body,
    });
    return { id, toEmail: to, subject, body };
  }

  /** Sends a one-time code during its request. A failure is recorded, then reported, since no code arrived. */
  async deliverOtp(message: QueuedMailMessage): Promise<void> {
    try {
      await this.provider.send({
        to: message.toEmail,
        subject: message.subject,
        body: message.body,
      });
      await this.store.markSent(message.id, this.clock());
    } catch (error) {
      await this.store.markFailed(message.id, {
        error: this.describe(error),
        attempts: 1,
        nextAttemptAt: null,
      });
      throw new MailDeliveryError();
    }
  }

  /**
   * Queues a bounded retry for an OTP email's failed synchronous send, while the code can still be used (D29).
   * `expiresAt` is the code's own expiry; the job is bounded to whatever is left of it, so pg-boss drops it
   * once that window passes rather than resending a code that no longer works.
   */
  async queueOtpRetry(tx: Transaction, message: QueuedMailMessage, expiresAt: Date): Promise<void> {
    const expireInSeconds = Math.max(
      1,
      Math.floor((expiresAt.getTime() - this.clock().getTime()) / 1000),
    );
    const payload: MailRetryPayload = {
      messageId: message.id,
      toEmail: message.toEmail,
      subject: message.subject,
      body: message.body,
    };
    await this.jobQueue.enqueue(tx, QueueName.MailOtpRetry, payload, {
      expireInSeconds,
      retryLimit: OTP_RETRY_LIMIT,
      retryDelay: OTP_RETRY_DELAY_SECONDS,
    });
  }

  /** Resends a message the queue worker is retrying, and records success. A thrown error lets pg-boss retry it. */
  async retrySend(payload: MailRetryPayload): Promise<void> {
    await this.provider.send({ to: payload.toEmail, subject: payload.subject, body: payload.body });
    await this.store.markSent(payload.messageId, this.clock());
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
    try {
      await this.provider.send({
        to: message.toEmail,
        subject: message.subject,
        body: message.body,
      });
      await this.store.markSent(message.id, this.clock());
    } catch (error) {
      const attempts = message.attempts + 1;
      const final = attempts >= MAX_MAIL_ATTEMPTS;
      const wait = RETRY_WAIT_MINUTES[attempts - 1] ?? 60;
      const nextAttemptAt = final ? null : new Date(this.clock().getTime() + wait * MINUTE_MS);
      await this.store.markFailed(message.id, {
        error: this.describe(error),
        attempts,
        nextAttemptAt,
      });
      if (final) {
        // Operator alert, as a log line until alerting exists: a message was given up on.
        console.error(
          `[mail] message ${String(message.id)} failed permanently: ${this.describe(error)}`,
        );
      }
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
