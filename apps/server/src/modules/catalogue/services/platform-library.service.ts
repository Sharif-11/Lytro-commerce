import { Inject, Injectable } from '@nestjs/common';
import type { PresetPatch, Transaction } from '@lytronix/db';
import {
  AuditResult,
  FieldProblemCode,
  OPTION_DATA_TYPES,
  PlatformActorType,
  PlatformAuditAction,
  ServerFieldProblemCode,
  type CreateAttributeInput,
  type CreateOptionInput,
  type CreatePlatformOptionSetInput,
  type UpdateAttributeInput,
  type UpdateOptionInput,
  type UpdatePlatformOptionSetInput,
  type UpdatePresetInput,
} from '@lytronix/validators';
import { ApiError, FieldsError, type InvalidField } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import type {
  CatalogueTransactions,
  OptionPatch,
  PlatformLibraryStore,
  PresetStore,
} from '../ports/catalogue-stores';
import { CATALOGUE_TRANSACTIONS, PLATFORM_LIBRARY_STORE, PRESET_STORE } from '../tokens';
import type {
  AttributeRecord,
  AttributeView,
  OperatorActor,
  OptionSetView,
  OptionView,
  PresetView,
} from '../types/catalogue';
import {
  attributeView,
  canonicalOptionValue,
  canonicalSwatch,
  optionView,
} from './attribute.service';
import { distinctValues, optionSetView, refuseTakenSetName } from './option-set.service';
import { presetView } from './preset.service';

function refuseTakenName(): never {
  throw new FieldsError(
    [{ field: 'name', problem: ServerFieldProblemCode.Taken, messageKey: 'AttributeNameTaken' }],
    'conflict',
  );
}

function refuseTakenValue(): never {
  throw new FieldsError(
    [{ field: 'value', problem: ServerFieldProblemCode.Taken, messageKey: 'OptionValueTaken' }],
    'conflict',
  );
}

/**
 * PST-04, ATL-01, ATR-16, ATR-18: the operator's curation of what every shop starts from -- the shop-type presets,
 * the platform's attributes and their values (with swatches), and the platform's option sets -- without a deploy.
 * A change applies to products created afterwards and never alters a saved one (PST-03); every change is in the
 * platform audit log (AUD-03). Shops' own attributes, values and sets are never the operator's to change here.
 */
