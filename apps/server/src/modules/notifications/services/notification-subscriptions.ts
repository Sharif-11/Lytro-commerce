import { Inject, Injectable } from '@nestjs/common';
import type { PushSubscriptionInput } from '@lytronix/validators';
import type { NotificationStore } from '../ports/notification-store';
import { NOTIFICATION_STORE } from '../tokens';

const USER_AGENT_MAX = 300;

/**
 * NTF-02 (Phase 7 Slice 7.3): a person's browsers subscribed to push. Subscribing a browser again takes its new keys;
 * unsubscribing one it never had changes nothing.
 */
@Injectable()
export class NotificationSubscriptions {
  constructor(@Inject(NOTIFICATION_STORE) private readonly store: NotificationStore) {}

  subscribe(
    tenantId: string,
    userId: string,
    input: PushSubscriptionInput,
    userAgent: string | null,
  ): Promise<void> {
    return this.store.run(tenantId, (tx) =>
      this.store.upsertSubscription(tx, {
        tenantId,
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: userAgent === null ? null : userAgent.slice(0, USER_AGENT_MAX),
      }),
    );
  }

  /** NTF-02: whether that browser is subscribed for this person in this shop, whoever else's it has been. */
  holds(tenantId: string, userId: string, endpoint: string): Promise<boolean> {
    return this.store.run(tenantId, (tx) =>
      this.store.holdsSubscription(tx, tenantId, userId, endpoint),
    );
  }

  /** Whether that browser was subscribed. */
  unsubscribe(tenantId: string, userId: string, endpoint: string): Promise<boolean> {
    return this.store.run(tenantId, (tx) =>
      this.store.removeSubscription(tx, tenantId, userId, endpoint),
    );
  }
}
