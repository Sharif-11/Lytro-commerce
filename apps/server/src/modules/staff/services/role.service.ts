import { Inject, Injectable } from '@nestjs/common';
import {
  ActorType,
  AuditAction,
  AuditResult,
  type CreateRoleInput,
  type UpdateRoleInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { AuditService } from '../../audit/services/audit.service';
import type { RoleStore } from '../ports/role-store';
import { StaffService } from './staff.service';
import { ROLE_STORE } from '../tokens';
import type { RoleRecord, RoleSummary } from '../types/role';

/** The shop a role action applies to. */
export interface RoleTenant {
  id: string;
}

/** Roles a shop builds from the permission list (STF-07 to STF-09). Roles are not capped (STF-08). */
@Injectable()
export class RoleService {
  constructor(
    @Inject(ROLE_STORE) private readonly store: RoleStore,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StaffService) private readonly staff: StaffService,
  ) {}

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

  async create(
    tenant: RoleTenant,
    input: CreateRoleInput,
    actingUserId: string | null,
  ): Promise<RoleRecord> {
    const created = await this.store.run(tenant.id, async (tx) => {
      try {
        return await this.store.insert(tx, tenant.id, input);
      } catch (error) {
        if (error instanceof UniqueViolation) throw this.nameTaken();
        throw error;
      }
    });
    await this.writeActivity(tenant.id, actingUserId, AuditAction.RoleCreated, created.id, input);
    return created;
  }

  async update(
    tenant: RoleTenant,
    roleId: string,
    input: UpdateRoleInput,
    actingUserId: string | null,
  ): Promise<RoleRecord> {
    const updated = await this.store.run(tenant.id, async (tx) => {
      if (!(await this.store.find(tx, tenant.id, roleId))) throw this.notFound();
      try {
        const result = await this.store.update(tx, tenant.id, roleId, input);
        if (!result) throw this.notFound();
        return result;
      } catch (error) {
        if (error instanceof UniqueViolation) throw this.nameTaken();
        throw error;
      }
    });
    await this.writeActivity(tenant.id, actingUserId, AuditAction.RoleUpdated, roleId, input);
    return updated;
  }

  /** A role still held by someone cannot be deleted; the answer names how many hold it (STF-09). */
  async remove(tenant: RoleTenant, roleId: string, actingUserId: string | null): Promise<void> {
    await this.store.run(tenant.id, async (tx) => {
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
    await this.writeActivity(tenant.id, actingUserId, AuditAction.RoleDeleted, roleId);
  }

  private nameTaken(): ApiError {
    return new ApiError('conflict', 'A role with this name already exists.', { field: 'name' });
  }

  private notFound(): ApiError {
    return new ApiError('not_found', 'Role not found.', {});
  }

  /** Writes an activity log entry for a role action (AUD-01), named the same way StaffService names its own. */
  private async writeActivity(
    tenantId: string,
    actingUserId: string | null,
    action: AuditAction,
    targetId: string,
    summary?: unknown,
  ): Promise<void> {
    const actorId = actingUserId ?? (await this.staff.ownerId(tenantId));
    await this.audit.recordStandalone({
      tenantId,
      actorType: ActorType.User,
      actorId,
      action,
      targetType: 'role',
      targetId,
      result: AuditResult.Success,
      summary,
    });
  }
}
