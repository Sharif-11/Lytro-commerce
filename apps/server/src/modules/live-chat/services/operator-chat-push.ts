import { Inject, Injectable } from '@nestjs/common';
import type { PushSubscriptionInput } from '@lytronix/validators';
import type { PushProvider } from '../../notifications/ports/push-provider';
import { PUSH_PROVIDER } from '../../notifications/tokens';
import type { ChatStore } from '../ports/chat-store';
import { CHAT_STORE } from '../tokens';

/** LC-4: an operator's own browsers, for a chat push while the console is closed. The same VAPID keys as the shops'. */
@Injectable()
export class OperatorChatPush {
  constructor(
    @Inject(CHAT_STORE) private readonly store: ChatStore,
    @Inject(PUSH_PROVIDER) private readonly provider: Pick<PushProvider, 'publicKey'>,
  ) {}

  get publicKey(): string | null {
    return this.provider.publicKey;
  }

  async subscribe(operatorId: string, input: PushSubscriptionInput): Promise<void> {
    await this.store.upsertOperatorSubscription({
      operatorId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    });
  }

  async holds(operatorId: string, endpoint: string): Promise<boolean> {
    const mine = await this.store.operatorSubscriptions(operatorId);
    return mine.some((each) => each.endpoint === endpoint);
  }

  async unsubscribe(operatorId: string, endpoint: string): Promise<void> {
    await this.store.removeOperatorSubscription(operatorId, endpoint);
  }
}
