import { boolean, integer, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { control, createdAt } from '../shared';

// BIL-02/BAL-03: the platform's own wallet numbers a tenant pays into when buying a plan or topping up --
// not WAL-* (Phase 5), which is a tenant's own wallet accounts for receiving payments from its shoppers.
// Independent rows, no "one active per provider" rule (that's WAL-03's own nuance, not named here); the
// operator may hold several numbers of the same provider (e.g. Personal and Agent) enabled at once.
export const platformWallets = control.table('platform_wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  number: varchar('number', { length: 20 }).notNull(),
  label: text('label'),
  enabled: boolean('enabled').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: createdAt(),
});

export type SelectPlatformWallet = typeof platformWallets.$inferSelect;
export type InsertPlatformWallet = typeof platformWallets.$inferInsert;
