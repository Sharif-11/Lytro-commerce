import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import type { PlanLimits } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import type { StaffPasswordHasher } from '../ports/staff-password-hasher';
import type { StaffStore } from '../ports/staff-store';
import { STAFF_PASSWORD_HASHER, STAFF_STORE } from '../tokens';
import type { StaffList, StaffRecord } from '../types/staff';

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
      staff: await this.store.listStaff(tx, tenant.id),
    }));
  }

  async create(
    tenant: StaffTenant,
    input: { phone: string; password: string; name?: string },
  ): Promise<StaffRecord> {
    // Hashing is slow, so it runs before the seat lock is taken.
    const passwordHash = await this.hasher.hash(input.password);
    return this.store.run(tenant.id, async (tx) => {
      await this.requireSeat(tx, tenant);
      try {
        return await this.store.insertStaff(tx, {
          tenantId: tenant.id,
          phone: input.phone,
          name: input.name ?? null,
          passwordHash,
        });
      } catch (error) {
        if (error instanceof UniqueViolation) {
          throw new ApiError('conflict', 'That phone number already has a staff account here.', {
            field: 'phone',
          });
        }
        throw error;
      }
    });
  }

  /** Deactivates or reactivates a staff member. The owner row cannot change (STF-12). */
  setActive(tenant: StaffTenant, userId: string, active: boolean, now: Date): Promise<StaffRecord> {
    return this.store.run(tenant.id, async (tx) => {
      const member = await this.store.findStaff(tx, tenant.id, userId);
      if (!member) throw new ApiError('not_found', 'Staff member not found.', {});
      if (member.isOwner) throw new ApiError('forbidden', 'The owner cannot be changed.', {});
      if (member.active === active) return member;

      if (active) await this.requireSeat(tx, tenant);
      const updated = await this.store.setActive(tx, tenant.id, userId, active);
      if (!updated) throw new ApiError('not_found', 'Staff member not found.', {});
      // STF-05: deactivation ends the member's sessions at once, not at the next sign-in.
      if (!active) await this.store.revokeSessionsOf(tx, userId, now);
      return updated;
    });
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
