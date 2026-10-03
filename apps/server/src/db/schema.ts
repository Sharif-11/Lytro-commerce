// Phase 0 bootstrap schema. Source of truth for the tables defined so far is docs/DATABASE-SCHEMA.md.
// Only the platform foundation tables exist here; tenant tables arrive in Phase 1 onward.
import { sql } from 'drizzle-orm';
import { bigserial, inet, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// §1: two schemas, one database. Tenant tables will live in `tenant` with RLS enabled.
export const control = pgSchema('control');
export const tenant = pgSchema('tenant');

// DATABASE-SCHEMA §2.4 (ADM-11, DAT-01): every platform-wide editable value.
export const platformSettings = control.table('platform_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description').notNull(),
  updatedBy: uuid('updated_by').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// DATABASE-SCHEMA §2.4 (AUD, ADM): insert-only. A trigger created in the migration rejects UPDATE and DELETE.
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Tenant isolation helper used by every future RLS policy (DAT-03, TEN-24).
// Defined as `tenant.current_tenant_id()` in the bootstrap migration; use it in policies, e.g.
// USING (tenant_id = tenant.current_tenant_id()). NULL when unset, so unscoped queries match no rows.
export const currentTenantIdSql = sql`tenant.current_tenant_id()`;
