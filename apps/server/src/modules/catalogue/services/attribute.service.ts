import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AttributeDataType,
  AuditAction,
  OPTION_DATA_TYPES,
  ServerFieldProblemCode,
  type CreateAttributeInput,
  type CreateOptionInput,
  type UpdateAttributeInput,
  type UpdateOptionInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import type { AttributeStore, CatalogueTransactions } from '../ports/catalogue-stores';
import { ATTRIBUTE_STORE, CATALOGUE_TRANSACTIONS } from '../tokens';
import type {
  AttributeRecord,
  AttributeView,
  CatalogueActor,
  OptionRecord,
  OptionView,
} from '../types/catalogue';
import { CatalogueActivity } from './catalogue-activity';

// UOM-02: a number-with-unit option is a number in its kind's base unit, up to four decimals.
const NUMBER_VALUE = /^\d+(\.\d{1,4})?$/;

function scopeOf(row: { tenantId: string | null }): 'platform' | 'shop' {
  return row.tenantId === null ? 'platform' : 'shop';
}

function optionView(option: OptionRecord): OptionView {
  return {
    id: option.id,
    value: option.value,
    scope: scopeOf(option),
    retired: option.retiredAt !== null,
  };
}

/** UOM-02: numbers sort as numbers; every other option keeps its set order. */
function ordered(attribute: AttributeRecord, options: OptionRecord[]): OptionRecord[] {
  if (attribute.dataType !== AttributeDataType.NumberWithUnit) return options;
  return [...options].sort((a, b) => Number(a.value) - Number(b.value));
}

export function attributeView(attribute: AttributeRecord, options: OptionRecord[]): AttributeView {
  return {
    id: attribute.id,
    name: attribute.name,
    dataType: attribute.dataType,
    unitKind: attribute.unitKind,
    scope: scopeOf(attribute),
    retired: attribute.retiredAt !== null,
    options: ordered(attribute, options).map(optionView),
  };
}

/**
 * ATL-01, ATR-01, ATR-10, UOM-02: the attribute library a shop works with. A shop reads the platform's attributes
 * and its own, adds its own attributes by name the moment it needs one, adds its own values to either, and renames
 * or retires only its own. Retiring keeps every product that uses it unchanged.
 */
@Injectable()
export class AttributeService {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(ATTRIBUTE_STORE) private readonly attributes: AttributeStore,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  list(tenantId: string, includeRetired: boolean): Promise<AttributeView[]> {
    return this.transactions.run(async (tx) => {
      const rows = await this.attributes.listAttributes(tx, tenantId, includeRetired);
      const options = await this.attributes.listOptions(
        tx,
        tenantId,
        rows.map((row) => row.id),
        includeRetired,
      );
      return rows.map((row) =>
        attributeView(
          row,
          options.filter((option) => option.attributeId === row.id),
        ),
      );
    });
  }

