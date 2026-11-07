import { Inject, Injectable } from '@nestjs/common';
import {
  NotificationRepository,
  PushSubscriptionRepository,
  TenantRepository,
  TransactionRunner,
  type NewNotification,
  type NewPushSubscription,
  type NotificationRecipient,
  type SelectNotification,
  type SelectPushSubscription,
  type Transaction,
} from '@lytronix/db';
import type { Language, NotificationKind } from '@lytronix/validators';
import type { NotificationStore } from '../../modules/notifications/ports/notification-store';
import { DatabaseService } from '../database.service';

/** NTF-01 to NTF-04: notifications, switches and push subscriptions, through their repositories. */
@Injectable()
export class DrizzleNotificationStore implements NotificationStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(NotificationRepository) private readonly notifications: NotificationRepository,
    @Inject(PushSubscriptionRepository) private readonly subscriptions: PushSubscriptionRepository,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
  ) {}

  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, async (tx) => {
      await this.transactions.setTenantContext(tx, tenantId);
      return work(tx);
    });
  }

  recipients(
    tx: Transaction,
    tenantId: string,
    input: { permission: string | null; kind: NotificationKind; switchable: boolean },
  ): Promise<NotificationRecipient[]> {
    return this.notifications.recipients(tx, tenantId, input);
  }

  ownerUserId(tx: Transaction, tenantId: string): Promise<string | null> {
    return this.notifications.ownerUserId(tx, tenantId);
  }

  insertMany(
    tx: Transaction,
    tenantId: string,
    rows: readonly NewNotification[],
  ): Promise<{ id: string; userId: string }[]> {
    return this.notifications.insertMany(tx, tenantId, rows);
  }

  list(
    tx: Transaction,
    tenantId: string,
    userId: string,
    page: { limit: number; before?: string | undefined },
  ): Promise<SelectNotification[]> {
    return this.notifications.list(tx, tenantId, userId, page);
  }

  unreadCount(tx: Transaction, tenantId: string, userId: string): Promise<number> {
    return this.notifications.unreadCount(tx, tenantId, userId);
  }

  markRead(
    tx: Transaction,
    tenantId: string,
    userId: string,
    which: readonly string[] | 'all',
    at: Date,
  ): Promise<number> {
    return this.notifications.markRead(tx, tenantId, userId, which, at);
  }

  findForPush(
    tx: Transaction,
    tenantId: string,
    id: string,
  ): Promise<{ notification: SelectNotification; language: Language | null } | null> {
    return this.notifications.findForPush(tx, tenantId, id);
  }

  purgeBefore(tx: Transaction, tenantId: string, before: Date): Promise<number> {
    return this.notifications.purgeBefore(tx, tenantId, before);
  }

  offKinds(tx: Transaction, tenantId: string, userId: string): Promise<NotificationKind[]> {
    return this.notifications.offKinds(tx, tenantId, userId);
  }

  setOff(
    tx: Transaction,
    tenantId: string,
    userId: string,
    kinds: readonly NotificationKind[],
  ): Promise<void> {
    return this.notifications.setOff(tx, tenantId, userId, kinds);
  }

  listShopIds(): Promise<string[]> {
    return this.tenants.listLiveIds(this.database.handle.db);
  }

  async slugOf(tenantId: string): Promise<string | null> {
    return (await this.tenants.findSummaryById(this.database.handle.db, tenantId))?.slug ?? null;
  }

  shopsOwnedByEmail(email: string): Promise<string[]> {
    return this.notifications.shopsOwnedByEmail(this.database.handle.db, email);
  }

  upsertSubscription(tx: Transaction, row: NewPushSubscription): Promise<void> {
    return this.subscriptions.upsert(tx, row);
  }

  removeSubscription(
    tx: Transaction,
    tenantId: string,
    userId: string,
    endpoint: string,
  ): Promise<boolean> {
    return this.subscriptions.remove(tx, tenantId, userId, endpoint);
  }

  subscriptionsOf(
    tx: Transaction,
    tenantId: string,
    userId: string,
  ): Promise<SelectPushSubscription[]> {
    return this.subscriptions.listForUser(tx, tenantId, userId);
  }

  removeSubscriptionById(tx: Transaction, tenantId: string, id: string): Promise<void> {
    return this.subscriptions.removeById(tx, tenantId, id);
  }

  markPushed(tx: Transaction, tenantId: string, id: string, at: Date): Promise<void> {
    return this.subscriptions.markPushed(tx, tenantId, id, at);
  }

  markPushFailure(tx: Transaction, tenantId: string, id: string): Promise<void> {
    return this.subscriptions.markFailure(tx, tenantId, id);
  }
}
