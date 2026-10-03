// Drizzle schema: source of truth for table shapes. Migrations are generated from this file and then
// reviewed before they run (DAT-04). Row-level security, triggers and grants are added to the generated
// SQL by hand because Drizzle cannot express them. Design references are in docs/DATABASE-SCHEMA.md.
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// §1: one database, two schemas. `control` is platform-wide and has no row-level security.
// `tenant` holds every tenant's rows, and row-level security enforces isolation there (DAT-03).
export const control = pgSchema('control');
export const tenant = pgSchema('tenant');

export const identityKind = control.enum('identity_kind', ['phone', 'email', 'facebook']);

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

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------------------------
// Platform foundation (bootstrap migration, unchanged)
// ---------------------------------------------------------------------------------------------

// DATABASE-SCHEMA §2.4 (ADM-11, DAT-01): every platform-wide editable value.
export const platformSettings = control.table('platform_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description').notNull(),
  updatedBy: uuid('updated_by').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// DATABASE-SCHEMA §2.4 (AUD, ADM): insert-only. A trigger rejects UPDATE and DELETE.
export const platformAuditLog = control.table('platform_audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorType: text('actor_type').notNull(),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: uuid('target_id'),
  result: text('result').notNull(),
  ip: inet('ip'),
  summary: jsonb('summary'),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------------------------
// Plans (minimal, per decision D3). Prices and billing terms arrive in Phase 2.
// DATABASE-SCHEMA §2.3. Limits are data, never code.
// ---------------------------------------------------------------------------------------------

export const plans = control.table(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    rank: integer('rank').notNull(),
    forSale: boolean('for_sale').notNull().default(true),
    version: integer('version').notNull().default(1),
    limits: jsonb('limits').notNull(),
    features: jsonb('features').notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    // PLN-16: rank is unique among plans offered for sale.
    uniqueIndex('plans_rank_for_sale_idx')
      .on(t.rank)
      .where(sql`${t.forSale}`),
  ],
);

// ---------------------------------------------------------------------------------------------
// Identity: subscribers and their verified identities (AUTH-08, AUTH-26)
// ---------------------------------------------------------------------------------------------

export const subscribers = control.table('subscribers', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Null for an OAuth-only subscriber (AUTH-24). The owner's credential lives here, not on tenant.users.
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

// ---------------------------------------------------------------------------------------------
// Tenants (DATABASE-SCHEMA §2.2)
// ---------------------------------------------------------------------------------------------

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

export const tenantDomains = control.table(
  'tenant_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    hostname: text('hostname').notNull().unique(), // TEN-12: a domain belongs to one tenant
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

// ---------------------------------------------------------------------------------------------
// Sessions (decision D1). Lives in `control` because a session is looked up before the tenant
// context is set, so it cannot sit behind row-level security. Stores hashes only (SEC-07).
// ---------------------------------------------------------------------------------------------

export const sessions = control.table(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(), // SHA-256 of the cookie value, never the value
    csrfHash: text('csrf_hash').notNull(), // SHA-256 of the per-session CSRF token (SEC-14)
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id), // TEN-28: must equal the host's tenant on every request
    userId: uuid('user_id'), // staff user; null for the owner's own session. Points into tenant schema by value.
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    ip: inet('ip'),
  },
  (t) => [
    index('sessions_subscriber_idx').on(t.subscriberId),
    index('sessions_tenant_idx').on(t.tenantId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

// ---------------------------------------------------------------------------------------------
// Tenant tables (DATABASE-SCHEMA §3.1, §3.5). Every table starts with tenant_id and has RLS.
// Foreign keys stay inside the tenant schema; references to control are by value (SCL-06).
// ---------------------------------------------------------------------------------------------

export const users = tenant.table(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    phone: varchar('phone', { length: 15 }).notNull(),
    // Null for the owner row: the owner signs in through control.subscribers (see plan, §4).
    passwordHash: text('password_hash'),
    name: text('name'),
    isOwner: boolean('is_owner').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('users_tenant_phone_idx').on(t.tenantId, t.phone),
    // Composite key so user_roles can prove a role and a user belong to the same tenant (DAT-02).
    unique('users_tenant_id_key').on(t.tenantId, t.id),
  ],
);

export const roles = tenant.table(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    permissions: text('permissions')
      .array()
      .notNull()
      .default(sql`'{}'`), // e.g. {orders:manage}
  },
  (t) => [
    uniqueIndex('roles_tenant_name_idx').on(t.tenantId, t.name), // TEN-05
    unique('roles_tenant_id_key').on(t.tenantId, t.id),
  ],
);

export const userRoles = tenant.table(
  'user_roles',
  {
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    roleId: uuid('role_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.userId, t.roleId] }),
    foreignKey({
      columns: [t.tenantId, t.userId],
      foreignColumns: [users.tenantId, users.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.roleId],
      foreignColumns: [roles.tenantId, roles.id],
    }),
  ],
);

export const activityLog = tenant.table(
  'activity_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    actorType: text('actor_type').notNull(), // user | api_key | system | platform_support
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: uuid('target_id'),
    result: text('result').notNull(),
    summary: jsonb('summary'),
    createdAt: createdAt(),
  },
  (t) => [index('activity_log_tenant_created_idx').on(t.tenantId, t.createdAt)],
);

// DAT-03 / TEN-24: tenant id for row-level security. NULL when unset, so unscoped queries match no rows.
// Defined as `tenant.current_tenant_id()` in the bootstrap migration.
export const currentTenantIdSql = sql`tenant.current_tenant_id()`;
