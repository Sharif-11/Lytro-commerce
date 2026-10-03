import { text, timestamp, uniqueIndex, uuid, index } from 'drizzle-orm/pg-core';
import { control, createdAt } from '../shared';

// Note: `control.identity_kind` is created by the migration; the enum is declared here so columns can use it.
export const identityKind = control.enum('identity_kind', ['phone', 'email', 'facebook']);

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
    verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // AUTH-08: each kind is unique platform-wide and never cross-checked against another kind.
    uniqueIndex('subscriber_identities_kind_value_idx').on(t.kind, t.value),
    index('subscriber_identities_subscriber_idx').on(t.subscriberId),
  ],
);
