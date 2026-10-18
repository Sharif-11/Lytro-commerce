import { Inject, Injectable } from '@nestjs/common';
import {
  ActorType,
  AuditAction,
  AuditResult,
  PlatformActorType,
  PlatformAuditAction,
  type PlanLimits,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { AuditService } from '../../audit/services/audit.service';
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
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async set(
    tenantId: string,
    limitKey: string,
    value: unknown,
    reason: string,
    operatorId: string,
  ): Promise<PlanLimitOverrideRecord> {
    if (reason.trim().length === 0) {
      throw new ApiError('validation_error', 'ReasonRequired', { field: 'reason' });
    }
    const row = await this.store.run(async (tx) => {
      const saved = await this.store.set(tx, {
        tenantId,
        limitKey,
        value,
        reason,
        setBy: operatorId,
      });
      // AUD-08, ADM-04: shown to the shop as "Platform support", with the reason.
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.PlatformSupport,
        actorId: null,
        action: AuditAction.PlanLimitOverrideSet,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary: { limitKey, value, reason },
      });
      return saved;
    });
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

  /**
   * PLN-11: "the override applies over the snapshot" -- every enforcement or display path that reads a
   * tenant's plan limits must call this instead of reading the snapshot directly, so a per-tenant override
   * actually takes effect rather than only existing in the operator's own CRUD screen.
   */
  async effectiveLimits(tenantId: string, snapshot: PlanLimits | null): Promise<PlanLimits | null> {
    const overrides = await this.listForTenant(tenantId);
    if (overrides.length === 0) return snapshot;
    const merged: Record<string, unknown> = { ...(snapshot ?? {}) };
    for (const override of overrides) {
      merged[override.limitKey] = override.value;
    }
    return merged;
  }

  /** Removing the override restores the plan snapshot's own value (PLN-11). */
  async remove(tenantId: string, limitKey: string, operatorId: string): Promise<void> {
    await this.store.run(async (tx) => {
      await this.store.remove(tx, tenantId, limitKey);
      await this.audit.record(tx, {
        tenantId,
        actorType: ActorType.PlatformSupport,
        actorId: null,
        action: AuditAction.PlanLimitOverrideRemoved,
        targetType: 'tenant',
        targetId: tenantId,
        result: AuditResult.Success,
        summary: { limitKey },
      });
    });
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
