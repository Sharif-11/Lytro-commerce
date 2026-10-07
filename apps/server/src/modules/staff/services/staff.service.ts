import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import type { PlanLimits } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import type { RoleStore } from '../ports/role-store';
import type { StaffPasswordHasher } from '../ports/staff-password-hasher';
import type { StaffStore } from '../ports/staff-store';
import type { StaffAccounts } from '../ports/staff-accounts';
import { ROLE_STORE, STAFF_ACCOUNTS, STAFF_PASSWORD_HASHER, STAFF_STORE } from '../tokens';
import type { StaffList, StaffMember, StaffRecord } from '../types/staff';

// STF-02: a plan without a staff limit has one seat, the owner's own.
export const DEFAULT_SEATS = 1;

/** The shop a staff action applies to: its id and the plan's limits. */
export interface StaffTenant {
  id: string;
  planLimits: PlanLimits | null;
}

/** Staff accounts: the owner's row, seats, creating, listing and deactivating staff (STF-01 to STF-05). */
@Injectable()
export class StaffService {
  constructor(
    @Inject(STAFF_STORE) private readonly store: StaffStore,
    @Inject(STAFF_PASSWORD_HASHER) private readonly hasher: StaffPasswordHasher,
    @Inject(ROLE_STORE) private readonly roles: RoleStore,
    @Inject(STAFF_ACCOUNTS) private readonly accounts: StaffAccounts,
  ) {}

  createOwner(
    tx: Transaction,
    values: { tenantId: string; phone: string | null; email: string | null; name: string },
  ): Promise<void> {
    return this.store.insertOwner(tx, values);
  }

  list(tenant: StaffTenant): Promise<StaffList> {
    return this.store.run(tenant.id, async (tx) => ({
      seats: {
        used: await this.store.countActive(tx, tenant.id),
        total: this.seatsOf(tenant),
      },
      staff: await this.withRoles(tx, tenant.id, await this.store.listStaff(tx, tenant.id)),
    }));
  }

  async create(
    tenant: StaffTenant,
    input: { phone: string; password: string; name?: string; roleIds: string[] },
  ): Promise<StaffMember> {
    // Hashing is slow, so it runs before the seat lock is taken.
    const passwordHash = await this.hasher.hash(input.password);
    const roleIds = [...new Set(input.roleIds)];
    return this.store.run(tenant.id, async (tx) => {
      await this.requireRoles(tx, tenant.id, roleIds);
      await this.requireSeat(tx, tenant);
      const subscriberId = await this.accounts.reservePhone(tx, input.phone);
      if (subscriberId === null) {
        throw new ApiError('conflict', 'That phone number belongs to a shop owner.', {
          field: 'phone',
        });
      }
      let created: StaffRecord;
      try {
        created = await this.store.insertStaff(tx, {
          tenantId: tenant.id,
          subscriberId,
          phone: input.phone,
          name: input.name ?? null,
          passwordHash,
        });
      } catch (error) {
        if (error instanceof UniqueViolation) {
          throw new ApiError('conflict', 'That phone number is already in use.', {
            field: 'phone',
          });
        }
        throw error;
      }
      for (const roleId of roleIds) {
        await this.roles.assign(tx, tenant.id, created.id, roleId);
      }
      return { ...created, roleIds };
    });
  }

  /** Changes a staff member's status and/or roles. The owner row cannot change (STF-12). */
  update(
    tenant: StaffTenant,
    userId: string,
    input: { active?: boolean; roleIds?: string[] },
    now: Date,
  ): Promise<StaffMember> {
    return this.store.run(tenant.id, async (tx) => {
      const member = await this.store.findStaff(tx, tenant.id, userId);
      if (!member) throw new ApiError('not_found', 'Staff member not found.', {});
      if (member.isOwner) throw new ApiError('forbidden', 'The owner cannot be changed.', {});

      const roleIds = input.roleIds === undefined ? undefined : [...new Set(input.roleIds)];
      if (roleIds !== undefined) {
        await this.requireRoles(tx, tenant.id, roleIds);
        await this.roles.replaceFor(tx, tenant.id, userId, roleIds);
      }

      const active = input.active;
      if (active !== undefined && member.active !== active) {
        if (active) await this.requireSeat(tx, tenant);
        const updated = await this.store.setActive(tx, tenant.id, userId, active);
        if (!updated) throw new ApiError('not_found', 'Staff member not found.', {});
        // STF-05: deactivation ends the member's sessions at once, not at the next sign-in.
        if (!active) await this.store.revokeSessionsOf(tx, userId, now);
      }

      const current = await this.store.findStaff(tx, tenant.id, userId);
      if (!current) throw new ApiError('not_found', 'Staff member not found.', {});
      const [changed] = await this.withRoles(tx, tenant.id, [current]);
      if (!changed) throw new Error('withRoles returned no member');
      return changed;
    });
  }

  /** Every role id must be a role of this shop. */
  private async requireRoles(tx: Transaction, tenantId: string, roleIds: string[]): Promise<void> {
    if (roleIds.length === 0) return;
    const found = await this.roles.findByIds(tx, tenantId, roleIds);
    if (found.length !== roleIds.length) {
      throw new ApiError('validation_error', 'One of the roles does not exist in this shop.', {
        field: 'roleIds',
      });
    }
  }

  /** Adds each member's role ids, read in one query for the whole list. */
  private async withRoles(
    tx: Transaction,
    tenantId: string,
    members: StaffRecord[],
  ): Promise<StaffMember[]> {
    const assignments = await this.roles.assignments(tx, tenantId);
    return members.map((member) => ({
      ...member,
      roleIds: assignments.filter((a) => a.userId === member.id).map((a) => a.roleId),
    }));
  }

  /** Refuses when the shop has no free seat. Takes the seat lock first, so the count is not raced. */
  private async requireSeat(tx: Transaction, tenant: StaffTenant): Promise<void> {
    await this.store.lockSeats(tx, tenant.id);
    const used = await this.store.countActive(tx, tenant.id);
    const total = this.seatsOf(tenant);
    if (used >= total) {
      throw new ApiError(
        'plan_limit_reached',
        `Your plan includes ${String(total)} seat${total === 1 ? '' : 's'}. Upgrade to add more staff.`,
        { seats: total },
      );
    }
  }

  private seatsOf(tenant: StaffTenant): number {
    return tenant.planLimits?.staff ?? DEFAULT_SEATS;
  }
}
