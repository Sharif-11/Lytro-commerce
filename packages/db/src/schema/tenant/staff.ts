import { sql } from 'drizzle-orm';
import {
  boolean,
  foreignKey,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, tenant } from '../shared';

// Tenant tables carry tenant_id and sit behind row-level security. Foreign keys stay inside the tenant
// schema; references to control are by value (SCL-06).

// DATABASE-SCHEMA §3.1. The owner's credential lives on control.subscribers, so password_hash is null for the
// owner row and set only for staff.
export const users = tenant.table(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    // Null for an owner who enrolled by email only; every owner has at least one of phone or email (AUTH-10).
    phone: varchar('phone', { length: 15 }),
    email: varchar('email', { length: 254 }),
    passwordHash: text('password_hash'),
    name: text('name'),
    isOwner: boolean('is_owner').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('users_tenant_phone_idx').on(t.tenantId, t.phone),
    uniqueIndex('users_tenant_email_idx').on(t.tenantId, t.email),
    // Composite unique constraint, so user_roles can prove a role and a user belong to the same tenant (DAT-02).
    // It must be a constraint, not an index: Postgres requires one to target it from a foreign key.
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
      .default(sql`'{}'`),
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
    foreignKey({ columns: [t.tenantId, t.userId], foreignColumns: [users.tenantId, users.id] }),
    foreignKey({ columns: [t.tenantId, t.roleId], foreignColumns: [roles.tenantId, roles.id] }),
  ],
);

export type SelectUser = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type UpdateUser = Partial<InsertUser>;

export type SelectRole = typeof roles.$inferSelect;
export type InsertRole = typeof roles.$inferInsert;
export type UpdateRole = Partial<InsertRole>;

export type SelectUserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = typeof userRoles.$inferInsert;
export type UpdateUserRole = Partial<InsertUserRole>;
