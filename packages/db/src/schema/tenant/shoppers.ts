import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  ADDRESS_LABEL_MAX_LENGTH,
  CUSTOMER_NAME_MAX_LENGTH,
  ORDER_ADDRESS_MAX_LENGTH,
} from '@lytronix/validators';
import { createdAt, tenant } from '../shared';

// CUS-03 to CUS-06, D4-14 (Phase 4 Slice 4.4b, read agreed 2026-10-30): a shop's shoppers, each one phone in one shop,
// made with a code sent once to that phone and signed in with a password after. Separate from the owners' accounts
// and their challenges (control.verification_challenges).
export const shoppers = tenant.table(
  'shoppers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    // The local form, 01XXXXXXXXX, proved by the sign-up code.
    phone: varchar('phone', { length: 15 }).notNull(),
    name: varchar('name', { length: CUSTOMER_NAME_MAX_LENGTH }).notNull(),
    passwordHash: text('password_hash').notNull(),
    // AUTH-14's rule for shoppers: the wrong passwords since `failing_since`; five within fifteen minutes lock it.
    failedSignins: integer('failed_signins').notNull().default(0),
    failingSince: timestamp('failing_since', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('shoppers_tenant_id_key').on(t.tenantId, t.id),
    uniqueIndex('shoppers_phone_key').on(t.tenantId, t.phone),
  ],
);

// CUS-03, CUS-05: a shopper's sign-in, as the hash of the token the shop's site holds; it lasts SHOPPER_SESSION_DAYS.
export const shopperSessions = tenant.table(
  'shopper_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    shopperId: uuid('shopper_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'shopper_sessions_shopper_fk',
      columns: [t.tenantId, t.shopperId],
      foreignColumns: [shoppers.tenantId, shoppers.id],
    }).onDelete('cascade'),
    uniqueIndex('shopper_sessions_token_key').on(t.tokenHash),
    index('shopper_sessions_shopper_idx').on(t.tenantId, t.shopperId),
  ],
);

// CUS-04: a sign-up code sent to a phone, as its keyed hash (AUTH-05), valid five minutes and five wrong tries.
export const shopperCodes = tenant.table(
  'shopper_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    phone: varchar('phone', { length: 15 }).notNull(),
    codeHash: text('code_hash').notNull(),
    wrongAttempts: integer('wrong_attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('shopper_codes_phone_idx').on(t.tenantId, t.phone, t.createdAt),
    index('shopper_codes_tenant_idx').on(t.tenantId, t.createdAt),
  ],
);

// CUS-06: a shopper's saved addresses, up to SHOPPER_ADDRESSES_MAX, one of them the default. The thana is by value
// (control.locations, no cross-schema key), as on an order.
export const shopperAddresses = tenant.table(
  'shopper_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    shopperId: uuid('shopper_id').notNull(),
    label: varchar('label', { length: ADDRESS_LABEL_MAX_LENGTH }).notNull(),
    locationId: integer('location_id').notNull(),
    deliveryAddress: varchar('delivery_address', { length: ORDER_ADDRESS_MAX_LENGTH }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'shopper_addresses_shopper_fk',
      columns: [t.tenantId, t.shopperId],
      foreignColumns: [shoppers.tenantId, shoppers.id],
    }).onDelete('cascade'),
    index('shopper_addresses_shopper_idx').on(t.tenantId, t.shopperId, t.createdAt),
    uniqueIndex('shopper_addresses_default_key')
      .on(t.tenantId, t.shopperId)
      .where(sql`${t.isDefault}`),
  ],
);

export type SelectShopper = typeof shoppers.$inferSelect;
export type SelectShopperSession = typeof shopperSessions.$inferSelect;
export type SelectShopperCode = typeof shopperCodes.$inferSelect;
export type SelectShopperAddress = typeof shopperAddresses.$inferSelect;
