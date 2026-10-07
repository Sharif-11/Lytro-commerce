import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { ChallengeKind, QueueName, SmsKind } from '@lytronix/validators';
import { MINUTE_MS } from '../../../../common/time';
import { SmsDeliveryError } from '../../../../common/errors/sms-delivery';
import type { JobQueue } from '../../queue/ports/job-queue';
import { JOB_QUEUE } from '../../queue/tokens';
import { MESSAGE_STORE, MESSAGING_CLOCK, SMS_PROVIDER } from '../tokens';
import type { MessageStore } from '../ports/message-store';
import type { SmsProvider } from '../ports/sms-provider';
import type { ClaimedMessage, QueuedMessage, SmsRetryPayload } from '../types/messages';

// SMS-18, D6, AUTH-05.

/** Wait after the first, second, third and fourth failed attempt. A fifth failure is final. */
export const RETRY_WAIT_MINUTES = [1, 5, 15, 60];
export const MAX_SMS_ATTEMPTS = 5;
const LEASE_MS = 2 * MINUTE_MS;

// D27: a bounded pg-boss retry for an OTP's failed synchronous send, while the code is still usable.
export const OTP_RETRY_LIMIT = 2;
export const OTP_RETRY_DELAY_SECONDS = 20;

@Injectable()
export class MessagingService {
  constructor(
    @Inject(MESSAGE_STORE) private readonly store: MessageStore,
    @Inject(SMS_PROVIDER) private readonly provider: SmsProvider,
    @Inject(MESSAGING_CLOCK) private readonly clock: () => Date,
    @Inject(JOB_QUEUE) private readonly jobQueue: JobQueue,
  ) {}

  async queueOtp(
    tx: Transaction,
    phone: string,
    code: string,
    purpose: ChallengeKind,
  ): Promise<QueuedMessage> {
    const body =
      purpose === ChallengeKind.Reset
        ? `Your password reset code is ${code}. It expires in 5 minutes. Do not share it.`
        : `Your verification code is ${code}. It expires in 5 minutes. Do not share it.`;
    const id = await this.store.insert(tx, { toPhone: phone, kind: SmsKind.Otp, body: null });
    return { id, toPhone: phone, body };
  }

  async queueShopReady(tx: Transaction, phone: string, liveUrl: string): Promise<QueuedMessage> {
    const body = `Your shop is ready: ${liveUrl}`;
    const id = await this.store.insert(tx, { toPhone: phone, kind: SmsKind.ShopReady, body });
    return { id, toPhone: phone, body };
  }

  /** Sends a one-time code during its request. A failure is recorded, then reported, since no code arrived. */
  async deliverOtp(message: QueuedMessage): Promise<void> {
    try {
      await this.provider.send({ toPhone: message.toPhone, body: message.body });
      await this.store.markSent(message.id, this.clock());
    } catch (error) {
      await this.store.markFailed(message.id, {
        error: this.describe(error),
        attempts: 1,
        nextAttemptAt: null,
      });
      throw new SmsDeliveryError();
    }
  }

  /**
   * Queues a bounded retry for an OTP's failed synchronous send, while the code can still be used (D27).
   * `expiresAt` is the code's own expiry; the job is bounded to whatever is left of it, so pg-boss drops it
   * once that window passes rather than resending a code that no longer works.
   */
  async queueOtpRetry(tx: Transaction, message: QueuedMessage, expiresAt: Date): Promise<void> {
    const expireInSeconds = Math.max(
      1,
      Math.floor((expiresAt.getTime() - this.clock().getTime()) / 1000),
    );
    const payload: SmsRetryPayload = {
      messageId: message.id,
      toPhone: message.toPhone,
      body: message.body,
    };
    await this.jobQueue.enqueue(tx, QueueName.OtpRetry, payload, {
      expireInSeconds,
      retryLimit: OTP_RETRY_LIMIT,
      retryDelay: OTP_RETRY_DELAY_SECONDS,
    });
  }

  /** Resends a message the queue worker is retrying, and records success. A thrown error lets pg-boss retry it. */
  async retrySend(payload: SmsRetryPayload): Promise<void> {
    await this.provider.send({ toPhone: payload.toPhone, body: payload.body });
    await this.store.markSent(payload.messageId, this.clock());
  }

  /** Tries to send messages whose transaction has committed. */
  async dispatch(messages: readonly QueuedMessage[]): Promise<void> {
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
          `[sms] could not dispatch message ${String(message.id)}: ${this.describe(error)}`,
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

  private async sendClaimed(message: ClaimedMessage): Promise<void> {
    try {
      await this.provider.send({ toPhone: message.toPhone, body: message.body });
      await this.store.markSent(message.id, this.clock());
    } catch (error) {
      const attempts = message.attempts + 1;
      const final = attempts >= MAX_SMS_ATTEMPTS;
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
          `[sms] message ${String(message.id)} failed permanently: ${this.describe(error)}`,
        );
      }
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
