import { Inject, Injectable } from '@nestjs/common';
import { RoleRepository, TransactionRunner, type SelectRole, type Transaction } from '@lytronix/db';
import { UniqueViolation } from '../../common/errors/unique-violation';
import type { RoleStore } from '../../modules/staff/ports/role-store';
import type { RoleRecord } from '../../modules/staff/types/role';
import { DatabaseService } from '../database.service';

// The unique index on a shop's role names (STF-07).
const NAME_INDEX = 'roles_tenant_name_idx';

function toRecord(row: SelectRole): RoleRecord {
  return { id: row.id, name: row.name, permissions: row.permissions };
}

/** Database-backed role store. */
@Injectable()
export class DrizzleRoleStore implements RoleStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(RoleRepository) private readonly roles: RoleRepository,
  ) {}

  run<T>(_tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  async list(tx: Transaction, tenantId: string): Promise<RoleRecord[]> {
    return (await this.roles.listRoles(tx, tenantId)).map(toRecord);
  }

  async findByIds(tx: Transaction, tenantId: string, roleIds: string[]): Promise<RoleRecord[]> {
    return (await this.roles.findRoles(tx, tenantId, roleIds)).map(toRecord);
  }

  async find(tx: Transaction, tenantId: string, roleId: string): Promise<RoleRecord | null> {
    const row = await this.roles.findRole(tx, tenantId, roleId);
    return row ? toRecord(row) : null;
  }

  async insert(
    tx: Transaction,
    tenantId: string,
    values: { name: string; permissions: string[] },
  ): Promise<RoleRecord> {
    try {
      return toRecord(await this.roles.insertRole(tx, { tenantId, ...values }));
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, NAME_INDEX)) throw new UniqueViolation('role');
      throw error;
    }
  }

  async update(
    tx: Transaction,
    tenantId: string,
    roleId: string,
    patch: { name?: string; permissions?: string[] },
  ): Promise<RoleRecord | null> {
    try {
      const row = await this.roles.updateRole(tx, tenantId, roleId, patch);
      return row ? toRecord(row) : null;
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, NAME_INDEX)) throw new UniqueViolation('role');
      throw error;
    }
  }

  remove(tx: Transaction, tenantId: string, roleId: string): Promise<void> {
    return this.roles.deleteRole(tx, tenantId, roleId);
  }

  countHolders(tx: Transaction, tenantId: string, roleId: string): Promise<number> {
    return this.roles.countHolders(tx, tenantId, roleId);
  }

  assign(tx: Transaction, tenantId: string, userId: string, roleId: string): Promise<void> {
    return this.roles.assign(tx, tenantId, userId, roleId);
  }

  replaceFor(tx: Transaction, tenantId: string, userId: string, roleIds: string[]): Promise<void> {
    return this.roles.replaceUserRoles(tx, tenantId, userId, roleIds);
  }

  assignments(tx: Transaction, tenantId: string): Promise<{ userId: string; roleId: string }[]> {
    return this.roles.listAssignments(tx, tenantId);
  }
}
