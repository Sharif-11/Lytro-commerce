import { Inject, Injectable } from '@nestjs/common';
import type { CreateRoleInput, UpdateRoleInput } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import type { RoleStore } from '../ports/role-store';
import { ROLE_STORE } from '../tokens';
import type { RoleRecord, RoleSummary } from '../types/role';

/** The shop a role action applies to. */
export interface RoleTenant {
  id: string;
}

/** Roles a shop builds from the permission list (STF-07 to STF-09). Roles are not capped (STF-08). */
@Injectable()
export class RoleService {
  constructor(@Inject(ROLE_STORE) private readonly store: RoleStore) {}

  list(tenant: RoleTenant): Promise<RoleSummary[]> {
    return this.store.run(tenant.id, async (tx) => {
      const roles = await this.store.list(tx, tenant.id);
      const assignments = await this.store.assignments(tx, tenant.id);
      return roles.map((role) => ({
        ...role,
        holders: assignments.filter((a) => a.roleId === role.id).length,
      }));
    });
  }

  create(tenant: RoleTenant, input: CreateRoleInput): Promise<RoleRecord> {
    return this.store.run(tenant.id, async (tx) => {
      try {
        return await this.store.insert(tx, tenant.id, input);
      } catch (error) {
        if (error instanceof UniqueViolation) throw this.nameTaken();
        throw error;
      }
    });
  }

  update(tenant: RoleTenant, roleId: string, input: UpdateRoleInput): Promise<RoleRecord> {
    return this.store.run(tenant.id, async (tx) => {
      if (!(await this.store.find(tx, tenant.id, roleId))) throw this.notFound();
      try {
        const updated = await this.store.update(tx, tenant.id, roleId, input);
        if (!updated) throw this.notFound();
        return updated;
      } catch (error) {
        if (error instanceof UniqueViolation) throw this.nameTaken();
        throw error;
      }
    });
  }

  /** A role still held by someone cannot be deleted; the answer names how many hold it (STF-09). */
  remove(tenant: RoleTenant, roleId: string): Promise<void> {
    return this.store.run(tenant.id, async (tx) => {
      if (!(await this.store.find(tx, tenant.id, roleId))) throw this.notFound();
      const holders = await this.store.countHolders(tx, tenant.id, roleId);
      if (holders > 0) {
        throw new ApiError(
          'conflict',
          `This role is held by ${String(holders)} ${holders === 1 ? 'person' : 'people'}. Remove it from them first.`,
          { holders },
        );
      }
      await this.store.remove(tx, tenant.id, roleId);
    });
  }

  private nameTaken(): ApiError {
    return new ApiError('conflict', 'A role with this name already exists.', { field: 'name' });
  }

  private notFound(): ApiError {
    return new ApiError('not_found', 'Role not found.', {});
  }
}
