import { sql } from 'drizzle-orm';
import {
  DomainStatus,
  KycStatus,
  NAME_MAX_LENGTH,
  SLUG_MAX_LENGTH,
  type PlanLimits,
  TenantState,
} from '@lytronix/validators';
import { tenantState } from '../enums';
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
    shopName: varchar('shop_name', { length: NAME_MAX_LENGTH }).notNull(), // AUTH-01 cap
    slug: varchar('slug', { length: SLUG_MAX_LENGTH }).notNull().unique(), // AUTH-11, immutable after creation
    state: tenantState('state').$type<TenantState>().notNull().default(TenantState.Trial),
    planId: uuid('plan_id').references(() => plans.id),
    planSnapshot: jsonb('plan_snapshot').$type<PlanLimits>(), // PLN-02: frozen limits at purchase (Phase 2 writes it)
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    balanceAmount: numeric('balance_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    balanceFrozen: boolean('balance_frozen').notNull().default(false),
    createdAt: createdAt(),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedReason: text('suspended_reason'),
    // D2-11: cached, updated whenever an order-fee, product-fee or top-up ledger entry is written. Read by the
    // pay-as-you-go inactivity job (PYG-21). Null for a tenant that was never pay-as-you-go.
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
    // LIF-01: the owner's own intent to not renew, settable and clearable until period end. The state machine
    // never reads this -- not renewing (LIF-02) already reaches `grace` at period end with no flag involved;
    // it exists only so the dashboard can show "cancelled, effective <date>" and offer "Undo".
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    // LIF-20/21/22: set once by the day-60 deletion job (LIF-19), never before. The row and its state
    // ('deleted') persist after this is set -- deletion removes only the business data listed in LIF-19.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    kycStatus: text('kyc_status').notNull().default(KycStatus.Unverified), // KYC-16
    // TEN-30: contact details the owner sets from dashboard settings, any time after onboarding -- never a
    // field at shop creation. Each is independent and nullable; no relation to `slug`'s own "address"
    // naming (AUTH-11, the subdomain candidate), which this is deliberately not called to avoid confusion.
    contactPhone: varchar('contact_phone', { length: 30 }),
    contactEmail: varchar('contact_email', { length: 254 }),
    businessAddress: text('business_address'),
  },
  (t) => [
    index('tenants_subscriber_idx').on(t.subscriberId),
    index('tenants_state_idx').on(t.state),
    index('tenants_cell_idx').on(t.cellId),
    check(
      'tenants_kyc_status_check',
      sql`${t.kycStatus} in (${sql.raw(
        Object.values(KycStatus)
          .map((s) => `'${s}'`)
          .join(','),
      )})`,
    ),
  ],
);

// TEN-19, TEN-26: slugs that no shop may take. Data, not code, so the list can change without a deploy (R4).
// The migration seeds the initial list; the slug service reads it.
export const reservedSlugs = control.table('reserved_slugs', {
  slug: varchar('slug', { length: SLUG_MAX_LENGTH }).primaryKey(),
  reason: text('reason').notNull(),
  createdAt: createdAt(),
});

// DATABASE-SCHEMA §2.2: custom domains. A domain belongs to one tenant platform-wide (TEN-12).
export const tenantDomains = control.table(
  'tenant_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    hostname: text('hostname').notNull().unique(),
    status: text('status').$type<DomainStatus>().notNull().default(DomainStatus.Pending),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('tenant_domains_tenant_idx').on(t.tenantId),
    check(
      'tenant_domains_status_check',
      sql`${t.status} in (${sql.raw(
        Object.values(DomainStatus)
          .map((s) => `'${s}'`)
          .join(','),
      )})`,
    ),
  ],
);

export type SelectTenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;
export type UpdateTenant = Partial<InsertTenant>;

export type SelectReservedSlug = typeof reservedSlugs.$inferSelect;
export type InsertReservedSlug = typeof reservedSlugs.$inferInsert;
export type UpdateReservedSlug = Partial<InsertReservedSlug>;

export type SelectTenantDomain = typeof tenantDomains.$inferSelect;
export type InsertTenantDomain = typeof tenantDomains.$inferInsert;
export type UpdateTenantDomain = Partial<InsertTenantDomain>;
