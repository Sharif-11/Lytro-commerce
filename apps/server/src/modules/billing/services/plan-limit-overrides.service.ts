import { Inject, Injectable } from '@nestjs/common';
import { AuditResult, PlatformActorType, PlatformAuditAction } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import type { PlanLimitOverridesStore } from '../ports/plan-limit-overrides-store';
import { PLAN_LIMIT_OVERRIDES_STORE } from '../tokens';
import type { PlanLimitOverrideRecord } from '../types/plan-assignment';

/** PLN-11: per-tenant limit overrides, each with a required reason, applied over the plan snapshot. */
@Injectable()
export class PlanLimitOverridesService {
  constructor(
    @Inject(PLAN_LIMIT_OVERRIDES_STORE) private readonly store: PlanLimitOverridesStore,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
  ) {}

  async set(
    tenantId: string,
    limitKey: string,
    value: unknown,
    reason: string,
    operatorId: string,
  ): Promise<PlanLimitOverrideRecord> {
    if (reason.trim().length === 0) {
      throw new ApiError('validation_error', 'A reason is required.', { field: 'reason' });
    }
    const row = await this.store.run((tx) =>
      this.store.set(tx, { tenantId, limitKey, value, reason, setBy: operatorId }),
    );
    await this.platformAudit.record({
      actorType: PlatformActorType.Operator,
      actorId: operatorId,
      action: PlatformAuditAction.PlanLimitOverrideSet,
      targetType: 'tenant',
      targetId: tenantId,
      result: AuditResult.Success,
      ip: null,
      summary: { limitKey, value, reason },
    });
    return row;
  }

  listForTenant(tenantId: string): Promise<PlanLimitOverrideRecord[]> {
    return this.store.run((tx) => this.store.listForTenant(tx, tenantId));
  }

  /** Removing the override restores the plan snapshot's own value (PLN-11). */
  async remove(tenantId: string, limitKey: string, operatorId: string): Promise<void> {
    await this.store.run((tx) => this.store.remove(tx, tenantId, limitKey));
    await this.platformAudit.record({
      actorType: PlatformActorType.Operator,
      actorId: operatorId,
      action: PlatformAuditAction.PlanLimitOverrideRemoved,
      targetType: 'tenant',
      targetId: tenantId,
      result: AuditResult.Success,
      ip: null,
      summary: { limitKey },
    });
  }
}
