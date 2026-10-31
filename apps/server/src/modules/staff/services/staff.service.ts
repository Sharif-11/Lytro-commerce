import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  AuditResult,
  limitOf,
  OWNER_ONLY_PERMISSIONS,
  type PlanLimits,
  ServerFieldProblemCode,
  UsageMetric,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { AuditService } from '../../audit/services/audit.service';
import { UsageWarnings } from '../../usage-warnings/services/usage-warnings';
import type { RoleStore } from '../ports/role-store';
import type { StaffPasswordHasher } from '../ports/staff-password-hasher';
import type { StaffShop, StaffStore } from '../ports/staff-store';
import type { StaffAccounts } from '../ports/staff-accounts';
import { ROLE_STORE, STAFF_ACCOUNTS, STAFF_PASSWORD_HASHER, STAFF_STORE } from '../tokens';
import type { StaffCredentials, StaffList, StaffMember, StaffRecord } from '../types/staff';
import type { OwnerContact } from '../types/owner-contact';

// LOG-02, AUD-02: a phone number never appears whole in a log or an activity entry, even to someone with
// audit:read on this shop — only enough to tell entries apart at a glance.
function maskPhone(phone: string | null): string | null {
  return phone === null ? null : `***${phone.slice(-4)}`;
}

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
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(UsageWarnings) private readonly warnings: UsageWarnings,
  ) {}

  /** The names of several staff rows at once, keyed by id (no N+1 per audit entry). */
  namesOf(tenant: StaffTenant, userIds: string[]): Promise<Map<string, string | null>> {
    return this.store.run(tenant.id, (tx) => this.namesWithin(tx, tenant.id, userIds));
  }

  /** The same, inside a transaction the caller already holds (an order's calls and history, ORD-14). */
  async namesWithin(
    tx: Transaction,
    tenantId: string,
    userIds: string[],
  ): Promise<Map<string, string | null>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.store.findByIds(tx, tenantId, [...new Set(userIds)]);
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  /**
   * The signed-in person's own row in this shop -- the owner's when there is no staff id: their name (null when
   * unnamed) and the phone their staff sign-in uses (TEN-31).
   */
  personOf(
    tenant: StaffTenant,
    userId: string | null,
  ): Promise<{ name: string | null; phone: string | null }> {
    return this.store.run(tenant.id, async (tx) => {
      const row =
        userId === null
          ? await this.store.findOwner(tx, tenant.id)
          : (await this.store.findByIds(tx, tenant.id, [userId]))[0];
      return { name: row?.name ?? null, phone: row?.phone ?? null };
    });
  }

  /**
   * The names of the roles a staff member holds in the shop, for the Menu's shop card (Slice 11.6); none for the owner,
   * who holds every permission without a role.
   */
  roleNamesOf(tenant: StaffTenant, userId: string | null): Promise<string[]> {
    if (userId === null) return Promise.resolve([]);
    return this.store.run(tenant.id, async (tx) => {
      const held = (await this.roles.assignments(tx, tenant.id))
        .filter((assignment) => assignment.userId === userId)
        .map((assignment) => assignment.roleId);
      const roles = await this.roles.findByIds(tx, tenant.id, held);
      return roles.map((role) => role.name).sort((a, b) => a.localeCompare(b));
    });
  }

  /** The owner's own staff row id, for an audit entry the owner performs (AUD-02). */
  ownerId(tenantId: string): Promise<string | null> {
    return this.store.run(
      tenantId,
      async (tx) => (await this.store.findOwner(tx, tenantId))?.id ?? null,
    );
  }

  /** LIF-18/24, PYG-21: the owner's own contact, for a platform-sent notice. */
  ownerContact(tenantId: string): Promise<OwnerContact | null> {
    return this.store.run(tenantId, (tx) => this.ownerContactIn(tx, tenantId));
  }

  /**
   * The same, inside the caller's transaction -- for a write that queues a notice to the owner in its own
   * transaction (BIL-05, BAL-13), so it never needs a second connection while it holds row locks.
   */
  ownerContactIn(tx: Transaction, tenantId: string): Promise<OwnerContact | null> {
    return this.store.findOwnerContact(tx, tenantId);
  }

  /** TEN-31, AUTH-31: the shop this person is staff in, if any (STF-06: at most one). */
  staffShopOf(subscriberId: string): Promise<StaffShop | null> {
    return this.store.runAcrossShops((tx) => this.staffShopOfIn(tx, subscriberId));
  }

  /** AUTH-31: the shop of the staff member who signs in with this phone, found with no shop to start from. */
  staffShopByPhone(phone: string): Promise<StaffShop | null> {
    return this.store.runAcrossShops(async (tx) => {
      const subscriberId = await this.accounts.findSubscriberByPhone(tx, phone);
      return subscriberId === null ? null : this.store.findStaffShop(tx, subscriberId);
    });
  }

  /** The same, inside the caller's transaction. */
  staffShopOfIn(tx: Transaction, subscriberId: string): Promise<StaffShop | null> {
    return this.store.findStaffShop(tx, subscriberId);
  }

  /** Runs work in a transaction with the shop's tenant context set. */
  inShop<T>(tenant: StaffTenant, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.store.run(tenant.id, work);
  }

  /** The permissions a staff member holds right now, or null when the member is missing or inactive (STF-05, STF-10). */
  permissionsOf(tenant: StaffTenant, userId: string): Promise<string[] | null> {
    return this.store.run(tenant.id, async (tx) => {
      const member = await this.store.findStaff(tx, tenant.id, userId);
      if (!member || !member.active) return null;
      // WAL-07, STF-07 (amended 2026-10-31): a role never holds the owner's own permissions, whatever it stores.
      const held = await this.roles.permissionsOf(tx, tenant.id, userId);
      return held.filter(
        (permission) => !(OWNER_ONLY_PERMISSIONS as readonly string[]).includes(permission),
      );
    });
  }

  /** The sign-in details of the shop's staff member with this phone, or null. */
  credentialsByPhone(tenant: StaffTenant, phone: string): Promise<StaffCredentials | null> {
    return this.store.run(tenant.id, (tx) =>
      this.store.findCredentialsByPhone(tx, tenant.id, phone),
    );
  }

  createOwner(
    tx: Transaction,
    values: { tenantId: string; phone: string | null; email: string | null; name: string },
  ): Promise<void> {
    return this.store.insertOwner(tx, values);
  }

  /** LIM-02, STF-02: the seats in use, the owner's among them. */
  seatsUsed(tenantId: string): Promise<number> {
    return this.store.run(tenantId, (tx) => this.store.countActive(tx, tenantId));
  }

  /** STF-13, AUTH-31: the active staff who have not yet chosen their own password -- a Home row. */
  countWithoutPassword(tenantId: string): Promise<number> {
    return this.store.run(tenantId, (tx) => this.store.countMustSetPassword(tx, tenantId));
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
    actingUserId: string | null,
    ip?: string | null,
  ): Promise<StaffMember> {
    // Hashing is slow, so it runs before the seat lock is taken.
    const passwordHash = await this.hasher.hash(input.password);
    const roleIds = [...new Set(input.roleIds)];
    const created = await this.store.run(tenant.id, async (tx) => {
      await this.requireRoles(tx, tenant.id, roleIds);
      await this.requireSeat(tx, tenant);
      const subscriberId = await this.accounts.reservePhone(tx, input.phone);
      if (subscriberId === null) {
        throw new FieldsError(
          [
            {
              field: 'phone',
              problem: ServerFieldProblemCode.Taken,
              messageKey: 'StaffPhoneBelongsToOwner',
            },
          ],
          'conflict',
        );
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
          throw new FieldsError(
            [
              {
                field: 'phone',
                problem: ServerFieldProblemCode.Taken,
                messageKey: 'StaffPhoneInUse',
              },
            ],
            'conflict',
          );
        }
        throw error;
      }
      for (const roleId of roleIds) {
        await this.roles.assign(tx, tenant.id, created.id, roleId);
      }
      return { ...created, roleIds };
    });
    await this.writeActivity(
      tenant.id,
      actingUserId,
      AuditAction.StaffCreated,
      created.id,
      { phone: maskPhone(created.phone), roleIds },
      ip,
    );
    return created;
  }

  /** Changes a staff member's status, roles and/or name. The owner row cannot change (STF-12). */
  async update(
    tenant: StaffTenant,
    userId: string,
    input: { active?: boolean; roleIds?: string[]; name?: string | null },
    now: Date,
    actingUserId: string | null,
    ip?: string | null,
  ): Promise<StaffMember> {
    const { member: changed, activityAction } = await this.store.run(tenant.id, async (tx) => {
      const member = await this.store.findStaff(tx, tenant.id, userId);
      if (!member) throw new ApiError('not_found', 'StaffNotFound', {});
      if (member.isOwner) throw new ApiError('forbidden', 'OwnerCannotBeChanged', {});

      let activityAction: AuditAction | null = null;
      const roleIds = input.roleIds === undefined ? undefined : [...new Set(input.roleIds)];
      if (roleIds !== undefined) {
        await this.requireRoles(tx, tenant.id, roleIds);
        await this.roles.replaceFor(tx, tenant.id, userId, roleIds);
        activityAction = AuditAction.StaffUpdated;
      }

      if (input.name !== undefined && input.name !== member.name) {
        await this.store.setName(tx, tenant.id, userId, input.name);
        activityAction = AuditAction.StaffUpdated;
      }

      const active = input.active;
      if (active !== undefined && member.active !== active) {
        if (active) await this.requireSeat(tx, tenant);
        const updated = await this.store.setActive(tx, tenant.id, userId, active);
        if (!updated) throw new ApiError('not_found', 'StaffNotFound', {});
        // STF-05: deactivation ends the member's sessions at once, not at the next sign-in.
        if (!active) await this.store.revokeSessionsOf(tx, userId, now);
        // A status change is reported as itself, even alongside a role change in the same call.
        activityAction = active ? AuditAction.StaffReactivated : AuditAction.StaffDeactivated;
      }

      const current = await this.store.findStaff(tx, tenant.id, userId);
      if (!current) throw new ApiError('not_found', 'StaffNotFound', {});
      const [withRoles] = await this.withRoles(tx, tenant.id, [current]);
      if (!withRoles) throw new Error('withRoles returned no member');
      return { member: withRoles, activityAction };
    });
    if (activityAction) {
      await this.writeActivity(tenant.id, actingUserId, activityAction, userId, input, ip);
    }
    return changed;
  }

  /** The owner sets a new password for a staff member. They must choose their own at the next sign-in (STF-13). */
  async resetPassword(
    tenant: StaffTenant,
    userId: string,
    newPassword: string,
    now: Date,
    actingUserId: string | null,
    ip?: string | null,
  ): Promise<void> {
    const passwordHash = await this.hasher.hash(newPassword);
    await this.store.run(tenant.id, async (tx) => {
      const member = await this.store.findStaff(tx, tenant.id, userId);
      if (!member) throw new ApiError('not_found', 'StaffNotFound', {});
      if (member.isOwner) throw new ApiError('forbidden', 'OwnerCannotBeChanged', {});
      await this.store.setPassword(tx, tenant.id, userId, passwordHash, true);
      // The old sessions end, so the next sign-in is the one that sets the new password.
      await this.store.revokeSessionsOf(tx, userId, now);
    });
    await this.writeActivity(
      tenant.id,
      actingUserId,
      AuditAction.PasswordReset,
      userId,
      undefined,
      ip,
    );
  }

  /**
   * A staff member changes their own password. A pending change (set by the owner) needs no current password; any
   * other change needs the current one (AUTH-20).
   */
  async changePassword(
    tenantId: string,
    userId: string,
    input: { currentPassword?: string; newPassword: string },
    pending: boolean,
    ip?: string | null,
  ): Promise<void> {
    const passwordHash = await this.hasher.hash(input.newPassword);
    await this.store.run(tenantId, async (tx) => {
      const creds = await this.store.findCredentialsById(tx, tenantId, userId);
      if (!creds || !creds.active || creds.isOwner) {
        throw new ApiError('not_found', 'StaffNotFound', {});
      }
      if (!pending) {
        const current = input.currentPassword;
        const matches =
          current !== undefined && creds.passwordHash !== null
            ? await this.hasher.verify(current, creds.passwordHash)
            : false;
        if (!matches) {
          throw new FieldsError([
            {
              field: 'currentPassword',
              problem: ServerFieldProblemCode.Incorrect,
              messageKey: 'CurrentPasswordWrong',
            },
          ]);
        }
      }
      await this.store.setPassword(tx, tenantId, userId, passwordHash, false);
    });
    // A self-change is always by the member it changes.
    await this.writeActivity(tenantId, userId, AuditAction.PasswordChanged, userId, undefined, ip);
  }

  /** Every role id must be a role of this shop. */
  private async requireRoles(tx: Transaction, tenantId: string, roleIds: string[]): Promise<void> {
    if (roleIds.length === 0) return;
    const found = await this.roles.findByIds(tx, tenantId, roleIds);
    if (found.length !== roleIds.length) {
      throw new FieldsError([
        { field: 'roleIds', problem: ServerFieldProblemCode.NotFound, messageKey: 'RoleNotInShop' },
      ]);
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

  /**
   * DWN-08: resolves seat overage against a plan limit -- the owner and the earliest-created active staff
   * stay active, up to `limit`; the rest are deactivated (not deleted), their sessions ended at once. A
   * system-caused transition (D2-5): the owner already authorized this when they scheduled the downgrade.
   */
  async enforceSeatLimit(tenant: StaffTenant, limit: number | null, now: Date): Promise<string[]> {
    if (limit === null) return []; // PLN-19: unlimited seats, nothing to deactivate.
    const deactivated = await this.store.run(tenant.id, async (tx) => {
      const staff = await this.store.listStaff(tx, tenant.id);
      const active = staff.filter((member) => member.active);
      if (active.length <= limit) return [];
      const owner = active.find((member) => member.isOwner);
      const others = active
        .filter((member) => !member.isOwner)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const keepSlots = Math.max(owner ? limit - 1 : limit, 0);
      const keep = new Set(others.slice(0, keepSlots).map((member) => member.id));
      const excess = others.filter((member) => !keep.has(member.id));
      for (const member of excess) {
        await this.store.setActive(tx, tenant.id, member.id, false);
        await this.store.revokeSessionsOf(tx, member.id, now);
      }
      return excess.map((member) => member.id);
    });
    for (const userId of deactivated) {
      await this.audit.recordStandalone({
        tenantId: tenant.id,
        actorType: ActorType.System,
        actorId: null,
        action: AuditAction.StaffDeactivated,
        targetType: 'staff',
        targetId: userId,
        result: AuditResult.Success,
        summary: { reason: 'downgrade_seat_limit', limit },
      });
    }
    return deactivated;
  }

  /** LIF-19: the day-60 deletion job's staff/roles step -- deletes every role assignment, role and staff row. */
  async deleteAllForTenant(tenant: StaffTenant): Promise<void> {
    await this.store.run(tenant.id, async (tx) => {
      await this.roles.deleteAllForTenant(tx, tenant.id);
      await this.store.deleteAllForTenant(tx, tenant.id);
    });
  }

  /** Refuses when the shop has no free seat. Takes the seat lock first, so the count is not raced. */
  private async requireSeat(tx: Transaction, tenant: StaffTenant): Promise<void> {
    await this.store.lockSeats(tx, tenant.id);
    const total = this.seatsOf(tenant);
    if (total === null) return; // PLN-19: unlimited seats never refuse.
    const used = await this.store.countActive(tx, tenant.id);
    if (used >= total) {
      throw new ApiError(
        'plan_limit_reached',
        'SeatLimitReached',
        { metric: UsageMetric.Seats, seats: total },
        undefined,
        { seats: total },
      );
    }
    // LIM-01: the seat this takes, warned of with its write.
    await this.warnings.check(tx, {
      tenantId: tenant.id,
      metric: UsageMetric.Seats,
      used: used + 1,
      limit: total,
    });
  }

  // PLN-19: null means unlimited seats; a plan that sets none has the owner's one (STF-02).
  private seatsOf(tenant: StaffTenant): number | null {
    return limitOf(tenant.planLimits, 'staff');
  }

  /**
   * Writes an activity log entry for a staff action (AUD-01). `actingUserId` is the session's own staff id, or null
   * for the owner's own session, in which case the owner's row is looked up to name as the actor.
   */
  private async writeActivity(
    tenantId: string,
    actingUserId: string | null,
    action: AuditAction,
    targetId: string | null,
    summary?: unknown,
    ip?: string | null,
  ): Promise<void> {
    const actorId = actingUserId ?? (await this.ownerId(tenantId));
    await this.audit.recordStandalone({
      tenantId,
      actorType: ActorType.User,
      actorId,
      action,
      ip: ip ?? null,
      targetType: 'staff',
      targetId,
      result: AuditResult.Success,
      summary,
    });
  }
}
