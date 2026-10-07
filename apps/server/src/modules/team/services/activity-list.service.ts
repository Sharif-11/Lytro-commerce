import { Inject, Injectable } from '@nestjs/common';
import { ActorType, type ListActivityQuery } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { AuditService } from '../../audit/services/audit.service';
import type { ActivityCursor } from '../../audit/types/activity';
import { StaffService } from '../../staff/services/staff.service';
import type { StaffTenant } from '../../staff/services/staff.service';
import type { ActivityPageView } from '../types/activity-view';

// A system or operator entry has no staff row, so its name is fixed (AUD-08: "Platform support", never personal
// details).
const FIXED_NAMES: Partial<Record<string, string>> = {
  [ActorType.System]: 'System',
  [ActorType.PlatformSupport]: 'Platform support',
};

/** The Activity page's list, with each entry's actor name resolved in one batch (AUD-04). */
@Injectable()
export class ActivityListService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(StaffService) private readonly staff: StaffService,
  ) {}

  async list(tenant: StaffTenant, query: ListActivityQuery): Promise<ActivityPageView> {
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const page = await this.audit.list(
      tenant.id,
      {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        actorId: query.actorId,
        action: query.action,
      },
      cursor,
      query.limit,
    );

    const userIds = [...new Set(page.entries.map((e) => e.actorId).filter((id) => id !== null))];
    const names = await this.staff.namesOf(tenant, userIds);

    return {
      entries: page.entries.map((entry) => ({
        id: String(entry.id),
        tenantId: entry.tenantId,
        actorType: entry.actorType,
        actorId: entry.actorId,
        actorName:
          entry.actorId !== null
            ? (names.get(entry.actorId) ?? null)
            : (FIXED_NAMES[entry.actorType] ?? null),
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        result: entry.result,
        summary: entry.summary,
        createdAt: entry.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor ? this.encodeCursor(page.nextCursor) : null,
    };
  }

  private encodeCursor(cursor: ActivityCursor): string {
    return Buffer.from(
      JSON.stringify({ c: cursor.createdAt.toISOString(), i: cursor.id }),
    ).toString('base64url');
  }

  private decodeCursor(raw: string): ActivityCursor {
    try {
      const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'c' in parsed &&
        'i' in parsed &&
        typeof parsed.c === 'string' &&
        typeof parsed.i === 'number'
      ) {
        return { createdAt: new Date(parsed.c), id: parsed.i };
      }
    } catch {
      // Falls through to the same refusal as a structurally wrong cursor.
    }
    throw new ApiError('validation_error', 'This page link is not valid.', { field: 'cursor' });
  }
}
