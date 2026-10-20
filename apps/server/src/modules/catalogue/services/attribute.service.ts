import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AttributeDataType,
  AuditAction,
  OPTION_DATA_TYPES,
  ServerFieldProblemCode,
  type AddOptionsInput,
  type CreateAttributeInput,
  type CreateShopOptionInput,
  type UpdateAttributeInput,
  type UpdateShopOptionInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import type { ImageView } from '../../../common/media-links';
import type {
  AttributeStore,
  CatalogueTransactions,
  ProductStore,
  ShopOptionPatch,
} from '../ports/catalogue-stores';
import { ATTRIBUTE_STORE, CATALOGUE_TRANSACTIONS, PRODUCT_STORE } from '../tokens';
import type {
  AttributeRecord,
  AttributeView,
  CatalogueActor,
  OptionRecord,
  OptionView,
} from '../types/catalogue';
import { CatalogueActivity } from './catalogue-activity';
import { CatalogueImages, refuseUnattachable } from './catalogue-images';

// UOM-02: a number-with-unit option is a number in its kind's base unit, up to four decimals.
const NUMBER_VALUE = /^\d+(\.\d{1,4})?$/;

function scopeOf(row: { tenantId: string | null }): 'platform' | 'shop' {
  return row.tenantId === null ? 'platform' : 'shop';
}

/** An option as shown, with its swatch image when it has one among `images` (ATR-18). */
export function optionView(
  option: OptionRecord,
  images: ReadonlyMap<string, ImageView> = new Map(),
): OptionView {
  return {
    id: option.id,
    value: option.value,
    swatchColor: option.swatchColor,
    swatchImage: option.swatchImageId === null ? null : (images.get(option.swatchImageId) ?? null),
    scope: scopeOf(option),
    retired: option.retiredAt !== null,
  };
}

/** UOM-02: numbers sort as numbers; every other option keeps its set order. */
function ordered(attribute: AttributeRecord, options: OptionRecord[]): OptionRecord[] {
  if (attribute.dataType !== AttributeDataType.NumberWithUnit) return options;
  return [...options].sort((a, b) => Number(a.value) - Number(b.value));
}

export function attributeView(
  attribute: AttributeRecord,
  options: OptionRecord[],
  images: ReadonlyMap<string, ImageView> = new Map(),
): AttributeView {
  return {
    id: attribute.id,
    name: attribute.name,
    dataType: attribute.dataType,
    unitKind: attribute.unitKind,
    scope: scopeOf(attribute),
    retired: attribute.retiredAt !== null,
    options: ordered(attribute, options).map((option) => optionView(option, images)),
  };
}

/**
 * UOM-02: a number-with-unit value is stored as a plain number ("1.50" and "1.5" are the same value); any other
 * value as given. `field` names the request field a refusal points at.
 */
export function canonicalOptionValue(
  attribute: AttributeRecord,
  value: string,
  field = 'value',
): string {
  if (attribute.dataType !== AttributeDataType.NumberWithUnit) return value;
  const amount = Number(value);
  if (!NUMBER_VALUE.test(value) || !(amount > 0)) {
    throw new FieldsError([
      {
        field,
        problem: ServerFieldProblemCode.OutOfRange,
        messageKey: 'OptionValueNotANumber',
      },
    ]);
  }
  return String(amount);
}

/** ATR-18: swatches are stored in one spelling, so "#ff0000" and "#FF0000" are the same colour. */
export function canonicalSwatch(swatch: string | null | undefined): string | null | undefined {
  return swatch === undefined || swatch === null ? swatch : swatch.toUpperCase();
}

/**
 * ATL-01, ATR-01, ATR-10, ATR-16, ATR-18, UOM-02: the attribute library a shop works with. A shop reads the
 * platform's attributes and its own, adds its own attributes by name the moment it needs one, adds its own values
 * to either (one at a time or a whole option set), gives its own values a swatch, and renames or retires only its
 * own. Retiring keeps every product that uses it unchanged.
 */
@Injectable()
export class AttributeService {
  constructor(
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(ATTRIBUTE_STORE) private readonly attributes: AttributeStore,
    @Inject(PRODUCT_STORE) private readonly products: ProductStore,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(CatalogueImages) private readonly images: CatalogueImages,
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
      const images = await this.swatchesOf(tx, tenantId, options);
      return rows.map((row) =>
        attributeView(
          row,
          options.filter((option) => option.attributeId === row.id),
          images,
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
      // CCH-02: a renamed attribute reads differently on every product page that shows it.
      if (input.name !== undefined) await this.products.bumpVersion(tx, tenantId);
      const options = await this.attributes.listOptions(tx, tenantId, [row.id], true);
      return attributeView(row, options, await this.swatchesOf(tx, tenantId, options));
    });
  }

