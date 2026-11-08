import type { NotificationKind } from '@lytronix/validators';

// Mirrors the bell's and push's answers (apps/server/src/modules/team/dto/notifications.dto.ts, Phase 7 Slice 7.3).

/** One row of the bell, in the reader's language (NTF-01). */
export interface NotificationView {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** A path within the shop (/orders/<id>); the dashboard puts the slug in front. */
  link: string | null;
  createdAt: string;
  read: boolean;
}

export interface NotificationPage {
  items: NotificationView[];
  unread: number;
  /** The `before` of the next page, or null. */
  next: string | null;
}

export type NotificationGroup = 'orders' | 'payments' | 'couriers' | 'stock' | 'media' | 'account';

/** NTF-04, D7-40: a kind the person hears, its switch, and whether it is locked on. */
export interface NotificationSwitch {
  kind: NotificationKind;
  group: NotificationGroup;
  on: boolean;
  locked: boolean;
}

/** NTF-02: what a test push did. */
export interface PushTestResult {
  sent: number;
  gone: number;
  failed: number;
}
