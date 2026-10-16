import { Inject, Injectable } from '@nestjs/common';
import { ActorType, AuditAction, AuditResult, TenantState } from '@lytronix/validators';
import { AuditService } from '../../audit/services/audit.service';
import { TenantService } from '../../tenancy/services/tenant.service';
import { CLOCK } from '../tokens';

/**
 * TRL-07: converts a trial that reached its `periodEnd` with no purchase into pay-as-you-go, with no data
 * loss -- nothing here ever touches a product, order or customer row, only the tenant's own plan/state
 * columns. Filtering by `state = Trial` is what excludes a tenant who already bought a plan during their
 * trial (TRL-06): a purchase moves state to Active before this ever runs, so there is nothing else to check.
 *
 * Called from `LifecycleTickWorker` on the same recurring 5-minute tick as `LifecycleService.runTick`
 * (D2-6) -- also callable directly, the SRS's own "JOB" verification type.
 */
@Injectable()
export class TrialLifecycleService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  /** Returns how many trials were converted, for the caller (eventually slice 7's job) to log/report. */
  async convertExpiredTrials(): Promise<number> {
    const now = this.clock();
    const payg = await this.tenants.runStandalone((tx) => this.tenants.findPayAsYouGoPlan(tx));
    if (!payg) throw new Error('the Pay-as-you-go plan is not seeded');

    const expiredIds = await this.tenants.runStandalone((tx) =>
      this.tenants.findExpiredTrialIds(tx, now),
    );

    for (const tenantId of expiredIds) {
      await this.tenants.runStandalone(async (tx) => {
        await this.tenants.applyPlanAssignment(tx, tenantId, {
          planId: payg.id,
          planSnapshot: payg.limits,
          periodStart: now,
          // PYG-08: pay-as-you-go has no billing period to lapse from.
          periodEnd: null,
          state: TenantState.PayAsYouGo,
        });
        await this.audit.record(tx, {
          tenantId,
          actorType: ActorType.System,
          actorId: null,
          action: AuditAction.LifecycleStateChanged,
          targetType: 'tenant',
          targetId: tenantId,
          result: AuditResult.Success,
          summary: { from: TenantState.Trial, to: TenantState.PayAsYouGo, reason: 'trial_ended' },
        });
      });
    }

    return expiredIds.length;
  }
}
