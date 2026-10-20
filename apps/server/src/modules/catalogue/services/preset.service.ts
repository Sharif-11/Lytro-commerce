import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditAction,
  ProductFormField,
  SerialFormat,
  ServerFieldProblemCode,
  StockTracking,
  StockUnit,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { TenantService } from '../../tenancy/services/tenant.service';
import type {
  AttributeStore,
  CatalogueTransactions,
  CategoryStore,
  PresetStore,
} from '../ports/catalogue-stores';
import { ATTRIBUTE_STORE, CATALOGUE_TRANSACTIONS, CATEGORY_STORE, PRESET_STORE } from '../tokens';
import type {
  CatalogueActor,
  PresetDefaults,
  PresetRecord,
  PresetView,
  ProductDefaults,
} from '../types/catalogue';
import { CatalogueActivity } from './catalogue-activity';

// A shop that has not chosen a type gets what "Other" gives: pieces, counted, no batches or serials.
const FALLBACK_TYPE = 'other';

const FORM_FIELDS: readonly string[] = Object.values(ProductFormField);

function isFormField(field: string): field is ProductFormField {
  return FORM_FIELDS.includes(field);
}

function defaultsOf(preset: PresetRecord | null): PresetDefaults {
  if (!preset) {
    return {
      stockUnit: StockUnit.Piece,
      stockTracking: StockTracking.Tracked,
      batchTracked: false,
      serialTracked: false,
      serialFormat: SerialFormat.Any,
      lowStockThreshold: '5.000',
      suggestedAttributeIds: [],
      suggestedCategories: [],
      upFrontFields: [],
    };
  }
  return {
    stockUnit: preset.defaultStockUnit,
    stockTracking: preset.defaultNotTracked ? StockTracking.NotTracked : StockTracking.Tracked,
    batchTracked: preset.defaultBatch && !preset.defaultNotTracked,
    serialTracked: preset.defaultSerial && !preset.defaultNotTracked,
    serialFormat: preset.defaultSerialFormat,
    lowStockThreshold: preset.defaultLowStock,
    suggestedAttributeIds: preset.suggestedAttributeIds,
    suggestedCategories: preset.suggestedCategories,
    // A field name the code no longer knows is left out rather than sent to a form that cannot show it.
    upFrontFields: preset.upFrontFields.filter(isFormField),
  };
}

export function presetView(preset: PresetRecord): PresetView {
  return {
    key: preset.key,
    labelBn: preset.labelBn,
    labelEn: preset.labelEn,
    defaults: defaultsOf(preset),
  };
}

/**
 * PST-01 to PST-03, PST-05, PST-06: the shop types, the defaults each gives a new product, and the shop's own choice.
 * A new product takes its type from the nearest category above it that behaves like one, else from the shop.
 * Defaults only (PST-02): a product may set anything, and changing a type never touches existing products (PST-03).
 */
@Injectable()
export class PresetService {
  constructor(
    @Inject(PRESET_STORE) private readonly presets: PresetStore,
    @Inject(CATALOGUE_TRANSACTIONS) private readonly transactions: CatalogueTransactions,
    @Inject(CATEGORY_STORE) private readonly categories: CategoryStore,
    @Inject(ATTRIBUTE_STORE) private readonly attributes: AttributeStore,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  async list(): Promise<PresetView[]> {
    return (await this.presets.listPresets()).map(presetView);
  }

  /** PST-02: what a new product starts with in a shop of this type ("Other" when none is chosen). */
  async defaultsFor(businessType: string | null): Promise<ProductDefaults> {
    const preset = await this.presetOrFallback(businessType);
    return {
      businessType,
      presetKey: preset?.key ?? null,
      fromCategoryId: null,
      ...defaultsOf(preset),
    };
  }

  /** PST-02, PST-06: what a new product filed under this category starts with; a category the shop lacks is 404. */
  productDefaults(
    shop: { id: string; businessType: string | null },
    categoryId: string | null,
  ): Promise<ProductDefaults> {
    return this.transactions.run(async (tx) => {
      const defaults = await this.defaultsWithin(tx, shop, categoryId);
      if (!defaults) throw new ApiError('not_found', 'CategoryNotFound', {});
      return defaults;
    });
  }

  /**
   * PST-06, ATR-02: inside the caller's transaction, the defaults for a product filed under this category: the type
   * of the nearest category (itself or one above it) that behaves like one, else the shop's; the category's own
   * suggested attributes first, then the type's. Null when the shop has no such category.
   */
  async defaultsWithin(
    tx: Transaction,
    shop: { id: string; businessType: string | null },
    categoryId: string | null,
  ): Promise<ProductDefaults | null> {
    if (categoryId === null) return this.defaultsFor(shop.businessType);
    const lineage = await this.categories.lineage(tx, shop.id, categoryId);
    if (lineage.length === 0) return null;
    const chooser = lineage.find((category) => category.behavesLike !== null);
    const chosen = chooser?.behavesLike ? await this.presets.findPreset(chooser.behavesLike) : null;
    // A key the operator has since removed falls back to the shop's own type, as if the category had none.
    const preset = chosen ?? (await this.presetOrFallback(shop.businessType));
    const own = (await this.attributes.listCategorySuggestions(tx, shop.id, [categoryId])).map(
      (entry) => entry.attributeId,
    );
    const defaults = defaultsOf(preset);
    return {
      businessType: shop.businessType,
      presetKey: preset?.key ?? null,
      fromCategoryId: chosen && chooser ? chooser.id : null,
      ...defaults,
      suggestedAttributeIds: [...new Set([...own, ...defaults.suggestedAttributeIds])],
    };
  }

  /** PST-01: sets (or clears) the shop's business type. */
  async setBusinessType(
    tenantId: string,
    current: string | null,
    businessType: string | null,
    actor: CatalogueActor,
  ): Promise<ProductDefaults> {
    if (businessType !== null && !(await this.presets.findPreset(businessType))) {
      throw new FieldsError([
        {
          field: 'businessType',
          problem: ServerFieldProblemCode.NotFound,
          messageKey: 'BusinessTypeUnknown',
        },
      ]);
    }
    const who = await this.activity.resolve(tenantId, actor);
    await this.tenants.runStandalone(async (tx) => {
      await this.tenants.setBusinessType(tx, tenantId, businessType);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.BusinessTypeChanged,
        { type: 'tenant', id: tenantId },
        { from: current, to: businessType },
      );
    });
    return this.defaultsFor(businessType);
  }

  private async presetOrFallback(businessType: string | null): Promise<PresetRecord | null> {
    return (
      (businessType !== null ? await this.presets.findPreset(businessType) : null) ??
      (await this.presets.findPreset(FALLBACK_TYPE))
    );
  }
}
