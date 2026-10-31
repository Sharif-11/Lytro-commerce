import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  AuditResult,
  PlatformActorType,
  PlatformAuditAction,
  type PaymentPageReportStatus,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { AuditService } from '../../audit/services/audit.service';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import type { PaymentSessionStore } from '../ports/payment-session-store';
import { PAYMENT_PAGE_ORIGIN, PAYMENT_SESSION_STORE } from '../tokens';
import type { PaymentPageReportView } from '../types/payment-sessions';

/**
 * TVR-02, TVR-03, ADM-12 (Phase 5 Slice 5.2b): Lytro's watch over the payment pages -- the queue of shoppers' reports,
 * each opened, dismissed or acted on, and a shop's payment page suspended at once (new sessions refused, open pages
 * unavailable) or restored, with its reason. Each step is in the shop's activity log as Lytro support's (AUD-08) and
 * in the platform's own log with the operator, in one transaction.
 */
@Injectable()
export class PaymentPageOversight {
  constructor(
    @Inject(PAYMENT_SESSION_STORE) private readonly store: PaymentSessionStore,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
    @Inject(PAYMENT_PAGE_ORIGIN) private readonly origin: string,
  ) {}

  /** ADM-12: the reports in one state, newest first, each with its shop and the page to open. */
  async list(status: PaymentPageReportStatus, limit: number): Promise<PaymentPageReportView[]> {
    const rows = await this.store.listReports(status, limit);
    return rows.map((row) => ({
      id: row.id,
      shop: {
        id: row.tenantId,
        name: row.shopName,
        slug: row.slug,
        paymentPageSuspended: row.paymentPageSuspendedAt !== null,
      },
      paymentUrl: `${this.origin}/${row.ref}`,
      reason: row.reason,
      note: row.note,
      ip: row.ip,
      status: row.status,
      createdAt: row.createdAt,
      handledAt: row.handledAt,
    }));
  }

  /** ADM-12: an open report dismissed, nothing done to the shop. */
  dismiss(id: string, operatorId: string, ip: string | null): Promise<void> {
    return this.store.run(async (tx) => {
      const report = await this.store.dismissReport(tx, id, operatorId, new Date());
      if (!report) throw new ApiError('not_found', 'PaymentPageReportNotFound', {});
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operatorId,
        action: PlatformAuditAction.PaymentPageReportDismissed,
        targetType: 'payment_page_report',
        targetId: id,
        result: AuditResult.Success,
        ip,
        summary: { tenantId: report.tenantId, reason: report.reason },
      });
    });
  }

  /** TVR-03: the shop's payment page suspended with Lytro's reason; its open reports are acted on with it. */
  suspend(tenantId: string, reason: string, operatorId: string, ip: string | null): Promise<void> {
    return this.store.run(async (tx) => {
      const page = await this.store.paymentPageOf(tx, tenantId);
      if (!page) throw new ApiError('not_found', 'ShopNotFound', {});
      if (page.suspendedAt !== null) {
        throw new ApiError('conflict', 'PaymentPageAlreadySuspended', {});
      }
      const now = new Date();
      await this.store.setPaymentPageSuspension(tx, tenantId, { reason, at: now });
      const actioned = await this.store.actionReports(tx, tenantId, operatorId, now);
      await this.recordBoth(tx, tenantId, operatorId, ip, 'suspended', {
        reason,
        reports: actioned,
      });
    });
  }

  /** TVR-03: the shop's payment page taking payments again. */
  restore(tenantId: string, operatorId: string, ip: string | null): Promise<void> {
    return this.store.run(async (tx) => {
      const page = await this.store.paymentPageOf(tx, tenantId);
      if (!page) throw new ApiError('not_found', 'ShopNotFound', {});
      if (page.suspendedAt === null) throw new ApiError('conflict', 'PaymentPageNotSuspended', {});
      await this.store.setPaymentPageSuspension(tx, tenantId, null);
      await this.recordBoth(tx, tenantId, operatorId, ip, 'restored', {});
    });
  }

  /** AUD-08, ADM-08: the shop's log names Lytro support, never the operator; the platform's log keeps who it was. */
  private async recordBoth(
    tx: Transaction,
    tenantId: string,
    operatorId: string,
    ip: string | null,
    step: 'suspended' | 'restored',
    summary: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record(tx, {
      tenantId,
      actorType: ActorType.PlatformSupport,
      actorId: null,
      action:
        step === 'suspended' ? AuditAction.PaymentPageSuspended : AuditAction.PaymentPageRestored,
      ip,
      targetType: 'tenant',
      targetId: tenantId,
      result: AuditResult.Success,
      summary,
    });
    await this.platformAudit.recordWithin(tx, {
      actorType: PlatformActorType.Operator,
      actorId: operatorId,
      action:
        step === 'suspended'
          ? PlatformAuditAction.PaymentPageSuspended
          : PlatformAuditAction.PaymentPageRestored,
      targetType: 'tenant',
      targetId: tenantId,
      result: AuditResult.Success,
      ip,
      summary,
    });
  }
}