  /** ATR-01: a shop's own attribute. A name the shop already sees (its own or the platform's) is taken. */
  async create(
    tenantId: string,
    input: CreateAttributeInput,
    actor: CatalogueActor,
  ): Promise<AttributeView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      await this.refuseTakenName(tx, tenantId, input.name, null);
      let row: AttributeRecord;
      try {
        row = await this.attributes.insertAttribute(tx, {
          tenantId,
          name: input.name,
          dataType: input.dataType,
          unitKind: input.unitKind ?? null,
        });
      } catch (error) {
        if (error instanceof UniqueViolation)
          await this.refuseTakenName(tx, tenantId, input.name, null);
        throw error;
      }
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.AttributeCreated,
        {
          type: 'attribute',
          id: row.id,
        },
        { name: row.name, dataType: row.dataType },
      );
      return attributeView(row, []);
    });
  }

  /** ATR-10: renames or retires one of the shop's own attributes. A platform attribute is never the shop's. */
  async update(
    tenantId: string,
    attributeId: string,
    input: UpdateAttributeInput,
    actor: CatalogueActor,
  ): Promise<AttributeView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.transactions.run(async (tx) => {
      const [current] = await this.attributes.findAttributes(tx, tenantId, [attributeId]);
      if (!current || current.tenantId === null) {
        throw new ApiError('not_found', 'AttributeNotFound', {});
      }
      if (input.name !== undefined)
        await this.refuseTakenName(tx, tenantId, input.name, attributeId);
      const patch: { name?: string; retiredAt?: Date | null } = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.retired !== undefined) {
        patch.retiredAt = input.retired ? (current.retiredAt ?? new Date()) : null;
      }
      const row = await this.attributes.updateAttribute(tx, tenantId, attributeId, patch);
      if (!row) throw new ApiError('not_found', 'AttributeNotFound', {});
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.AttributeUpdated,
        {
          type: 'attribute',
          id: row.id,
        },
        {
          ...(input.name !== undefined ? { from: current.name, to: row.name } : {}),
          ...(input.retired !== undefined ? { retired: input.retired } : {}),
        },
      );
      const options = await this.attributes.listOptions(tx, tenantId, [row.id], true);
      return attributeView(row, options);
    });
  }

  /** A shop's own value of an attribute with options, its own or the platform's. */
  async addOption(
    tenantId: string,
    attributeId: string,
    input: CreateOptionInput,
  ): Promise<OptionView> {
    return this.transactions.run(async (tx) => {
      const attribute = await this.holdingOptions(tx, tenantId, attributeId);
      const value = this.canonicalValue(attribute, input.value);
      await this.refuseTakenValue(tx, tenantId, attributeId, value, null);
      const sortOrder = await this.attributes.nextOptionPosition(tx, tenantId, attributeId);
      try {
        return optionView(
          await this.attributes.insertOption(tx, { tenantId, attributeId, value, sortOrder }),
        );
      } catch (error) {
        if (error instanceof UniqueViolation)
          await this.refuseTakenValue(tx, tenantId, attributeId, value, null);
        throw error;
      }
    });
  }

  /** Renames or retires one of the shop's own values. */
  async updateOption(
    tenantId: string,
    attributeId: string,
    optionId: string,
    input: UpdateOptionInput,
  ): Promise<OptionView> {
    return this.transactions.run(async (tx) => {
      const attribute = await this.holdingOptions(tx, tenantId, attributeId);
      const [current] = await this.attributes.findOptions(tx, tenantId, [optionId]);
      if (!current || current.tenantId === null || current.attributeId !== attributeId) {
        throw new ApiError('not_found', 'OptionNotFound', {});
      }
      const patch: { value?: string; retiredAt?: Date | null } = {};
      if (input.value !== undefined) {
        patch.value = this.canonicalValue(attribute, input.value);
        await this.refuseTakenValue(tx, tenantId, attributeId, patch.value, optionId);
      }
      if (input.retired !== undefined) {
        patch.retiredAt = input.retired ? (current.retiredAt ?? new Date()) : null;
      }
      const row = await this.attributes.updateOption(tx, tenantId, attributeId, optionId, patch);
      if (!row) throw new ApiError('not_found', 'OptionNotFound', {});
      return optionView(row);
    });
  }

  private async holdingOptions(
    tx: Transaction,
    tenantId: string,
    attributeId: string,
  ): Promise<AttributeRecord> {
    const [attribute] = await this.attributes.findAttributes(tx, tenantId, [attributeId]);
    if (!attribute) throw new ApiError('not_found', 'AttributeNotFound', {});
    if (!OPTION_DATA_TYPES.includes(attribute.dataType)) {
      throw new ApiError('conflict', 'AttributeHasNoOptions', {});
    }
    return attribute;
  }

  /** UOM-02: a number-with-unit value is stored as a plain number ("1.50" and "1.5" are the same value). */
  private canonicalValue(attribute: AttributeRecord, value: string): string {
    if (attribute.dataType !== AttributeDataType.NumberWithUnit) return value;
    const amount = Number(value);
    if (!NUMBER_VALUE.test(value) || !(amount > 0)) {
      throw new FieldsError([
        {
          field: 'value',
          problem: ServerFieldProblemCode.OutOfRange,
          messageKey: 'OptionValueNotANumber',
        },
      ]);
    }
    return String(amount);
  }

  private async refuseTakenName(
    tx: Transaction,
    tenantId: string,
    name: string,
    except: string | null,
  ): Promise<void> {
    const existing = await this.attributes.findAttributeByName(tx, tenantId, name);
    if (existing && existing.id !== except) {
      throw new FieldsError(
        [
          {
            field: 'name',
            problem: ServerFieldProblemCode.Taken,
            messageKey: 'AttributeNameTaken',
          },
        ],
        'conflict',
        { attributeId: existing.id },
      );
    }
  }

  private async refuseTakenValue(
    tx: Transaction,
    tenantId: string,
    attributeId: string,
    value: string,
    except: string | null,
  ): Promise<void> {
    const existing = await this.attributes.findOptionByValue(tx, tenantId, attributeId, value);
    if (existing && existing.id !== except) {
      throw new FieldsError(
        [{ field: 'value', problem: ServerFieldProblemCode.Taken, messageKey: 'OptionValueTaken' }],
        'conflict',
        { optionId: existing.id },
      );
    }
  }
}
