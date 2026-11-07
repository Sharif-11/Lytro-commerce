import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SelectNotification, Transaction } from '@lytronix/db';
import {
  NOTIFICATION_KINDS,
  NotificationKind,
  QueueName,
  type Language,
  type NotificationGroup,
  type NotificationPreferencesInput,
  type NotificationsQuery,
  type NotificationsReadInput,
  type Permission,
} from '@lytronix/validators';
import { JOB_QUEUE } from '../../shared/queue/tokens';
import type { JobQueue } from '../../shared/queue/ports/job-queue';
import type { NotificationText } from '../notification-words';
import type { NotificationStore } from '../ports/notification-store';
import { NOTIFICATION_STORE, NOTIFICATIONS_CLOCK } from '../tokens';

/** One notice, before it is written for each person who hears it. */
export interface NotificationNotice {
  tenantId: string;
  kind: NotificationKind;
  text: NotificationText;
  link: string | null;
}

/** NTF-02: one notification's push, queued with its row. */
export interface NotificationPushJob {
  tenantId: string;
  notificationId: string;
}

/** A notification as the bell shows it, in the reader's language. */
export interface NotificationView {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  createdAt: Date;
  read: boolean;
}

export interface NotificationPage {
  items: NotificationView[];
  unread: number;
  /** The `before` for the next page; null on the last. */
  next: string | null;
}

/** NTF-04: one kind on the switches page. */
export interface NotificationSwitch {
  kind: NotificationKind;
  group: NotificationGroup;
  on: boolean;
  locked: boolean;
}

/** Who the viewer is in the shop: their row, and the permissions they hold ('all' for the owner). */
export interface NotificationViewer {
  userId: string;
  permissions: readonly Permission[] | 'all';
}

/**
 * NTF-01, NTF-03, NTF-04 (Phase 7 Slice 7.3, read agreed 2026-11-07): the one way a notice reaches a shop's people. It is
 * written once for each person who hears its kind (the owner, and the holders of its permission), less those who switched
 * it off when it may be, with its words in both languages; each row's push is queued in the same transaction. The bell
 * reads the rows, so a push is never the only copy.
 */
@Injectable()
export class Notifications {
  private readonly logger = new Logger('Notifications');

  constructor(
    @Inject(NOTIFICATION_STORE) private readonly store: NotificationStore,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    @Inject(NOTIFICATIONS_CLOCK) private readonly clock: () => Date,
  ) {}

  /** In its own transaction, for a notifier called after its change has committed. Never throws. */
  async notify(notice: NotificationNotice): Promise<number> {
    try {
      return await this.store.run(notice.tenantId, (tx) => this.notifyWithin(tx, notice));
    } catch (error) {
      this.logger.error(`a ${notice.kind} notification could not be written`, error as Error);
      return 0;
    }
  }

  /** In the caller's transaction, so the notice commits with the change that caused it, or not at all. */
  async notifyWithin(tx: Transaction, notice: NotificationNotice): Promise<number> {
    const definition = NOTIFICATION_KINDS[notice.kind];
    const recipients = await this.store.recipients(tx, notice.tenantId, {
      permission: definition.audience === 'owner' ? null : definition.audience,
      kind: notice.kind,
      switchable: definition.switchable,
    });
    const rows = await this.store.insertMany(
      tx,
      notice.tenantId,
      recipients.map((recipient) => ({
        tenantId: notice.tenantId,
        userId: recipient.userId,
        kind: notice.kind,
        words: notice.text,
        link: notice.link,
      })),
    );
    for (const row of rows) {
      const job: NotificationPushJob = { tenantId: notice.tenantId, notificationId: row.id };
      await this.jobs.enqueue(tx, QueueName.NotificationPush, job, { singletonKey: row.id });
    }
    return rows.length;
  }

  /** The viewer's row: a staff session's own, or the owner's for an owner's session, which names none. */
  async viewerId(tenantId: string, sessionUserId: string | null): Promise<string | null> {
    if (sessionUserId !== null) return sessionUserId;
    return this.store.run(tenantId, (tx) => this.store.ownerUserId(tx, tenantId));
  }

  /** NTF-01: a page of the viewer's notifications, in the language they read in, with the badge's count. */
  list(
    tenantId: string,
    userId: string,
    query: NotificationsQuery,
    language: Language,
  ): Promise<NotificationPage> {
    return this.store.run(tenantId, async (tx) => {
      const rows = await this.store.list(tx, tenantId, userId, {
        limit: query.limit,
        before: query.before,
      });
      const unread = await this.store.unreadCount(tx, tenantId, userId);
      const last = rows.length === query.limit ? rows[rows.length - 1] : undefined;
      return {
        items: rows.map((row) => this.viewOf(row, language)),
        unread,
        next: last?.id ?? null,
      };
    });
  }

  /** NTF-01: marks the viewer's own notifications read. How many changed, and how many are left. */
  markRead(
    tenantId: string,
    userId: string,
    input: NotificationsReadInput,
  ): Promise<{ marked: number; unread: number }> {
    return this.store.run(tenantId, async (tx) => {
      const which = input.all === true ? 'all' : (input.notificationIds ?? []);
      const marked = await this.store.markRead(tx, tenantId, userId, which, this.clock());
      const unread = await this.store.unreadCount(tx, tenantId, userId);
      return { marked, unread };
    });
  }

  /** NTF-04: the kinds the viewer can hear, each on or off, the money and account ones locked on. */
  preferences(tenantId: string, viewer: NotificationViewer): Promise<NotificationSwitch[]> {
    return this.store.run(tenantId, async (tx) => {
      const off = new Set(await this.store.offKinds(tx, tenantId, viewer.userId));
      return this.kindsFor(viewer).map((kind) => {
        const definition = NOTIFICATION_KINDS[kind];
        return {
          kind,
          group: definition.group,
          on: !definition.switchable || !off.has(kind),
          locked: !definition.switchable,
        };
      });
    });
  }

  /** NTF-04: the whole list of kinds the viewer switches off. A locked kind never gets here (the request refuses it). */
  async setPreferences(
    tenantId: string,
    viewer: NotificationViewer,
    input: NotificationPreferencesInput,
  ): Promise<NotificationSwitch[]> {
    const off = input.off.filter((kind) => NOTIFICATION_KINDS[kind].switchable);
    await this.store.run(tenantId, (tx) => this.store.setOff(tx, tenantId, viewer.userId, off));
    return this.preferences(tenantId, viewer);
  }

  /** The kinds a viewer hears: every kind for the owner; for staff, those whose permission they hold. */
  private kindsFor(viewer: NotificationViewer): NotificationKind[] {
    return Object.values(NotificationKind).filter((kind) => {
      const audience = NOTIFICATION_KINDS[kind].audience;
      if (viewer.permissions === 'all') return true;
      return audience !== 'owner' && viewer.permissions.includes(audience);
    });
  }

  private viewOf(row: SelectNotification, language: Language): NotificationView {
    const words = row.words[language];
    return {
      id: row.id,
      kind: row.kind,
      title: words.title,
      body: words.body,
      link: row.link,
      createdAt: row.createdAt,
      read: row.readAt !== null,
    };
  }
}
