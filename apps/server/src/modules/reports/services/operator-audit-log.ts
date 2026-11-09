import { Inject, Injectable } from '@nestjs/common';
import type { AuditListRow } from '@lytronix/db';
import type { AuditListQuery } from '@lytronix/validators';
import { DAY_MS, dhakaDayStart } from '../../../common/time';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';

/** A page of the platform audit log, and the cursor for the next one (null at the end). */
export interface AuditLogPage {
  items: AuditListRow[];
  next: number | null;
}

/**
 * ADM-08, D8-11 (Phase 8 Slice 8.4): the operator's list of the platform audit log -- every operator and system action
 * across shops -- filtered by shop, operator, action and Dhaka days, newest first, a page at a time. There is no route
 * that edits or deletes an entry, and the app's database role has no grant to.
 */
@Injectable()
export class OperatorAuditLog {
  constructor(@Inject(PlatformAuditService) private readonly audit: PlatformAuditService) {}

  async list(query: AuditListQuery): Promise<AuditLogPage> {
    const items = await this.audit.list({
      tenantId: query.tenantId,
      actorId: query.actorId,
      action: query.action,
      from: query.dateFrom ? dhakaDayStart(query.dateFrom) : undefined,
      to: query.dateTo ? new Date(dhakaDayStart(query.dateTo).getTime() + DAY_MS) : undefined,
      before: query.cursor,
      limit: query.limit + 1,
    });
    const page = items.slice(0, query.limit);
    return {
      items: page,
      next: items.length > query.limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }
}
