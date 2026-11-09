import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationKind, type Language } from '@lytronix/validators';
import { inLanguage } from '../../../common/i18n/bilingual';
import { PUSH_TEST_TEXT } from '../notification-words';
import type { NotificationStore } from '../ports/notification-store';
import type {
  PushMessage,
  PushOptions,
  PushOutcome,
  PushProvider,
  PushTarget,
} from '../ports/push-provider';
import { NOTIFICATION_STORE, NOTIFICATIONS_CLOCK, PUSH_PROVIDER } from '../tokens';
import type { NotificationPushJob } from './notifications';

/** A subscription that failed this many pushes in a row is given up on and deleted. */
export const PUSH_FAILURES_BEFORE_REMOVAL = 10;
// A push still worth showing a day late; after that the bell has it.
const TTL_SECONDS = 24 * 60 * 60;
// The notices someone is waiting on are pushed at once; the rest may wait for a phone to wake (RFC 8030's urgency).
const URGENT: ReadonlySet<NotificationKind> = new Set([
  NotificationKind.OrderPlaced,
  NotificationKind.PaymentToVerify,
  NotificationKind.MoneyForClosedOrder,
]);

export interface PushResult {
  sent: number;
  gone: number;
  failed: number;
}

/**
 * NTF-02 (Phase 7 Slice 7.3): pushes one notification to every browser its person subscribed, in the language they chose
 * (Bangla until they choose). A browser the push service says is gone is deleted. A push that fails is counted against
 * its browser and not tried again: the bell already has the notice, and trying again could push it twice to the
 * browsers that took it.
 */
@Injectable()
export class PushSender {
  private readonly logger = new Logger('PushSender');

  constructor(
    @Inject(NOTIFICATION_STORE) private readonly store: NotificationStore,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
    @Inject(NOTIFICATIONS_CLOCK) private readonly clock: () => Date,
  ) {}

  /** The key a browser subscribes with; null when push isn't set up. */
  get publicKey(): string | null {
    return this.provider.publicKey;
  }

  async send(job: NotificationPushJob): Promise<PushResult> {
    const found = await this.store.run(job.tenantId, (tx) =>
      this.store.findForPush(tx, job.tenantId, job.notificationId),
    );
    // Deleted by the nightly clean-up, or with its person, before its push went.
    if (!found) return { sent: 0, gone: 0, failed: 0 };
    const { notification, language } = found;
    const words = inLanguage(notification.words, language);
    const slug = await this.store.slugOf(job.tenantId);
    return this.pushTo(job.tenantId, notification.userId, {
      message: {
        title: words.title,
        body: words.body,
        url: this.urlOf(slug, notification.link),
        // NTF-02: its own, so a second new order doesn't silently replace the first on the phone.
        tag: notification.id,
        id: notification.id,
      },
      options: {
        urgency: URGENT.has(notification.kind) ? 'high' : 'normal',
        ttlSeconds: TTL_SECONDS,
      },
    });
  }

  /** NTF-02: the test a person sends themselves, to each browser they subscribed. Not kept in the bell. */
  async test(tenantId: string, userId: string, language: Language): Promise<PushResult> {
    const slug = await this.store.slugOf(tenantId);
    const words = inLanguage(PUSH_TEST_TEXT, language);
    return this.pushTo(tenantId, userId, {
      message: {
        title: words.title,
        body: words.body,
        url: this.urlOf(slug, null),
        tag: 'test',
        id: null,
      },
      options: { urgency: 'normal', ttlSeconds: 60 * 60 },
    });
  }

  private async pushTo(
    tenantId: string,
    userId: string,
    push: { message: PushMessage; options: PushOptions },
  ): Promise<PushResult> {
    const subscriptions = await this.store.run(tenantId, (tx) =>
      this.store.subscriptionsOf(tx, tenantId, userId),
    );
    const result: PushResult = { sent: 0, gone: 0, failed: 0 };
    for (const subscription of subscriptions) {
      const target: PushTarget = {
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      };
      let answer: PushOutcome | null;
      try {
        answer = await this.provider.send(target, push.message, push.options);
      } catch (error) {
        this.logger.warn(`a push could not be sent: ${(error as Error).message}`);
        answer = null;
      }
      // The push service having a bad moment says nothing about this browser, so it counts for nothing against it.
      if (answer !== null) {
        const heard = answer;
        await this.store.run(tenantId, async (tx) => {
          if (heard === 'sent') {
            await this.store.markPushed(tx, tenantId, subscription.id, this.clock());
          } else if (
            heard === 'gone' ||
            subscription.failures + 1 >= PUSH_FAILURES_BEFORE_REMOVAL
          ) {
            await this.store.removeSubscriptionById(tx, tenantId, subscription.id);
          } else {
            await this.store.markPushFailure(tx, tenantId, subscription.id);
          }
        });
      }
      result[answer === 'sent' || answer === 'gone' ? answer : 'failed'] += 1;
    }
    return result;
  }

  /** The dashboard's path for the notice, inside the shop: `/<slug>/orders/<id>`, or the shop's home. */
  private urlOf(slug: string | null, link: string | null): string {
    if (slug === null) return '/';
    return `/${slug}${link ?? ''}`;
  }
}
