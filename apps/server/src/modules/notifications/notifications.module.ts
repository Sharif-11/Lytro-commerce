import { Module } from '@nestjs/common';
import type { Env } from '../../config/env';
import { ENV } from '../../config/tokens';
import { DrizzleNotificationStore } from '../../database/adapters/notifications.adapter';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { MailModule } from '../shared/mail/mail.module';
import { QueueModule } from '../shared/queue/queue.module';
import { StaffModule } from '../staff/staff.module';
import { ResendWebhookController } from './controllers/resend-webhook.controller';
import {
  BellBatchExpiryNotifier,
  BellCourierNotifier,
  BellLowStockNotifier,
  BellMediaNotifier,
  BellOrderNotifier,
  BellPaymentMethodNotifier,
  BellPaymentNotifier,
} from './notifiers/bell-notifiers';
import { OutsideCalls } from '../shared/outside-calls/services/outside-calls';
import { pushProviderFor } from './providers/push-provider-choice';
import type { PushFetch } from './providers/web-push.provider';
import { AccountNotices } from './services/account-notices';
import { BounceNotices } from './services/bounce-notices';
import { NotificationPurge } from './services/notification-purge';
import { NotificationSubscriptions } from './services/notification-subscriptions';
import { Notifications } from './services/notifications';
import { PushSender } from './services/push-sender';
import { NOTIFICATION_STORE, NOTIFICATIONS_CLOCK, PUSH_FETCH, PUSH_PROVIDER } from './tokens';

const NOTIFIERS = [
  BellOrderNotifier,
  BellPaymentNotifier,
  BellCourierNotifier,
  BellLowStockNotifier,
  BellBatchExpiryNotifier,
  BellMediaNotifier,
  BellPaymentMethodNotifier,
];

// NTF-01 to NTF-06 (Phase 7 Slice 7.3): the bell, push and the account's notices. A leaf: it imports only the queue, mail,
// staff and settings modules, so every module that tells its people -- orders, payments, couriers, stock, media, billing,
// balance, usage -- can import it with no cycle, and binds its own notifier token to one of the notifiers here.
// D7-22: the push provider follows the server's mode -- recorded in tests, logged in development unless forced, sent
// in production.
@Module({
  imports: [QueueModule, MailModule, StaffModule, PlatformSettingsModule],
  controllers: [ResendWebhookController],
  providers: [
    { provide: NOTIFICATION_STORE, useClass: DrizzleNotificationStore },
    {
      provide: PUSH_FETCH,
      useValue: ((input, init) => fetch(input, init)) satisfies PushFetch,
    },
    {
      provide: PUSH_PROVIDER,
      inject: [ENV, PUSH_FETCH, OutsideCalls],
      useFactory: (env: Env, fetchPush: PushFetch, outside: OutsideCalls) =>
        pushProviderFor(env, fetchPush, outside.breaker('web-push')),
    },
    { provide: NOTIFICATIONS_CLOCK, useValue: (): Date => new Date() },
    Notifications,
    PushSender,
    AccountNotices,
    BounceNotices,
    NotificationPurge,
    NotificationSubscriptions,
    ...NOTIFIERS,
  ],
  exports: [
    Notifications,
    PushSender,
    AccountNotices,
    NotificationPurge,
    NotificationSubscriptions,
    ...NOTIFIERS,
  ],
})
export class NotificationsModule {}
