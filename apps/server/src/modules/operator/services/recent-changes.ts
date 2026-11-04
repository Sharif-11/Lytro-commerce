import { Inject, Injectable } from '@nestjs/common';
import { PlatformAuditAction } from '@lytronix/validators';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import type { RecentChange } from '../types/recent-change';
import { OperatorDirectory } from './operator-directory';

// OPERATOR-CONSOLE-DESIGN §3: what Today's "Recent changes" lists.
const RECENT_CHANGE_ACTIONS = [
  PlatformAuditAction.RateChanged,
  PlatformAuditAction.SettingsChanged,
  PlatformAuditAction.TenantSuspended,
  PlatformAuditAction.PaymentPageSuspended,
];
const RECENT_CHANGES_SHOWN = 6;

/** The last rate and setting changes and suspensions, from the platform audit log (ADM-08's own record). */
@Injectable()
export class RecentChanges {
  constructor(
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
    @Inject(OperatorDirectory) private readonly operators: OperatorDirectory,
  ) {}

  async list(): Promise<RecentChange[]> {
    const entries = await this.audit.recent(RECENT_CHANGE_ACTIONS, RECENT_CHANGES_SHOWN);
    const emails = await this.operators.emailsOf(entries.map((entry) => entry.actorId));
    return entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      at: entry.createdAt,
      by: entry.actorId === null ? null : (emails.get(entry.actorId) ?? null),
      key: entry.summary?.key ?? null,
      oldValue: entry.summary?.oldValue ?? null,
      newValue: entry.summary?.newValue ?? null,
      reason: entry.summary?.reason ?? null,
      shop: entry.shop,
    }));
  }
}
