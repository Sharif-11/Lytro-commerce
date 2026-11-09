import type {
  NewNotification,
  NewPushSubscription,
  NotificationRecipient,
  SelectNotification,
  SelectPushSubscription,
  Transaction,
} from '@lytronix/db';
import type { Language, NotificationKind } from '@lytronix/validators';

/**
 * NTF-01 to NTF-04 (Phase 7 Slice 7.3): each person's notifications, the kinds they switched off and their browsers'
 * push subscriptions. Every method that takes a transaction runs inside the shop it names. Implemented in
 * database/adapters.
 */
export interface NotificationStore {
  /** Runs the work in a transaction with the shop's context set. */
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  recipients(
    tx: Transaction,
    tenantId: string,
    input: { permission: string | null; kind: NotificationKind; switchable: boolean },
  ): Promise<NotificationRecipient[]>;
  ownerUserId(tx: Transaction, tenantId: string): Promise<string | null>;
  insertMany(
    tx: Transaction,
    tenantId: string,
    rows: readonly NewNotification[],
  ): Promise<{ id: string; userId: string }[]>;
  list(
    tx: Transaction,
    tenantId: string,
    userId: string,
    page: { limit: number; before?: string | undefined },
  ): Promise<SelectNotification[]>;
  unreadCount(tx: Transaction, tenantId: string, userId: string): Promise<number>;
  markRead(
    tx: Transaction,
    tenantId: string,
    userId: string,
    which: readonly string[] | 'all',
    at: Date,
  ): Promise<number>;
  findForPush(
    tx: Transaction,
    tenantId: string,
    id: string,
  ): Promise<{ notification: SelectNotification; language: Language | null } | null>;
  purgeBefore(tx: Transaction, tenantId: string, before: Date): Promise<number>;
  offKinds(tx: Transaction, tenantId: string, userId: string): Promise<NotificationKind[]>;
  setOff(
    tx: Transaction,
    tenantId: string,
    userId: string,
    kinds: readonly NotificationKind[],
  ): Promise<void>;
  /** Every live shop, for the nightly clean-up. */
  listShopIds(): Promise<string[]>;
  /** The shop's address, which a push's link starts with. */
  slugOf(tenantId: string): Promise<string | null>;
  /** NTF-06: the live shops whose owner signs in with this email. */
  shopsOwnedByEmail(email: string): Promise<string[]>;
  upsertSubscription(tx: Transaction, row: NewPushSubscription): Promise<void>;
  removeSubscription(
    tx: Transaction,
    tenantId: string,
    userId: string,
    endpoint: string,
  ): Promise<boolean>;
  /** NTF-02: whether this browser is subscribed for this person in this shop. */
  holdsSubscription(
    tx: Transaction,
    tenantId: string,
    userId: string,
    endpoint: string,
  ): Promise<boolean>;
  subscriptionsOf(
    tx: Transaction,
    tenantId: string,
    userId: string,
  ): Promise<SelectPushSubscription[]>;
  removeSubscriptionById(tx: Transaction, tenantId: string, id: string): Promise<void>;
  markPushed(tx: Transaction, tenantId: string, id: string, at: Date): Promise<void>;
  markPushFailure(tx: Transaction, tenantId: string, id: string): Promise<void>;
}
