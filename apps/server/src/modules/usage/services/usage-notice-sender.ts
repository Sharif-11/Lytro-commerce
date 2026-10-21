import { Inject, Injectable } from '@nestjs/common';
import {
  AuditResult,
  PlatformActorType,
  PlatformAuditAction,
  TenantState,
} from '@lytronix/validators';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { MailService } from '../../shared/mail/services/mail.service';
import { MessagingService } from '../../shared/messaging/services/messaging.service';
import { StaffService } from '../../staff/services/staff.service';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import { UsageSettings } from '../../usage-warnings/services/usage-settings';
import type { UsageNotice } from '../../usage-warnings/types/usage-notice';
import type { UsageNoticeStore } from '../ports/usage-notice-store';
import { USAGE_NOTICE_CLOCK, USAGE_NOTICE_STORE } from '../tokens';
import { noticeText, operatorAlertText, smsDue } from './usage-notice-text';
import { UsageService } from './usage.service';

/**
 * LIM-01, BND-05, RTE-03, RTE-12: writes and sends a usage notice the warnings queued, with the shop's usage as it is
 * now and what would give it room. By email to the owner (the dashboard's banner reads `GET /usage`), by SMS where
 * `smsDue` says, and a fast-spend alert to every operator too, with a platform audit entry. Each message joins its
 * outbox in one transaction.
 */
@Injectable()
export class UsageNoticeSender {
  constructor(
    @Inject(TenantSummaries) private readonly summaries: TenantSummaries,
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(UsageSettings) private readonly settings: UsageSettings,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(MessagingService) private readonly sms: MessagingService,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
    @Inject(USAGE_NOTICE_STORE) private readonly store: UsageNoticeStore,
    @Inject(USAGE_NOTICE_CLOCK) private readonly clock: () => Date,
  ) {}

  async send(notice: UsageNotice): Promise<void> {
    const tenant = await this.summaries.findById(notice.tenantId);
    if (!tenant || tenant.state === TenantState.Deleted) return;
    const now = this.clock();
    const [usage, owner, grace] = await Promise.all([
      this.usage.usage(tenant, now),
      this.staff.ownerContact(tenant.id),
      this.settings.gracePercent(),
    ]);
    const text = noticeText(notice, tenant.shopName, usage, now, grace);
    const fastSpend = notice.level === 'fast_spend';
    const operators = fastSpend ? await this.store.operatorEmails() : [];
    await this.store.run(async (tx) => {
      if (owner?.email) {
        await this.mail.queueLifecycleNotice(tx, owner.email, text.subject, text.body);
      }
      if (owner?.phone && smsDue(notice, Boolean(owner.email))) {
        await this.sms.queueLifecycleNotice(tx, owner.phone, text.sms);
      }
      if (!fastSpend) return;
      const alert = operatorAlertText(notice, tenant);
      for (const email of operators) {
        await this.mail.queueLifecycleNotice(tx, email, alert.subject, alert.body);
      }
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.System,
        actorId: null,
        action: PlatformAuditAction.UsageFastSpendAlerted,
        targetType: 'tenant',
        targetId: tenant.id,
        result: AuditResult.Success,
        ip: null,
        summary: { requests: notice.used, limit: notice.limit, operators: operators.length },
      });
    });
  }
}
