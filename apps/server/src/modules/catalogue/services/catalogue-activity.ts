import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { ActorType, AuditResult, type AuditAction } from '@lytronix/validators';
import { AuditService } from '../../audit/services/audit.service';
import { StaffService } from '../../staff/services/staff.service';
import type { CatalogueActor } from '../types/catalogue';

/**
 * Who a change is recorded against, resolved before the change's own transaction opens: a staff member, unless `type`
 * says it was an API key acting for a shopper (API-21).
 */
export interface ResolvedActor {
  id: string | null;
  ip: string | null;
  type?: ActorType;
}

/**
 * PRD-05, AUD-01, AUD-02: writes a catalogue change to the shop's activity log, inside the change's own
 * transaction so the entry commits with it. The owner acting for themself is named by their staff row.
 */
@Injectable()
export class CatalogueActivity {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StaffService) private readonly staff: StaffService,
  ) {}

  async resolve(tenantId: string, actor: CatalogueActor): Promise<ResolvedActor> {
    return { id: actor.userId ?? (await this.staff.ownerId(tenantId)), ip: actor.ip };
  }

  record(
    tx: Transaction,
    tenantId: string,
    actor: ResolvedActor,
    action: AuditAction,
    target: { type: string; id: string | null },
    summary?: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record(tx, {
      tenantId,
      actorType: actor.type ?? ActorType.User,
      actorId: actor.id,
      action,
      ip: actor.ip,
      targetType: target.type,
      targetId: target.id,
      result: AuditResult.Success,
      summary,
    });
  }
}
