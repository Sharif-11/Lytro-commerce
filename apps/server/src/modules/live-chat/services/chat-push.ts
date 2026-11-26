import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PushProvider } from '../../notifications/ports/push-provider';
import { PushSender } from '../../notifications/services/push-sender';
import { PUSH_PROVIDER } from '../../notifications/tokens';
import type { ChatStore } from '../ports/chat-store';
import { CHAT_CLOCK, CHAT_STORE } from '../tokens';

// A browser that refused this many pushes in a row is forgotten, as the shops' own are (NTF-02).
const FAILURES_BEFORE_REMOVAL = 5;
const PREVIEW_MAX = 120;

/** A push's words: the message's first line, or a photo's mark when it carries only photos. */
export function pushPreview(body: string, photos: number): string {
  const text = body.replace(/\s+/g, ' ').trim();
  if (text.length > 0)
    return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text;
  return photos > 0 ? '📷' : '';
}

/**
 * LC-4, LC-13: a push for a chat whose page is closed -- to each of the shop's people when Lytro answers (the shops' own
 * web push, NTF-02), and to each of Lytro's people's browsers when a shop writes. Never holds a message up: a push that
 * can't go now is logged and dropped.
 */
@Injectable()
export class ChatPush {
  private readonly logger = new Logger('ChatPush');

  constructor(
    @Inject(CHAT_STORE) private readonly store: ChatStore,
    @Inject(CHAT_CLOCK) private readonly clock: () => Date,
    @Inject(PushSender) private readonly shops: Pick<PushSender, 'chat'>,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
  ) {}

  /** Lytro answered: each of the shop's people's browsers. */
  async toShop(tenantId: string, preview: string): Promise<void> {
    try {
      const people = await this.store.people(tenantId);
      for (const person of people) await this.shops.chat(tenantId, person.id, preview);
    } catch (error) {
      this.logger.warn(`a chat push to a shop failed: ${(error as Error).message}`);
    }
  }

  /** A shop wrote: every browser any of Lytro's people turned notifications on in. */
  async toLytro(shopName: string, preview: string, tenantId: string): Promise<void> {
    if (this.provider.publicKey === null) return;
    try {
      const subscriptions = await this.store.operatorSubscriptions(null);
      for (const subscription of subscriptions) {
        let outcome: 'sent' | 'gone' | 'refused' | null;
        try {
          outcome = await this.provider.send(
            {
              endpoint: subscription.endpoint,
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
            {
              title: shopName,
              body: preview,
              url: `/chats/${tenantId}`,
              tag: `chat-${tenantId}`,
              id: null,
            },
            { urgency: 'high', ttlSeconds: 6 * 60 * 60 },
          );
        } catch (error) {
          this.logger.warn(`a chat push could not be sent: ${(error as Error).message}`);
          outcome = null;
        }
        if (outcome === 'sent') await this.store.operatorPushed(subscription.id, this.clock());
        else if (outcome !== null) {
          await this.store.operatorPushFailed(
            subscription.id,
            outcome === 'gone' || subscription.failures + 1 >= FAILURES_BEFORE_REMOVAL,
          );
        }
      }
    } catch (error) {
      this.logger.warn(`a chat push to Lytro failed: ${(error as Error).message}`);
    }
  }
}
