import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  NOTICE_BODY_MAX,
  NOTICE_TITLE_MAX,
  NoticeAudienceKind,
  NoticeCategory,
  NoticeSeverity,
  type NoticeAudience,
} from '@lytronix/validators';
import { control, createdAt } from '../shared';
import { users } from '../tenant/staff';
import { rateHistory } from './rates';
import { tenants } from './tenancy';

const listOf = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(','));

/** A notice as it stood before an edit replaced it (NTC-08), its times written as ISO strings. */
export interface NoticeSnapshot {
  titleBn: string | null;
  titleEn: string | null;
  bodyBn: string | null;
  bodyEn: string | null;
  category: NoticeCategory;
  severity: NoticeSeverity;
  audience: NoticeAudience;
  publishAt: string | null;
  endsAt: string | null;
  pinned: boolean;
  requiresAck: boolean;
  windowStartsAt: string | null;
  windowEndsAt: string | null;
  rateChangeId: number | null;
}

// NTC-01 to NTC-17 (Phase 7 Slice 7.4, read agreed 2026-11-07): Lytro's notices to shops, written by the operator. A
// title and body in each language (at least one language whole; the board falls back to it, NTC-15), the body in the
// few marks D7-53 allows and kept as typed. A notice with no publish time is a draft; one whose time has come is live
// until its end time or until it is withdrawn, which hides it from shops and keeps it here (NTC-08). Who it is for is
// read when a shop looks (NTC-02), so a shop that moves into the audience sees it.
export const notices = control.table(
  'notices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    titleBn: varchar('title_bn', { length: NOTICE_TITLE_MAX }),
    titleEn: varchar('title_en', { length: NOTICE_TITLE_MAX }),
    bodyBn: varchar('body_bn', { length: NOTICE_BODY_MAX }),
    bodyEn: varchar('body_en', { length: NOTICE_BODY_MAX }),
    category: text('category').$type<NoticeCategory>().notNull(),
    severity: text('severity').$type<NoticeSeverity>().notNull(),
    audience: jsonb('audience').$type<NoticeAudience>().notNull(),
    publishAt: timestamp('publish_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    pinned: boolean('pinned').notNull().default(false),
    // NTC-05: the owner must click "I understand".
    requiresAck: boolean('requires_ack').notNull().default(false),
    // NTC-14: a maintenance window the dashboard counts down to.
    windowStartsAt: timestamp('window_starts_at', { withTimezone: true }),
    windowEndsAt: timestamp('window_ends_at', { withTimezone: true }),
    // NTC-13: the rate change this notice tells of; publishing it writes the notice onto that change (RAT-09).
    rateChangeId: bigint('rate_change_id', { mode: 'number' }).references(() => rateHistory.id),
    createdBy: uuid('created_by').notNull(), // operator account id
    createdAt: createdAt(),
    // NTC-08: set by an edit made once the notice was live; the board marks it "updated".
    editedAt: timestamp('edited_at', { withTimezone: true }),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    withdrawnBy: uuid('withdrawn_by'),
    // NTC-06: when every shop in its audience had been told (bell, push, and email when important or urgent).
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    index('notices_publish_idx').on(t.publishAt),
    index('notices_due_idx')
      .on(t.publishAt)
      .where(sql`${t.sentAt} IS NULL AND ${t.withdrawnAt} IS NULL`),
    check(
      'notices_category_check',
      sql`${t.category} in (${listOf(Object.values(NoticeCategory))})`,
    ),
    check(
      'notices_severity_check',
      sql`${t.severity} in (${listOf(Object.values(NoticeSeverity))})`,
    ),
    check(
      'notices_audience_check',
      sql`${t.audience}->>'kind' in (${listOf(Object.values(NoticeAudienceKind))})`,
    ),
    check(
      'notices_language_check',
      sql`(${t.titleBn} IS NOT NULL AND ${t.bodyBn} IS NOT NULL) OR (${t.titleEn} IS NOT NULL AND ${t.bodyEn} IS NOT NULL)`,
    ),
    check(
      'notices_ends_check',
      sql`${t.endsAt} IS NULL OR ${t.publishAt} IS NULL OR ${t.endsAt} > ${t.publishAt}`,
    ),
    check(
      'notices_window_check',
      sql`(${t.windowStartsAt} IS NULL) = (${t.windowEndsAt} IS NULL) AND (${t.windowEndsAt} IS NULL OR ${t.windowEndsAt} > ${t.windowStartsAt})`,
    ),
  ],
);

// NTC-08: each earlier version of a live notice, written by the edit that replaced it.
export const noticeVersions = control.table(
  'notice_versions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    noticeId: uuid('notice_id')
      .notNull()
      .references(() => notices.id),
    snapshot: jsonb('snapshot').$type<NoticeSnapshot>().notNull(),
    editedBy: uuid('edited_by').notNull(), // the operator whose edit replaced it
    createdAt: createdAt(),
  },
  (t) => [index('notice_versions_notice_idx').on(t.noticeId, t.createdAt)],
);

// The three tables below are each shop's own (NTC-18) but sit here, not in `tenant`, because the operator counts and
// lists them across every shop for a notice (NTC-05, NTC-09), as control.api_keys and control.addon_purchases are. A
// shop's routes read only their own shop's and person's rows; test/isolation and notices.e2e prove it.

// NTC-03, NTC-04, NTC-09: what each person in a shop did with a notice -- opened it on the board, or closed its urgent
// banner or important prompt. Either one makes the row.
export const noticeReads = control.table(
  'notice_reads',
  {
    noticeId: uuid('notice_id')
      .notNull()
      .references(() => notices.id),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.noticeId, t.tenantId, t.userId] }),
    foreignKey({
      name: 'notice_reads_user_fk',
      columns: [t.tenantId, t.userId],
      foreignColumns: [users.tenantId, users.id],
    }).onDelete('cascade'),
    index('notice_reads_user_idx').on(t.tenantId, t.userId),
    check('notice_reads_seen_check', sql`${t.readAt} IS NOT NULL OR ${t.dismissedAt} IS NOT NULL`),
  ],
);

// NTC-05: a shop's "I understand", once per shop, by its owner. Kept with who clicked it if they leave.
export const noticeAcknowledgments = control.table(
  'notice_acknowledgments',
  {
    noticeId: uuid('notice_id')
      .notNull()
      .references(() => notices.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: uuid('user_id').notNull(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.noticeId, t.tenantId] })],
);

// NTC-06, NTC-09: each shop a published notice was sent to, written in the same transaction as its bell rows, so a
// publish cut short carries on where it stopped and never tells a shop twice. How many people heard it there.
export const noticeDeliveries = control.table(
  'notice_deliveries',
  {
    noticeId: uuid('notice_id')
      .notNull()
      .references(() => notices.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    people: integer('people').notNull(),
    emailed: boolean('emailed').notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.noticeId, t.tenantId] }),
    index('notice_deliveries_tenant_idx').on(t.tenantId),
  ],
);

export type SelectNotice = typeof notices.$inferSelect;
export type InsertNotice = typeof notices.$inferInsert;
export type SelectNoticeVersion = typeof noticeVersions.$inferSelect;
