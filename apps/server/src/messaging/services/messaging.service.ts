import { Inject, Injectable } from '@nestjs/common';
import type { Executor, Transaction } from '@lytronix/db';
import { SmsDeliveryError } from '../../common/errors/sms-delivery';
import { MESSAGE_STORE, MESSAGING_CLOCK, SMS_PROVIDER } from '../tokens';

// SMS-18, D6, AUTH-05. Messages are recorded in the same transaction as the change that caused them.
// A shop-ready message that cannot be sent is kept and retried; it never fails the request that created the shop.
// A one-time code is sent during its request, its text is never stored, and a failure is reported to the caller.

export type MessageKind = 'otp' | 'shop_ready';

/** A recorded message. For an OTP, the body exists only in memory for the send that follows the request. */
export interface QueuedMessage {
  id: number;
  toPhone: string;
  body: string;
}

export interface ClaimedMessage {
  id: number;
  toPhone: string;
  body: string;
  attempts: number;
}

/** Wait after the first, second, third and fourth failed attempt. A fifth failure is final. */
export const RETRY_WAIT_MINUTES = [1, 5, 15, 60];
export const MAX_SMS_ATTEMPTS = 5;
const LEASE_MS = 2 * 60 * 1000;

export interface MessageStore {
  insert(
    executor: Executor,
    message: { toPhone: string; kind: MessageKind; body: string | null },
  ): Promise<number>;
  claimDue(input: {
    now: Date;
    leaseUntil: Date;
    limit: number;
    onlyId?: number;
  }): Promise<ClaimedMessage[]>;
  markSent(id: number, at: Date): Promise<void>;
  markFailed(
    id: number,
    input: { error: string; attempts: number; nextAttemptAt: Date | null },
  ): Promise<void>;
}

export interface SmsProvider {
  send(message: { toPhone: string; body: string }): Promise<void>;
}

@Injectable()
export class MessagingService {
  constructor(
    @Inject(MESSAGE_STORE) private readonly store: MessageStore,
    @Inject(SMS_PROVIDER) private readonly provider: SmsProvider,
    @Inject(MESSAGING_CLOCK) private readonly clock: () => Date,
  ) {}

  async queueOtp(tx: Transaction, phone: string, code: string): Promise<QueuedMessage> {
    const body = `Your verification code is ${code}. It expires in 5 minutes. Do not share it.`;
    const id = await this.store.insert(tx, { toPhone: phone, kind: 'otp', body: null });
    return { id, toPhone: phone, body };
  }

  async queueShopReady(tx: Transaction, phone: string, liveUrl: string): Promise<QueuedMessage> {
    const body = `Your shop is ready: ${liveUrl}`;
    const id = await this.store.insert(tx, { toPhone: phone, kind: 'shop_ready', body });
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
   * Tries to send messages whose transaction has committed. Never throws: a failure stays in the outbox for the
   * retry worker, so the request that caused the message still succeeds.
   */
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
      const nextAttemptAt = final ? null : new Date(this.clock().getTime() + wait * 60_000);
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
