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
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { control, createdAt } from '../shared';
import { plans } from './plans';
import { businessTypePresets } from './presets';
import { subscriberIdentities, subscribers } from './identity';

// Note: `control.tenant_state` is created by the migration; declared here for the columns that use it.

// DATABASE-SCHEMA §2.2: a tenant is a shop. Its slug is generated once and never changes (AUTH-11).
export const tenants = control.table(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // TEN-15: one live tenant per owner identity -- unique among tenants not yet deleted (the partial index
    // below), so an owner whose shop was deleted can open a new one on the same identity (LIF-21).
    ownerIdentityId: uuid('owner_identity_id')
      .notNull()
      .references(() => subscriberIdentities.id),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id),
    cellId: integer('cell_id').notNull().default(1), // SCL-07: always 1 at launch
    // AUTH-01 cap. LIF-21's day-90 (deletedAt + 30 days) revocation job also mangles this on a deleted
    // tenant, alongside the slug below -- the old shop's identity is no longer meaningful that long after
    // deletion, and nothing in LIF-20's own survivor list (plan, payment history, invoices, balance) depends
    // on it.
    shopName: varchar('shop_name', { length: NAME_MAX_LENGTH }).notNull(),
    // AUTH-11: immutable after creation, enforced by a database trigger (migration 0002) for every live
    // tenant unconditionally -- TEN-19's own guarantee. The one deliberate exception (migration 0037):
    // LIF-21's day-90 revocation job mangles a deleted tenant's own slug, once deletedAt is 30+ days old, to
    // release the literal string for a different subscriber.
    slug: varchar('slug', { length: SLUG_MAX_LENGTH }).notNull().unique(),
    state: tenantState('state').$type<TenantState>().notNull().default(TenantState.Trial),
    planId: uuid('plan_id').references(() => plans.id),
    planSnapshot: jsonb('plan_snapshot').$type<PlanLimits>(), // PLN-02: frozen limits at purchase (Phase 2 writes it)
    // PLN-05: the rest of "every purchase shall store a snapshot: plan ID and version, all limits and
    // features" -- planSnapshot above only ever carried the limits half. Written at the same moment, by
    // the same `applyPlanAssignment` call, so a later edit to the live plan row never silently changes what
    // an existing tenant is recorded as having actually bought.
    planVersionSnapshot: integer('plan_version_snapshot'),
    featureSnapshot: jsonb('feature_snapshot').$type<Record<string, boolean>>(),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    balanceAmount: numeric('balance_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    balanceFrozen: boolean('balance_frozen').notNull().default(false),
    createdAt: createdAt(),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedReason: text('suspended_reason'),
    // TVR-03, LIF-24 (Phase 5 Slice 5.2b): the shop's payment page alone suspended by Lytro -- no new sessions, open pages
    // unavailable -- while the rest of the shop works.
    paymentPageSuspendedAt: timestamp('payment_page_suspended_at', { withTimezone: true }),
    paymentPageSuspendedReason: text('payment_page_suspended_reason'),
    // D2-11: cached, updated whenever an order-fee, product-fee or top-up ledger entry is written. Read by the
    // pay-as-you-go inactivity job (PYG-21). Null for a tenant that was never pay-as-you-go.
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
    // LIF-01: the owner's own intent to not renew, settable and clearable until period end. The state machine
    // never reads this -- not renewing (LIF-02) already reaches `grace` at period end with no flag involved;
    // it exists only so the dashboard can show "cancelled, effective <date>" and offer "Undo".
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    // PYG-09, PYG-21: when the tenant entered `archived`; cleared when a plan or pay-as-you-go restores it
    // (applyPlanAssignment). A pay-as-you-go shop's deletion clock (LIF-18, LIF-19) runs from here, since it
    // has no period end to count from.
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    // LIF-20/21/22: set once by the day-60 deletion job (LIF-19), never before. The row and its state
    // ('deleted') persist after this is set -- deletion removes only the business data listed in LIF-19.
    // LIF-21's own day-90 revocation job (deletedAt + 30 days) reads this to find its candidates.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    kycStatus: text('kyc_status').notNull().default(KycStatus.Unverified), // KYC-16
    // TEN-30: contact details the owner sets from dashboard settings, any time after onboarding -- never a
    // field at shop creation. Each is independent and nullable; no relation to `slug`'s own "address"
    // naming (AUTH-11, the subdomain candidate), which this is deliberately not called to avoid confusion.
    contactPhone: varchar('contact_phone', { length: 30 }),
    contactEmail: varchar('contact_email', { length: 254 }),
    businessAddress: text('business_address'),
    // PST-01: the shop's main business type, which sets new products' defaults and suggestions (PST-02). Null
    // until chosen; changing it never touches existing products (PST-03).
    businessType: text('business_type').references(() => businessTypePresets.key),
    // BIL-17: the billing term the tenant's current period was bought/renewed for -- a plain uuid, not a
    // Drizzle `.references()`, since `billing-terms.ts` already imports this table (tenant-scoped terms,
    // TRM-14), and the reverse import would be circular. Null for trial/pay-as-you-go, which have no term.
    billingTermId: uuid('billing_term_id'),
    // BIL-17: "renew automatically from balance", off by default (an assumption the row itself names).
    autoRenewEnabled: boolean('auto_renew_enabled').notNull().default(false),
    // PLN-15, BND-04, RTE-11: buy a bandwidth or a request pack from the balance at 100% of the cycle's allowance; both
    // off by default.
    autoBuyBandwidth: boolean('auto_buy_bandwidth').notNull().default(false),
    autoBuyRequests: boolean('auto_buy_requests').notNull().default(false),
    // DWN-11: a downgrade that shortens activity-log retention doesn't take effect until 14 days after the
    // owner was notified -- until then the purge job must still honor the longer, pre-downgrade retention.
    // `retentionFloorUntil` non-null (and in the future) is itself the proof a notice already went out, so
    // no separate "notice sent at" column is needed.
    retentionFloorDays: integer('retention_floor_days'),
    retentionFloorUntil: timestamp('retention_floor_until', { withTimezone: true }),
    // DWN-12, DWN-14: when the last downgrade (or switch to pay-as-you-go) took effect, the limits it left the shop
    // over then (`staff`, `products`, `storage_mb`), and when the final warning about them went out. Any later plan
    // assignment clears all three.
    downgradedAt: timestamp('downgraded_at', { withTimezone: true }),
    downgradeOverLimit: jsonb('downgrade_over_limit').$type<string[]>(),
    downgradeFinalWarningAt: timestamp('downgrade_final_warning_at', { withTimezone: true }),
    // LIF-26: the platform's grace/read-only/locked/archived stage lengths, frozen the first tick this
    // tenant is found lapsing -- a later change to the live platform settings must not alter the schedule
    // an already-lapsed tenant started with. Null while active (or never yet lapsed); cleared back to null
    // whenever the tenant returns to active (applyPlanAssignment), so its *next* lapse snapshots fresh.
    lapseScheduleSnapshot: jsonb('lapse_schedule_snapshot').$type<{
      grace: number;
      readOnly: number;
      locked: number;
      archived: number;
    }>(),
  },
  (t) => [
    uniqueIndex('tenants_owner_identity_live_idx')
      .on(t.ownerIdentityId)
      .where(sql`${t.deletedAt} IS NULL`),
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

// DATABASE-SCHEMA §2.2: custom domains. An active domain belongs to one tenant platform-wide (TEN-12), kept while its
// shop's plan does not include it (DWN-10: it serves only while the plan does); a waiting one does not hold the name,
// since only the shop its records name can verify it. One domain a shop (TEN-09), its twin (megh.com and
// www.megh.com) served beside it when its record points here (Slice 13).
export const tenantDomains = control.table(
  'tenant_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    hostname: text('hostname').notNull(),
    status: text('status').$type<DomainStatus>().notNull().default(DomainStatus.Pending),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: createdAt(),
    // Slice 13: the twin, and whether its record points here; when the wait began (72 hours to verify); when it was
    // last checked; the checks running that missed an active domain's record, and when that sent it back to waiting;
    // when it was removed.
    twin: text('twin').notNull(),
    twinActive: boolean('twin_active').notNull().default(false),
    pendingSince: timestamp('pending_since', { withTimezone: true }).notNull().defaultNow(),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    missedChecks: smallint('missed_checks').notNull().default(0),
    lostAt: timestamp('lost_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [
    index('tenant_domains_tenant_idx').on(t.tenantId),
    uniqueIndex('tenant_domains_active_hostname')
      .on(t.hostname)
      .where(sql`${t.status} = 'active'`),
    uniqueIndex('tenant_domains_one_per_shop')
      .on(t.tenantId)
      .where(sql`${t.status} <> 'removed'`),
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