@Injectable()
export class PlatformLibraryService {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(PLATFORM_LIBRARY_STORE) private readonly library: PlatformLibraryStore,
    @Inject(PRESET_STORE) private readonly presets: PresetStore,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
  ) {}

  // --- Presets (PST-04) ---

  async listPresets(): Promise<PresetView[]> {
    return (await this.presets.listPresets()).map(presetView);
  }

  async updatePreset(
    key: string,
    input: UpdatePresetInput,
    operator: OperatorActor,
  ): Promise<PresetView> {
    const current = await this.presets.findPreset(key);
    if (!current) throw new ApiError('not_found', 'PresetNotFound', {});
    const patch: PresetPatch = {};
    if (input.labelBn !== undefined) patch.labelBn = input.labelBn;
    if (input.labelEn !== undefined) patch.labelEn = input.labelEn;
    if (input.defaultStockUnit !== undefined) patch.defaultStockUnit = input.defaultStockUnit;
    if (input.defaultBatch !== undefined) patch.defaultBatch = input.defaultBatch;
    if (input.defaultSerial !== undefined) patch.defaultSerial = input.defaultSerial;
    if (input.defaultSerialFormat !== undefined) {
      patch.defaultSerialFormat = input.defaultSerialFormat;
    }
    if (input.defaultNotTracked !== undefined) patch.defaultNotTracked = input.defaultNotTracked;
    if (input.defaultLowStock !== undefined) patch.defaultLowStock = String(input.defaultLowStock);
    if (input.suggestedCategories !== undefined)
      patch.suggestedCategories = distinctValues(input.suggestedCategories);
    if (input.upFrontFields !== undefined) patch.upFrontFields = [...new Set(input.upFrontFields)];
    if (
      (patch.defaultBatch ?? current.defaultBatch) &&
      (patch.defaultSerial ?? current.defaultSerial)
    ) {
      throw new FieldsError([
        {
          field: input.defaultSerial !== undefined ? 'defaultSerial' : 'defaultBatch',
          problem: FieldProblemCode.NotAllowed,
          messageKey: 'BatchOrSerialNotBoth',
        },
      ]);
    }
    if (input.suggestedAttributeIds !== undefined) {
      patch.suggestedAttributeIds = await this.transactions.run((tx) =>
        this.platformAttributeIds(tx, input.suggestedAttributeIds ?? []),
      );
    }
    const row = await this.presets.updatePreset(key, patch);
    if (!row) throw new ApiError('not_found', 'PresetNotFound', {});
    await this.audit(operator, PlatformAuditAction.PresetUpdated, 'preset', null, {
      key,
      fields: Object.keys(patch),
    });
    return presetView(row);
  }

  // --- Attributes and their values (ATL-01, ATR-18) ---

  listAttributes(): Promise<AttributeView[]> {
    return this.transactions.run(async (tx) => {
      const rows = await this.library.listAttributes(tx);
      const options = await this.library.listOptions(
        tx,
        rows.map((row) => row.id),
      );
      return rows.map((row) =>
        attributeView(
          row,
          options.filter((option) => option.attributeId === row.id),
        ),
      );
    });
  }

  async createAttribute(
    input: CreateAttributeInput,
    operator: OperatorActor,
  ): Promise<AttributeView> {
    const row = await this.transactions.run(async (tx) => {
      if (await this.library.findAttributeByName(tx, input.name)) refuseTakenName();
      try {
        return await this.library.insertAttribute(tx, {
          name: input.name,
          dataType: input.dataType,
          unitKind: input.unitKind ?? null,
        });
      } catch (error) {
        if (error instanceof UniqueViolation) refuseTakenName();
        throw error;
      }
    });
    await this.audit(operator, PlatformAuditAction.PlatformAttributeCreated, 'attribute', row.id, {
      name: row.name,
      dataType: row.dataType,
    });
    return attributeView(row, []);
  }

  async updateAttribute(
    attributeId: string,
    input: UpdateAttributeInput,
    operator: OperatorActor,
  ): Promise<AttributeView> {
    const { before, view } = await this.transactions.run(async (tx) => {
      const current = await this.attribute(tx, attributeId);
      if (input.name !== undefined) {
        const holder = await this.library.findAttributeByName(tx, input.name);
        if (holder && holder.id !== attributeId) refuseTakenName();
      }
      const patch: { name?: string; retiredAt?: Date | null } = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.retired !== undefined) {
        patch.retiredAt = input.retired ? (current.retiredAt ?? new Date()) : null;
      }
      let row: AttributeRecord | null;
      try {
        row = await this.library.updateAttribute(tx, attributeId, patch);
      } catch (error) {
        if (error instanceof UniqueViolation) refuseTakenName();
        throw error;
      }
      if (!row) throw new ApiError('not_found', 'AttributeNotFound', {});
      return {
        before: current,
        view: attributeView(row, await this.library.listOptions(tx, [row.id])),
      };
    });
    await this.audit(
      operator,
      PlatformAuditAction.PlatformAttributeUpdated,
      'attribute',
      attributeId,
      {
        ...(input.name !== undefined ? { from: before.name, to: view.name } : {}),
        ...(input.retired !== undefined ? { retired: input.retired } : {}),
      },
    );
    return view;
  }

  async addOption(
    attributeId: string,
    input: CreateOptionInput,
    operator: OperatorActor,
  ): Promise<OptionView> {
    const row = await this.transactions.run(async (tx) => {
      const attribute = await this.holdingOptions(tx, attributeId);
      const value = canonicalOptionValue(attribute, input.value);
      if (await this.library.findOptionByValue(tx, attributeId, value)) refuseTakenValue();
      try {
        return await this.library.insertOption(tx, {
          attributeId,
          value,
          swatchColor: canonicalSwatch(input.swatchColor) ?? null,
          sortOrder: await this.library.nextOptionPosition(tx, attributeId),
        });
      } catch (error) {
        if (error instanceof UniqueViolation) refuseTakenValue();
        throw error;
      }
    });
    await this.audit(
      operator,
      PlatformAuditAction.PlatformOptionCreated,
      'attribute',
      attributeId,
      {
        optionId: row.id,
        value: row.value,
        swatchColor: row.swatchColor,
      },
    );
    return optionView(row);
  }

  async updateOption(
    attributeId: string,
    optionId: string,
    input: UpdateOptionInput,
    operator: OperatorActor,
  ): Promise<OptionView> {
    const row = await this.transactions.run(async (tx) => {
      const attribute = await this.holdingOptions(tx, attributeId);
      const current = await this.library.findOption(tx, attributeId, optionId);
      if (!current) throw new ApiError('not_found', 'OptionNotFound', {});
      const patch: OptionPatch = {};
      if (input.value !== undefined) {
        patch.value = canonicalOptionValue(attribute, input.value);
        const holder = await this.library.findOptionByValue(tx, attributeId, patch.value);
        if (holder && holder.id !== optionId) refuseTakenValue();
      }
      if (input.swatchColor !== undefined) patch.swatchColor = canonicalSwatch(input.swatchColor);
      if (input.retired !== undefined) {
        patch.retiredAt = input.retired ? (current.retiredAt ?? new Date()) : null;
      }
      try {
        const updated = await this.library.updateOption(tx, attributeId, optionId, patch);
        if (!updated) throw new ApiError('not_found', 'OptionNotFound', {});
        return updated;
      } catch (error) {
        if (error instanceof UniqueViolation) refuseTakenValue();
        throw error;
      }
    });
    await this.audit(
      operator,
      PlatformAuditAction.PlatformOptionUpdated,
      'attribute',
      attributeId,
      {
        optionId,
        fields: Object.keys(input),
      },
    );
    return optionView(row);
  }

  // --- Option sets (ATR-16) ---

  listOptionSets(): Promise<OptionSetView[]> {
    return this.transactions.run(async (tx) =>
      (await this.library.listOptionSets(tx)).map(optionSetView),
    );
  }

  async createOptionSet(
    input: CreatePlatformOptionSetInput,
    operator: OperatorActor,
  ): Promise<OptionSetView> {
    const presetKey = input.presetKey ?? null;
    await this.refuseUnknownType(presetKey);
    const row = await this.transactions.run(async (tx) => {
      const sets = await this.library.listOptionSets(tx);
      if (sets.some((set) => set.name.toLowerCase() === input.name.toLowerCase())) {
        refuseTakenSetName();
      }
      try {
        return await this.library.insertOptionSet(tx, {
          name: input.name,
          presetKey,
          options: distinctValues(input.options),
          sortOrder: await this.library.nextOptionSetPosition(tx),
        });
      } catch (error) {
        if (error instanceof UniqueViolation) refuseTakenSetName();
        throw error;
      }
    });
    await this.audit(operator, PlatformAuditAction.PlatformOptionSetCreated, 'option_set', row.id, {
      name: row.name,
      presetKey,
      options: row.options.length,
    });
    return optionSetView(row);
  }

  async updateOptionSet(
    id: string,
    input: UpdatePlatformOptionSetInput,
    operator: OperatorActor,
  ): Promise<OptionSetView> {
    if (input.presetKey !== undefined) await this.refuseUnknownType(input.presetKey);
    const row = await this.transactions.run(async (tx) => {
      const name = input.name;
      if (name !== undefined) {
        const sets = await this.library.listOptionSets(tx);
        if (sets.some((set) => set.id !== id && set.name.toLowerCase() === name.toLowerCase())) {
          refuseTakenSetName();
        }
      }
      try {
        const updated = await this.library.updateOptionSet(tx, id, {
          ...(name !== undefined ? { name } : {}),
          ...(input.presetKey !== undefined ? { presetKey: input.presetKey } : {}),
          ...(input.options !== undefined ? { options: distinctValues(input.options) } : {}),
        });
        if (!updated) throw new ApiError('not_found', 'OptionSetNotFound', {});
        return updated;
      } catch (error) {
        if (error instanceof UniqueViolation) refuseTakenSetName();
        throw error;
      }
    });
    await this.audit(operator, PlatformAuditAction.PlatformOptionSetUpdated, 'option_set', id, {
      fields: Object.keys(input),
    });
    return optionSetView(row);
  }

  async deleteOptionSet(id: string, operator: OperatorActor): Promise<void> {
    const row = await this.transactions.run((tx) => this.library.deleteOptionSet(tx, id));
    if (!row) throw new ApiError('not_found', 'OptionSetNotFound', {});
    await this.audit(operator, PlatformAuditAction.PlatformOptionSetDeleted, 'option_set', id, {
      name: row.name,
    });
  }

  // --- Building blocks ---

  private async attribute(tx: Transaction, attributeId: string): Promise<AttributeRecord> {
    const row = await this.library.findAttribute(tx, attributeId);
    if (!row) throw new ApiError('not_found', 'AttributeNotFound', {});
    return row;
  }

  private async holdingOptions(tx: Transaction, attributeId: string): Promise<AttributeRecord> {
    const attribute = await this.attribute(tx, attributeId);
    if (!OPTION_DATA_TYPES.includes(attribute.dataType)) {
      throw new ApiError('conflict', 'AttributeHasNoOptions', {});
    }
    return attribute;
  }

  /** ATR-02: a preset suggests only the platform's own attributes, each once, in the order given. */
  private async platformAttributeIds(tx: Transaction, ids: string[]): Promise<string[]> {
    const problems: InvalidField[] = [];
    for (const [index, id] of ids.entries()) {
      if (!(await this.library.findAttribute(tx, id))) {
        problems.push({
          field: `suggestedAttributeIds.${String(index)}`,
          problem: ServerFieldProblemCode.NotFound,
          messageKey: 'AttributeNotFound',
        });
      }
    }
    if (problems.length > 0) throw new FieldsError(problems);
    return [...new Set(ids)];
  }

  private async refuseUnknownType(key: string | null): Promise<void> {
    if (key !== null && !(await this.presets.findPreset(key))) {
      throw new FieldsError([
        {
          field: 'presetKey',
          problem: ServerFieldProblemCode.NotFound,
          messageKey: 'BusinessTypeUnknown',
        },
      ]);
    }
  }

  private audit(
    operator: OperatorActor,
    action: PlatformAuditAction,
    targetType: string,
    targetId: string | null,
    summary: Record<string, unknown>,
  ): Promise<void> {
    return this.platformAudit.record({
      actorType: PlatformActorType.Operator,
      actorId: operator.operatorId,
      action,
      targetType,
      targetId,
      result: AuditResult.Success,
      ip: operator.ip,
      summary,
    });
  }
}
