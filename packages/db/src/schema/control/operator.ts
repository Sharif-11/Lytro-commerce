import { index, inet, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { control, createdAt } from '../shared';

// ADM-01, ADM-18, SEC-14, D8: operator accounts, separate from subscribers (tenant sign-in never reaches
// these routes and vice versa). `two_factor_confirmed_at` null means enrollment is incomplete, or has been
// reset by break-glass recovery (ADM-18) — either way, the account cannot sign in past that step. There is no
// "enabled" toggle: TOTP is mandatory for every operator account, by construction, not by a flag that could be
// turned off.
export const operatorAccounts = control.table('operator_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  // Set once, at enrollment; shown to the operator exactly once (ADM-01). Null until then.
  twoFactorSecret: text('two_factor_secret'),
  twoFactorConfirmedAt: timestamp('two_factor_confirmed_at', { withTimezone: true }),
  createdAt: createdAt(),
});

// ADM-01, ADM-18: ten single-use codes, issued once at enrollment confirmation. Regenerating invalidates the
// old set (by deleting and re-inserting, not by a status column — there is no "deactivated but present" state
// to track once a set is replaced).
export const operatorBackupCodes = control.table(
  'operator_backup_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operatorId: uuid('operator_id')
      .notNull()
      .references(() => operatorAccounts.id),
    codeHash: text('code_hash').notNull(), // same discipline as password_hash (bcrypt)
    usedAt: timestamp('used_at', { withTimezone: true }), // null = still valid; set once on use, never reused
    createdAt: createdAt(),
  },
  (t) => [index('operator_backup_codes_operator_idx').on(t.operatorId)],
);

// Mirrors `control.sessions`' shape, but keyed to an operator, not a subscriber — the two are deliberately
// separate tables (ADM-01: the console is a separate account space with no shared session mechanism), so a
// tenant session can never be mistaken for an operator one and there is no nullable "which kind of principal"
// column to get wrong.
export const operatorSessions = control.table(
  'operator_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(), // SHA-256 of the cookie value, never the value (SEC-07)
    csrfHash: text('csrf_hash').notNull(), // SHA-256 of the per-session CSRF token (SEC-14)
    operatorId: uuid('operator_id')
      .notNull()
      .references(() => operatorAccounts.id),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    ip: inet('ip'),
  },
  (t) => [
    index('operator_sessions_operator_idx').on(t.operatorId),
    index('operator_sessions_expires_idx').on(t.expiresAt),
  ],
);

export type SelectOperatorAccount = typeof operatorAccounts.$inferSelect;
export type InsertOperatorAccount = typeof operatorAccounts.$inferInsert;
export type UpdateOperatorAccount = Partial<InsertOperatorAccount>;

export type SelectOperatorBackupCode = typeof operatorBackupCodes.$inferSelect;
export type InsertOperatorBackupCode = typeof operatorBackupCodes.$inferInsert;

export type SelectOperatorSession = typeof operatorSessions.$inferSelect;
export type InsertOperatorSession = typeof operatorSessions.$inferInsert;
export type UpdateOperatorSession = Partial<InsertOperatorSession>;
