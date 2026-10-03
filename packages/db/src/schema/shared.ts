// Shared database building blocks. Every schema area imports from here.
import { sql } from 'drizzle-orm';
import { pgSchema, timestamp } from 'drizzle-orm/pg-core';

// DATABASE-SCHEMA §1: one database, two schemas. `control` is platform-wide and has no row-level security.
// `tenant` holds every tenant's rows, and row-level security enforces isolation there (DAT-03).
export const control = pgSchema('control');
export const tenant = pgSchema('tenant');

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// DAT-03 / TEN-24: tenant id for row-level security. NULL when unset, so unscoped queries match no rows.
// Defined as `tenant.current_tenant_id()` in the migration; use it in policies.
export const currentTenantIdSql = sql`tenant.current_tenant_id()`;