  /**
   * A shop's own value of an attribute with options, its own or the platform's, with its swatch: a colour or a
   * ready image of the shop's (ATR-18, MED-03).
   */
  async addOption(
    tenantId: string,
    attributeId: string,
    input: CreateShopOptionInput,
  ): Promise<OptionView> {
    return this.transactions.run(async (tx) => {
      const attribute = await this.holdingOptions(tx, tenantId, attributeId);
      const value = canonicalOptionValue(attribute, input.value);
      await this.refuseTakenValue(tx, tenantId, attributeId, value, null);
      const sortOrder = await this.attributes.nextOptionPosition(tx, tenantId, attributeId);
      let row: OptionRecord;
      try {
        row = await this.attributes.insertOption(tx, {
          tenantId,
          attributeId,
          value,
          swatchColor: canonicalSwatch(input.swatchColor) ?? null,
          swatchImageId: input.swatchImageId ?? null,
          sortOrder,
        });
      } catch (error) {
        if (error instanceof UniqueViolation)
          await this.refuseTakenValue(tx, tenantId, attributeId, value, null);
        refuseUnattachable(error, 'swatchImageId');
      }
      return optionView(row, await this.swatchesOf(tx, tenantId, [row]));
    });
  }

  /**
   * ATR-16: several values at once, as tapping an option set adds them, returned in the order given. A value the
   * shop already sees (the platform's, with its swatch, or its own) is reused rather than doubled; one of its own it
   * had retired comes back.
   */
  async addOptions(
    tenantId: string,
    attributeId: string,
    input: AddOptionsInput,
  ): Promise<OptionView[]> {
    return this.transactions.run(async (tx) => {
      const attribute = await this.holdingOptions(tx, tenantId, attributeId);
      const values = input.values.map((value, index) =>
        canonicalOptionValue(attribute, value, `values.${String(index)}`),
      );
      const result: OptionRecord[] = [];
      let sortOrder = await this.attributes.nextOptionPosition(tx, tenantId, attributeId);
      for (const value of values) {
        if (result.some((option) => option.value.toLowerCase() === value.toLowerCase())) continue;
        const existing = await this.attributes.findOptionByValue(tx, tenantId, attributeId, value);
        if (existing && existing.tenantId !== null && existing.retiredAt !== null) {
          const revived = await this.attributes.updateOption(
            tx,
            tenantId,
            attributeId,
            existing.id,
            {
              retiredAt: null,
            },
          );
          result.push(revived ?? existing);
        } else if (existing) {
          result.push(existing);
        } else {
          result.push(
            await this.attributes.insertOption(tx, { tenantId, attributeId, value, sortOrder }),
          );
          sortOrder += 1;
        }
      }
      const images = await this.swatchesOf(tx, tenantId, result);
      return result.map((option) => optionView(option, images));
    });
  }

  /** Renames, re-colours or retires one of the shop's own values; setting one kind of swatch clears the other. */
  async updateOption(
    tenantId: string,
    attributeId: string,
    optionId: string,
    input: UpdateShopOptionInput,
  ): Promise<OptionView> {
    return this.transactions.run(async (tx) => {
      const attribute = await this.holdingOptions(tx, tenantId, attributeId);
      const [current] = await this.attributes.findOptions(tx, tenantId, [optionId]);
      if (!current || current.tenantId === null || current.attributeId !== attributeId) {
        throw new ApiError('not_found', 'OptionNotFound', {});
      }
      const patch: ShopOptionPatch = {};
      if (input.value !== undefined) {
        patch.value = canonicalOptionValue(attribute, input.value);
        await this.refuseTakenValue(tx, tenantId, attributeId, patch.value, optionId);
      }
      if (input.swatchColor !== undefined) {
        patch.swatchColor = canonicalSwatch(input.swatchColor);
        if (input.swatchColor !== null) patch.swatchImageId = null;
      }
      if (input.swatchImageId !== undefined) {
        patch.swatchImageId = input.swatchImageId;
        if (input.swatchImageId !== null) patch.swatchColor = null;
      }
      if (input.retired !== undefined) {
        patch.retiredAt = input.retired ? (current.retiredAt ?? new Date()) : null;
      }
      let row: OptionRecord | null;
      try {
        row = await this.attributes.updateOption(tx, tenantId, attributeId, optionId, patch);
      } catch (error) {
        refuseUnattachable(error, 'swatchImageId');
      }
      if (!row) throw new ApiError('not_found', 'OptionNotFound', {});
      // CCH-02: the value and its swatch show in the variant pickers of every product that uses it (ATR-18).
      if (
        row.value !== current.value ||
        row.swatchColor !== current.swatchColor ||
        row.swatchImageId !== current.swatchImageId
      ) {
        await this.products.bumpVersion(tx, tenantId);
      }
      return optionView(row, await this.swatchesOf(tx, tenantId, [row]));
    });
  }

  /** ATR-18: the swatch images these options show. */
  private swatchesOf(
    tx: Transaction,
    tenantId: string,
    options: OptionRecord[],
  ): Promise<Map<string, ImageView>> {
    return this.images.viewsOf(
      tx,
      tenantId,
      options.map((option) => option.swatchImageId),
    );
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
