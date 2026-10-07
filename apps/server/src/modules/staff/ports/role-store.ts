import type { Transaction } from '@lytronix/db';
import type { RoleRecord } from '../types/role';

/** Roles of one shop and their holders. Methods take the caller's transaction, which carries the tenant context. */
export interface RoleStore {
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  list(tx: Transaction, tenantId: string): Promise<RoleRecord[]>;
  findByIds(tx: Transaction, tenantId: string, roleIds: string[]): Promise<RoleRecord[]>;
  find(tx: Transaction, tenantId: string, roleId: string): Promise<RoleRecord | null>;
  /** A name already used in the shop comes back as UniqueViolation('role'). */
  insert(
    tx: Transaction,
    tenantId: string,
    values: { name: string; permissions: string[] },
  ): Promise<RoleRecord>;
  update(
    tx: Transaction,
    tenantId: string,
    roleId: string,
    patch: { name?: string; permissions?: string[] },
  ): Promise<RoleRecord | null>;
  remove(tx: Transaction, tenantId: string, roleId: string): Promise<void>;
  countHolders(tx: Transaction, tenantId: string, roleId: string): Promise<number>;
  assign(tx: Transaction, tenantId: string, userId: string, roleId: string): Promise<void>;
  /** Replaces the roles a user holds with exactly these. */
  replaceFor(tx: Transaction, tenantId: string, userId: string, roleIds: string[]): Promise<void>;
  /** The permissions a user holds through their roles, read on each call (STF-10). */
  permissionsOf(tx: Transaction, tenantId: string, userId: string): Promise<string[]>;
  /** Every user's role ids in the shop, as (user, role) pairs. */
  assignments(tx: Transaction, tenantId: string): Promise<{ userId: string; roleId: string }[]>;
}
