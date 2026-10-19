import { Inject, Injectable } from '@nestjs/common';
import {
  AuditAction,
  ServerFieldProblemCode,
  StockTracking,
  StockUnit,
} from '@lytronix/validators';
import { FieldsError } from '../../../common/api-error';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { PresetStore } from '../ports/catalogue-stores';
import { PRESET_STORE } from '../tokens';
import type { CatalogueActor, PresetRecord, PresetView, ProductDefaults } from '../types/catalogue';
import { CatalogueActivity } from './catalogue-activity';

// A shop that has not chosen a type gets what "Other" gives: pieces, counted, no batches or serials.
const FALLBACK_TYPE = 'other';

function defaultsOf(preset: PresetRecord | null): Omit<ProductDefaults, 'businessType'> {
  if (!preset) {
    return {
      stockUnit: StockUnit.Piece,
      stockTracking: StockTracking.Tracked,
      batchTracked: false,
      serialTracked: false,
      lowStockThreshold: '5.000',
      suggestedAttributeIds: [],
      suggestedCategories: [],
    };
  }
  return {
    stockUnit: preset.defaultStockUnit,
    stockTracking: preset.defaultNotTracked ? StockTracking.NotTracked : StockTracking.Tracked,
    batchTracked: preset.defaultBatch && !preset.defaultNotTracked,
    serialTracked: preset.defaultSerial && !preset.defaultNotTracked,
    lowStockThreshold: preset.defaultLowStock,
    suggestedAttributeIds: preset.suggestedAttributeIds,
    suggestedCategories: preset.suggestedCategories,
  };
}

/**
 * PST-01 to PST-04: the shop types, the defaults each gives a new product, and the shop's own choice. Defaults
 * only (PST-02): a product may set anything, and changing the type never touches existing products (PST-03).
 */
@Injectable()
export class PresetService {
  constructor(
    @Inject(PRESET_STORE) private readonly presets: PresetStore,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  async list(): Promise<PresetView[]> {
    return (await this.presets.listPresets()).map((preset) => ({
      key: preset.key,
      labelBn: preset.labelBn,
      labelEn: preset.labelEn,
      defaults: defaultsOf(preset),
    }));
  }

  /** PST-02: what a new product starts with in a shop of this type ("Other" when none is chosen). */
  async defaultsFor(businessType: string | null): Promise<ProductDefaults> {
    const preset =
      (businessType !== null ? await this.presets.findPreset(businessType) : null) ??
      (await this.presets.findPreset(FALLBACK_TYPE));
    return { businessType, ...defaultsOf(preset) };
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
}
