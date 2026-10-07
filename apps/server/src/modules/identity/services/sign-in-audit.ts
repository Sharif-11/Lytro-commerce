import { Inject, Injectable } from '@nestjs/common';
import { ActorType, type AuditAction, type AuditResult } from '@lytronix/validators';
import { AuditService } from '../../audit/services/audit.service';
import { StaffService } from '../../staff/services/staff.service';

/**
 * Logs a sign-in, sign-out or password event (AUD-01). Nothing is logged when there is no shop yet: the Activity
 * page is scoped to one shop (AUD-04, AUD-05), so an account with no shop has nowhere for the entry to appear.
 */
@Injectable()
export class SignInAudit {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StaffService) private readonly staff: StaffService,
  ) {}

  async log(
    tenantId: string | null,
    userId: string | null,
    action: AuditAction,
    result: AuditResult,
    summary?: unknown,
  ): Promise<void> {
    if (tenantId === null) return;
    const actorId = userId ?? (await this.staff.ownerId(tenantId));
    await this.audit.recordStandalone({
      tenantId,
      actorType: ActorType.User,
      actorId,
      action,
      result,
      summary,
    });
  }
}
