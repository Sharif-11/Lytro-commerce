import { Inject, Injectable } from '@nestjs/common';
import {
  ActorType,
  AuditAction,
  AuditResult,
  LAPSED_TENANT_STATES,
  PlatformActorType,
  PlatformAuditAction,
  TenantState,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { DAY_MS } from '../../../common/time';
import { AuditService } from '../../audit/services/audit.service';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { BalanceService } from '../../balance/services/balance.service';
import { TenantCache } from '../../tenancy/services/tenant-cache';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { AddonsStore } from '../ports/addons-store';
import type { ScheduledPlanChangesStore } from '../ports/scheduled-plan-changes-store';
import { ADDONS_STORE, CLOCK, SCHEDULED_PLAN_CHANGES_STORE } from '../tokens';

export interface PlanExtension {
  periodEnd: Date;
  state: TenantState;
  /** Whether the extension brought a lapsed shop back to active. */
  restored: boolean;
}

/**
 * ADM-04, D8-12, D8-32 to D8-34 (Phase 8 Slice 8.3, read agreed 2026-11-08): the operator adds whole days to a shop's
 * current period, with a reason, audited in both logs. A plan or a trial; a shop with no period end has nothing to
 * extend. A lapsed shop comes back to active, as a payment brings it back (LIF-15), and what ends with the plan moves
 * with it: its add-ons (free, like the days) and a change scheduled for that end.
 */
@Injectable()
export class PlanExtensionService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(TenantCache) private readonly tenantCache: TenantCache,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(ADDONS_STORE) private readonly addons: AddonsStore,
    @Inject(SCHEDULED_PLAN_CHANGES_STORE) private readonly changes: ScheduledPlanChangesStore,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  async extend(input: {
    tenantId: string;
    days: number;
    reason: string;
    operatorId: string;
    ip: string | null;
  }): Promise<PlanExtension> {
    const now = this.clock();
    const extension = await this.tenants.runStandalone(async (tx) => {
      // The shop's row, held: the lifecycle tick, a purchase and a second extension each wait, so none works from an end
      // this one has moved.
      await this.tenants.lockBalanceForUpdate(tx, input.tenantId);
      const info = await this.tenants.findBillingInfo(tx, input.tenantId);
      if (!info) throw new ApiError('not_found', 'ShopNotFound', {});
      if (info.state === TenantState.Deleted) {
        throw new ApiError('conflict', 'ShopAlreadyDeleted', {});
      }
      // D8-37: an extension brings a shop back only until its deletion begins; from then it can't be undone.
      if (info.deletedAt !== null) throw new ApiError('conflict', 'ShopDeletionStarted', {});
      const from = info.periodEnd;
      if (from === null || info.state === TenantState.PayAsYouGo) {
        throw new ApiError('conflict', 'NoPeriodToExtend', {});
      }
      const to = new Date(from.getTime() + input.days * DAY_MS);
      if (to.getTime() <= now.getTime()) {
        throw new ApiError('conflict', 'ExtensionStillEnded', {});
      }
      const restored = LAPSED_TENANT_STATES.includes(info.state);
      await this.tenants.extendPeriod(tx, input.tenantId, to, restored);
      // LIF-15: back as a payment brings it. Frozen is one flag for two reasons, so a shop the operator also suspended
      // stays frozen until the operator restores it (LIF-24).
      if (restored && info.suspendedAt === null) await this.balance.unfreeze(tx, input.tenantId);
      await this.addons.moveEndingWith(tx, input.tenantId, from, to);
      await this.changes.moveEffectiveAt(tx, input.tenantId, from, to);
      const summary = { days: input.days, from, to, reason: input.reason, restored };
      await this.audit.record(tx, {
        tenantId: input.tenantId,
        actorType: ActorType.PlatformSupport,
        actorId: null, // AUD-08: never the operator's own id; the platform audit log keeps who it was.
        action: AuditAction.PlanExtended,
        ip: input.ip,
        targetType: 'tenant',
        targetId: input.tenantId,
        result: AuditResult.Success,
        summary,
      });
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: input.operatorId,
        action: PlatformAuditAction.PlanExtended,
        targetType: 'tenant',
        targetId: input.tenantId,
        result: AuditResult.Success,
        ip: input.ip,
        summary,
      });
      return {
        periodEnd: to,
        state: restored ? TenantState.Active : info.state,
        restored,
      };
    });
    this.tenantCache.invalidateTenant(input.tenantId); // TEN-27: within 5s, not the cache's own 60s TTL.
    return extension;
  }
}
