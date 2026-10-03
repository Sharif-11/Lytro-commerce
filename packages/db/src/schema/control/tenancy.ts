import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { control, createdAt } from '../shared';
import { plans } from './plans';
import { subscriberIdentities, subscribers } from './identity';

// Note: `control.tenant_state` is created by the migration; declared here for the columns that use it.
export const tenantState = control.enum('tenant_state', [
  'trial',
  'pay_as_you_go',
  'active',
  'grace',
  'read_only',
  'locked',
  'archived',
  'deleted',
]);

export const KYC_STATUSES = ['unverified', 'pending', 'verified', 'revoked'] as const;
export const DOMAIN_STATUSES = ['pending', 'active', 'failed', 'removed'] as const;

// DATABASE-SCHEMA §2.2: a tenant is a shop. Its slug is generated once and never changes (AUTH-11).
export const tenants = control.table(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // TEN-15: one tenant per owner identity. Unique here means one tenant per identity channel.
    ownerIdentityId: uuid('owner_identity_id')
      .notNull()
      .unique()
      .references(() => subscriberIdentities.id),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id),
    cellId: integer('cell_id').notNull().default(1), // SCL-07: always 1 at launch
    shopName: varchar('shop_name', { length: 60 }).notNull(), // AUTH-01 cap
    slug: varchar('slug', { length: 30 }).notNull().unique(), // AUTH-11, immutable after creation
    state: tenantState('state').notNull().default('trial'),
    planId: uuid('plan_id').references(() => plans.id),
    planSnapshot: jsonb('plan_snapshot'), // PLN-02: frozen limits at purchase (Phase 2 writes it)
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    balanceAmount: numeric('balance_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    balanceFrozen: boolean('balance_frozen').notNull().default(false),
    createdAt: createdAt(),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedReason: text('suspended_reason'),
    kycStatus: text('kyc_status').notNull().default('unverified'), // KYC-16
  },
  (t) => [
    index('tenants_subscriber_idx').on(t.subscriberId),
    index('tenants_state_idx').on(t.state),
    index('tenants_cell_idx').on(t.cellId),
    check(
      'tenants_kyc_status_check',
      sql`${t.kycStatus} in ('unverified','pending','verified','revoked')`,
    ),
  ],
);

// DATABASE-SCHEMA §2.2: custom domains. A domain belongs to one tenant platform-wide (TEN-12).
export const tenantDomains = control.table(
  'tenant_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    hostname: text('hostname').notNull().unique(),
    status: text('status').notNull().default('pending'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('tenant_domains_tenant_idx').on(t.tenantId),
    check(
      'tenant_domains_status_check',
      sql`${t.status} in ('pending','active','failed','removed')`,
    ),
  ],
);
