import type { OauthProvider } from '@lytronix/validators';
import { identityKind } from '../enums';
import { inet, text, timestamp, uniqueIndex, uuid, index } from 'drizzle-orm/pg-core';
import { control, createdAt } from '../shared';

// Note: `control.identity_kind` is created by the migration; the enum is declared here so columns can use it.

// DATABASE-SCHEMA §2.1: the account holder. The owner's password lives here, not on tenant.users.
export const subscribers = control.table('subscribers', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Null for an OAuth-only subscriber (AUTH-24).
  passwordHash: text('password_hash'),
  createdAt: createdAt(),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
});

export const subscriberIdentities = control.table(
  'subscriber_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id),
    kind: identityKind('kind').notNull(),
    // Normalised phone (AUTH-02), lowercased email, or Facebook account id.
    value: text('value').notNull(),
    // Null while a staff phone waits for its owner to sign in by code (staff onboarding). Set when the code is proven.
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    // AUTH-08: each kind is unique platform-wide and never cross-checked against another kind.
    uniqueIndex('subscriber_identities_kind_value_idx').on(t.kind, t.value),
    index('subscriber_identities_subscriber_idx').on(t.subscriberId),
  ],
);

// AUTH-14: every failed sign-in is recorded with the account (when one exists) and the client IP. A lock is
// five failures inside fifteen minutes, counted from this table, so old failures age out without any reset.
export const signInFailures = control.table(
  'sign_in_failures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriberId: uuid('subscriber_id').references(() => subscribers.id),
    ip: inet('ip'),
    createdAt: createdAt(),
  },
  (t) => [
    index('sign_in_failures_subscriber_idx').on(t.subscriberId, t.createdAt),
    index('sign_in_failures_ip_idx').on(t.ip, t.createdAt),
  ],
);

// AUTH-24: one row per Google or Facebook sign-in attempt. The state and the PKCE verifier are single use and expire.
export const oauthStates = control.table('oauth_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  state: text('state').notNull().unique(),
  provider: text('provider').$type<OauthProvider>().notNull(),
  // Set when a signed-in person is adding this provider to their account (AUTH-26); null for a sign-in.
  attachToSubscriberId: uuid('attach_to_subscriber_id').references(() => subscribers.id),
  codeVerifier: text('code_verifier').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export type SelectSubscriber = typeof subscribers.$inferSelect;
export type InsertSubscriber = typeof subscribers.$inferInsert;
export type UpdateSubscriber = Partial<InsertSubscriber>;

export type SelectSubscriberIdentity = typeof subscriberIdentities.$inferSelect;
export type InsertSubscriberIdentity = typeof subscriberIdentities.$inferInsert;
export type UpdateSubscriberIdentity = Partial<InsertSubscriberIdentity>;
