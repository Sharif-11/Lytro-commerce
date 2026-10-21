import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditResult,
  FieldProblemCode,
  PlatformActorType,
  PlatformAuditAction,
  ServerFieldProblemCode,
  type CreateAddonInput,
  type UpdateAddonInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import type { AddonsStore } from '../ports/addons-store';
import { ADDONS_STORE, CLOCK } from '../tokens';
import type { AddonRecord } from '../types/addon';
import type { PlanOperator } from './plans.service';

/**
 * PLN-13: the add-on catalogue, editable data. ADM-08: every operator change is in the platform audit log, committed
 * with it or not at all. A new price applies to the next purchase; what was bought keeps its own.
 */
@Injectable()
export class AddonCatalogueService {
  constructor(
    @Inject(ADDONS_STORE) private readonly store: AddonsStore,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  /** The operator's list, retired items too. */
  listAll(): Promise<AddonRecord[]> {
    return this.store.run((tx) => this.store.list(tx, true));
  }

  async create(input: CreateAddonInput, operator: PlanOperator): Promise<AddonRecord> {
    const values = { ...input, price: String(input.price) };
    try {
      return await this.store.run(async (tx) => {
        const created = await this.store.insert(tx, values);
        await this.audit(tx, operator, PlatformAuditAction.AddonCreated, created.id, {
          newValue: values,
        });
        return created;
      });
    } catch (error) {
      if (error instanceof UniqueViolation && error.target === 'key') {
        throw new FieldsError([
          { field: 'key', problem: ServerFieldProblemCode.Taken, messageKey: 'AddonKeyTaken' },
        ]);
      }
      throw error;
    }
  }

  update(id: string, input: UpdateAddonInput, operator: PlanOperator): Promise<AddonRecord> {
    return this.store.run(async (tx) => {
      const existing = await this.store.findById(tx, id);
      if (!existing) throw new ApiError('not_found', 'AddonNotFound', {});
      // A feature add-on raises no limit, so it has no unit to change.
      if (input.unitSize !== undefined && existing.unitSize === null) {
        throw new FieldsError([{ field: 'unitSize', problem: FieldProblemCode.NotAllowed }]);
      }
      // Only the fields the caller set: Zod fills the others in as an explicit `undefined`.
      const edit = Object.fromEntries(
        Object.entries({
          ...input,
          price: input.price === undefined ? undefined : String(input.price),
        }).filter(([, value]) => value !== undefined),
      );
      const updated = await this.store.update(tx, id, edit);
      if (!updated) throw new ApiError('not_found', 'AddonNotFound', {});
      await this.audit(tx, operator, PlatformAuditAction.AddonUpdated, id, { newValue: edit });
      return updated;
    });
  }

  /** PLN-13: no longer for sale; what shops already bought runs to its end. Retiring twice changes nothing. */
  retire(id: string, operator: PlanOperator): Promise<AddonRecord> {
    return this.store.run(async (tx) => {
      const existing = await this.store.findById(tx, id);
      if (!existing) throw new ApiError('not_found', 'AddonNotFound', {});
      if (existing.retiredAt) return existing;
      const retired = await this.store.retire(tx, id, this.clock());
      if (!retired) throw new ApiError('not_found', 'AddonNotFound', {});
      await this.audit(tx, operator, PlatformAuditAction.AddonRetired, id, { key: existing.key });
      return retired;
    });
  }

  private audit(
    tx: Transaction,
    operator: PlanOperator,
    action: PlatformAuditAction,
    addonId: string,
    summary: Record<string, unknown>,
  ): Promise<void> {
    return this.platformAudit.recordWithin(tx, {
      actorType: PlatformActorType.Operator,
      actorId: operator.operatorId,
      action,
      targetType: 'addon',
      targetId: addonId,
      result: AuditResult.Success,
      ip: operator.ip,
      summary,
    });
  }
}
