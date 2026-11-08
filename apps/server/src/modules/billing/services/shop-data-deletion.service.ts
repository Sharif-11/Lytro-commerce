import { Inject, Injectable } from '@nestjs/common';
import {
  ActorType,
  AuditAction,
  AuditResult,
  PlatformActorType,
  PlatformAuditAction,
  QueueName,
  ServerFieldProblemCode,
  TenantState,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { AuditService } from '../../audit/services/audit.service';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { BalanceService } from '../../balance/services/balance.service';
import type { JobQueue } from '../../shared/queue/ports/job-queue';
import { JOB_QUEUE } from '../../shared/queue/tokens';
import { TenantCache } from '../../tenancy/services/tenant-cache';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import { TenantService } from '../../tenancy/services/tenant.service';
import { CLOCK } from '../tokens';

/**
 * ADM-13, D8-13, D8-37 (Phase 8 Slice 8.3, read agreed 2026-11-08): deleting a shop's data when the seller asks. The
 * operator types the shop's address and gives a reason, and no suspension comes first. The shop goes offline at once, as
 * archived, which is also the state LIF-19's erasing triggers require, and a job runs the same steps as the day-60
 * deletion. The account, its balance and the billing records stay. It can't be undone once the job has run.
 */
@Injectable()
export class ShopDataDeletionService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(TenantSummaries) private readonly summaries: TenantSummaries,
    @Inject(TenantCache) private readonly tenantCache: TenantCache,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
    @Inject(JOB_QUEUE) private readonly jobQueue: JobQueue,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  async request(input: {
    tenantId: string;
    confirmAddress: string;
    reason: string;
    operatorId: string;
    ip: string | null;
  }): Promise<void> {
    const shop = await this.summaries.findById(input.tenantId);
    if (!shop) throw new ApiError('not_found', 'ShopNotFound', {});
    if (shop.state === TenantState.Deleted) {
      throw new ApiError('conflict', 'ShopAlreadyDeleted', {});
    }
    if (input.confirmAddress.trim().toLowerCase() !== shop.slug) {
      throw new FieldsError([
        {
          field: 'confirmAddress',
          problem: ServerFieldProblemCode.OutOfRange,
          messageKey: 'ConfirmAddressWrong',
        },
      ]);
    }
    const now = this.clock();
    await this.tenants.runStandalone(async (tx) => {
      await this.tenants.lockBalanceForUpdate(tx, shop.id);
      const info = await this.tenants.findBillingInfo(tx, shop.id);
      if (!info || info.state === TenantState.Deleted) {
        throw new ApiError('conflict', 'ShopAlreadyDeleted', {});
      }
      if (info.state !== TenantState.Archived) {
        await this.tenants.setLifecycleState(tx, shop.id, TenantState.Archived, now);
        await this.balance.freeze(tx, shop.id);
        await this.audit.record(tx, {
          tenantId: shop.id,
          actorType: ActorType.PlatformSupport,
          actorId: null,
          action: AuditAction.LifecycleStateChanged,
          ip: input.ip,
          targetType: 'tenant',
          targetId: shop.id,
          result: AuditResult.Success,
          summary: {
            from: info.state,
            to: TenantState.Archived,
            reason: 'data_deletion_requested',
          },
        });
      }
      await this.audit.record(tx, {
        tenantId: shop.id,
        actorType: ActorType.PlatformSupport,
        actorId: null, // AUD-08: never the operator's own id; the platform audit log keeps who it was.
        action: AuditAction.ShopDataDeletionRequested,
        ip: input.ip,
        targetType: 'tenant',
        targetId: shop.id,
        result: AuditResult.Success,
        summary: { reason: input.reason },
      });
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: input.operatorId,
        action: PlatformAuditAction.ShopDataDeletionRequested,
        targetType: 'tenant',
        targetId: shop.id,
        result: AuditResult.Success,
        ip: input.ip,
        summary: { reason: input.reason, from: info.state },
      });
      await this.jobQueue.enqueue(tx, QueueName.ShopDataDeletion, { tenantId: shop.id });
    });
    this.tenantCache.invalidateTenant(shop.id); // TEN-27: offline within 5s, not the cache's own 60s TTL.
  }
}
