import { foreignKey, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { TutorialScreen } from '@lytronix/validators';
import { createdAt, tenant } from '../shared';
import { users } from './staff';

// TENANT-DASHBOARD-DESIGN §7.49, §7.49a (the owner, 2026-11-27): what each person in a shop did with the tutorial videos.
// Per person, not per shop: the owner and each staff member decide for themselves, on the phone and the computer alike.

/** The parts a person has watched to the end (or past 90 percent). A replaced video keeps its row (the owner's pick). */
export const tutorialViews = tenant.table(
  'tutorial_views',
  {
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    tutorialKey: text('tutorial_key').notNull(),
    watchedAt: timestamp('watched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.userId, t.tutorialKey] }),
    foreignKey({
      columns: [t.tenantId, t.userId],
      foreignColumns: [users.tenantId, users.id],
      name: 'tutorial_views_user_fk',
    }).onDelete('cascade'),
  ],
);

/** The screens a person said "আর দেখাবেন না" on; `home` is Home's set-up card head. No undo on the screen. */
export const tutorialDismissals = tenant.table(
  'tutorial_dismissals',
  {
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    screen: text('screen').$type<TutorialScreen>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.userId, t.screen] }),
    foreignKey({
      columns: [t.tenantId, t.userId],
      foreignColumns: [users.tenantId, users.id],
      name: 'tutorial_dismissals_user_fk',
    }).onDelete('cascade'),
  ],
);

export type SelectTutorialView = typeof tutorialViews.$inferSelect;
export type SelectTutorialDismissal = typeof tutorialDismissals.$inferSelect;
