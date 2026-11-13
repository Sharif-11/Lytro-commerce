import { Inject, Injectable } from '@nestjs/common';
import type { SelectReconciliationDifference } from '@lytronix/db';
import {
  AuditResult,
  PlatformActorType,
  PlatformAuditAction,
  type ReconciliationListQuery,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import type { ReconciliationStore } from '../ports/reconciliation-store';
import { RECONCILIATION_CLOCK, RECONCILIATION_STORE } from '../tokens';

// A difference's id is a uuid; anything else names none.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DAT-52: a difference as kept, for the operator's routes. */
export type ReconciliationDifferenceRecord = SelectReconciliationDifference;

/** The operator resolving a difference, as the platform audit log names them (ADM-08). */
export interface ResolvingOperator {
  operatorId: string;
  ip: string | null;
}

/**
 * DAT-52 (Phase 9 Slice 9.5): the operator's look at what the daily reconciliation found, and their word on what was done
 * about each difference -- kept with it, and in the platform audit log in the same transaction (ADM-08).
 */
@Injectable()
export class ReconciliationDifferences {
  constructor(
    @Inject(RECONCILIATION_STORE) private readonly store: ReconciliationStore,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
    @Inject(RECONCILIATION_CLOCK) private readonly clock: () => Date,
  ) {}

  list(query: ReconciliationListQuery): Promise<{
    rows: SelectReconciliationDifference[];
    total: number;
  }> {
    return this.store.list(
      { state: query.state, day: query.day, kind: query.kind },
      { offset: (query.page - 1) * query.limit, limit: query.limit },
    );
  }

  resolve(
    id: string,
    note: string,
    operator: ResolvingOperator,
  ): Promise<SelectReconciliationDifference> {
    if (!UUID.test(id)) {
      return Promise.reject(new ApiError('not_found', 'ReconciliationDifferenceNotFound', {}));
    }
    return this.store.run(async (tx) => {
      const held = await this.store.findDifference(tx, id);
      if (!held) throw new ApiError('not_found', 'ReconciliationDifferenceNotFound', {});
      const resolved = await this.store.resolve(tx, id, {
        note,
        resolvedBy: operator.operatorId,
        resolvedAt: this.clock(),
      });
      if (!resolved) throw new ApiError('conflict', 'ReconciliationDifferenceResolvedAlready', {});
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operator.operatorId,
        action: PlatformAuditAction.ReconciliationDifferenceResolved,
        targetType: 'reconciliation_difference',
        targetId: id,
        result: AuditResult.Success,
        ip: operator.ip,
        summary: { day: held.day, kind: held.kind, subject: held.subject, note },
      });
      return resolved;
    });
  }
}
