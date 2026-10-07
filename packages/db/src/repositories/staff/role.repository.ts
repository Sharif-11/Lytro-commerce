import { and, count, eq, inArray } from 'drizzle-orm';
import { roles, userRoles, type SelectRole } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

// STF-07 to STF-09: roles of one shop and who holds them. Every method runs inside a transaction that carries the
// shop's tenant context, so row-level security applies.
export class RoleRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async listRoles(tx: Transaction, tenantId: string): Promise<SelectRole[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx.select().from(roles).orderBy(roles.name);
  }

  async findRoles(tx: Transaction, tenantId: string, roleIds: string[]): Promise<SelectRole[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (roleIds.length === 0) return [];
    return tx
      .select()
      .from(roles)
      .where(and(eq(roles.tenantId, tenantId), inArray(roles.id, roleIds)));
  }

  async findRole(tx: Transaction, tenantId: string, roleId: string): Promise<SelectRole | null> {
    const rows = await this.findRoles(tx, tenantId, [roleId]);
    return rows[0] ?? null;
  }

  async insertRole(
    tx: Transaction,
    values: { tenantId: string; name: string; permissions: string[] },
  ): Promise<SelectRole> {
    await this.transactions.setTenantContext(tx, values.tenantId);
    const rows = await tx.insert(roles).values(values).returning();
    const row = rows[0];
    if (!row) throw new Error('insert returned no role row');
    return row;
  }

  async updateRole(
    tx: Transaction,
    tenantId: string,
    roleId: string,
    patch: { name?: string; permissions?: string[] },
  ): Promise<SelectRole | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .update(roles)
      .set(patch)
      .where(and(eq(roles.tenantId, tenantId), eq(roles.id, roleId)))
      .returning();
    return rows[0] ?? null;
  }

  async deleteRole(tx: Transaction, tenantId: string, roleId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(roles).where(and(eq(roles.tenantId, tenantId), eq(roles.id, roleId)));
  }

  /** How many users hold the role (STF-09). */
  async countHolders(tx: Transaction, tenantId: string, roleId: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ total: count() })
      .from(userRoles)
      .where(and(eq(userRoles.tenantId, tenantId), eq(userRoles.roleId, roleId)));
    return rows[0]?.total ?? 0;
  }

  /** The role ids each user holds, for the staff list. */
  async listAssignments(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ userId: string; roleId: string }[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select({ userId: userRoles.userId, roleId: userRoles.roleId })
      .from(userRoles)
      .where(eq(userRoles.tenantId, tenantId));
  }

  /** Replaces the roles a user holds with exactly these, in one transaction (STF-07). */
  async replaceUserRoles(
    tx: Transaction,
    tenantId: string,
    userId: string,
    roleIds: string[],
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(userRoles)
      .where(and(eq(userRoles.tenantId, tenantId), eq(userRoles.userId, userId)));
    for (const roleId of roleIds) await this.assign(tx, tenantId, userId, roleId);
  }

  /** The permissions a user holds through their roles. */
  async permissionsOf(tx: Transaction, tenantId: string, userId: string): Promise<string[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select({ permissions: roles.permissions })
      .from(userRoles)
      .innerJoin(roles, and(eq(roles.tenantId, userRoles.tenantId), eq(roles.id, userRoles.roleId)))
      .where(and(eq(userRoles.tenantId, tenantId), eq(userRoles.userId, userId)));
    return rows.flatMap((row) => row.permissions);
  }

  /** Gives a user a role. Giving the same role twice changes nothing. */
  async assign(tx: Transaction, tenantId: string, userId: string, roleId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.insert(userRoles).values({ tenantId, userId, roleId }).onConflictDoNothing();
  }
}
