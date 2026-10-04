import { Inject, Injectable } from '@nestjs/common';
import type { Executor, Transaction } from '@lytronix/db';
import { MESSAGE_STORE, SMS_PROVIDER } from '../tokens';

// SMS-18, D6: messages are recorded in the same transaction as the change that caused them, then sent after
// commit. A message is never sent for a change that rolled back.
export type OutboundMessage = { toPhone: string; kind: 'otp' | 'shop_ready'; body: string };

export interface MessageStore {
  insert(executor: Executor, message: OutboundMessage): Promise<void>;
}

export interface SmsProvider {
  send(message: OutboundMessage): Promise<void>;
}

@Injectable()
export class MessagingService {
  constructor(
    @Inject(MESSAGE_STORE) private readonly store: MessageStore,
    @Inject(SMS_PROVIDER) private readonly provider: SmsProvider,
  ) {}

  async queueOtp(tx: Transaction, phone: string, code: string): Promise<OutboundMessage> {
    const message: OutboundMessage = {
      toPhone: phone,
      kind: 'otp',
      body: `Your verification code is ${code}. It expires in 5 minutes. Do not share it.`,
    };
    await this.store.insert(tx, message);
    return message;
  }

  async queueShopReady(tx: Transaction, phone: string, liveUrl: string): Promise<OutboundMessage> {
    const message: OutboundMessage = {
      toPhone: phone,
      kind: 'shop_ready',
      body: `Your shop is ready: ${liveUrl}`,
    };
    await this.store.insert(tx, message);
    return message;
  }

  /** Sends messages whose transaction has committed. */
  async dispatch(messages: readonly OutboundMessage[]): Promise<void> {
    for (const message of messages) {
      await this.provider.send(message);
    }
  }
}
