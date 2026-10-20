import { Inject, Injectable } from '@nestjs/common';
import {
  AttributeRepository,
  CatalogueDataRepository,
  CategoryRepository,
  OptionSetRepository,
  PlatformLibraryRepository,
  PresetRepository,
  ProductRepository,
  ShopSettingsRepository,
  SizeChartRepository,
  TransactionRunner,
  VariantRepository,
  type PlatformOptionSetPatch,
  type PresetPatch,
  type SizeChartOwner,
  type Transaction,
} from '@lytronix/db';
import { MissingReference } from '../../common/errors/missing-reference';
import { StockRefused } from '../../common/errors/stock-refused';
import { UniqueViolation } from '../../common/errors/unique-violation';
import type {
  AttributeStore,
  CatalogueDataStore,
  CatalogueTransactions,
  CategoryStore,
  OptionPatch,
  OptionSetStore,
  PlatformLibraryStore,
  PresetStore,
  ProductChange,
  ProductStore,
  ShopPolicyStore,
  SizeChartStore,
  VariantChange,
} from '../../modules/catalogue/ports/catalogue-stores';
import type {
  AttributeRecord,
  CategoryRecord,
  OptionRecord,
  OptionSetRecord,
  PresetRecord,
  ProductAttributeRecord,
  ProductAttributeValueRecord,
  ProductRecord,
  ShopPaymentPolicy,
  SizeChartRecord,
  VariantRecord,
  VariantValueRecord,
} from '../../modules/catalogue/types/catalogue';
import { DatabaseService } from '../database.service';

// The unique indexes a catalogue write can run into, by what they protect.
const ATTRIBUTE_NAME_INDEX = 'attributes_tenant_name_idx';
const OPTION_VALUE_INDEX = 'attribute_options_tenant_value_idx';
const CATEGORY_SLUG_KEY = 'categories_tenant_slug_key';
const PRODUCT_SLUG_KEY = 'products_tenant_slug_key';
const REDIRECT_KEY = 'product_slug_redirects_pkey';
const VARIANT_SKU_INDEX = 'product_variants_tenant_sku_idx';
const VARIANT_COMBINATION_KEY = 'product_variants_product_combination_key';
const PLATFORM_ATTRIBUTE_NAME_INDEX = 'attributes_platform_name_idx';
const PLATFORM_OPTION_VALUE_INDEX = 'attribute_options_platform_value_idx';
const OPTION_SET_NAME_INDEX = 'option_sets_tenant_name_idx';
const PLATFORM_OPTION_SET_NAME_INDEX = 'option_sets_platform_name_idx';
const PRODUCT_ZONE_KEY = 'product_delivery_zones_zone_fk';
// UOM-03: the trigger that keeps a product holding a fraction of stock in a measured unit.
const WHOLE_UNITS_CHECK = 'stock_whole_units';
// INV-24: a product switching to or from shared stock while it holds some (migration 0057).
const SHARED_SWITCH_CHECK = 'shared_stock_switch_needs_empty';

/** One transaction per unit of catalogue work. Each repository call sets the shop's tenant context itself. */
@Injectable()
export class DrizzleCatalogueTransactions implements CatalogueTransactions {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }
}

@Injectable()
export class DrizzleAttributeStore implements AttributeStore {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(AttributeRepository) private readonly attributes: AttributeRepository,
  ) {}

  listAttributes(
    tx: Transaction,
    tenantId: string,
    includeRetired: boolean,
  ): Promise<AttributeRecord[]> {
    return this.attributes.listAttributes(tx, tenantId, includeRetired);
  }

  findAttributes(tx: Transaction, tenantId: string, ids: string[]): Promise<AttributeRecord[]> {
    return this.attributes.findAttributes(tx, tenantId, ids);
  }

  findAttributeByName(
    tx: Transaction,
    tenantId: string,
    name: string,
  ): Promise<AttributeRecord | null> {
    return this.attributes.findAttributeByName(tx, tenantId, name);
  }

  async insertAttribute(
    tx: Transaction,
    values: Pick<AttributeRecord, 'name' | 'dataType' | 'unitKind'> & { tenantId: string },
  ): Promise<AttributeRecord> {
    try {
      return await this.attributes.insertAttribute(tx, values);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, ATTRIBUTE_NAME_INDEX))
        throw new UniqueViolation('name');
      throw error;
    }
  }

  async updateAttribute(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: { name?: string; retiredAt?: Date | null },
  ): Promise<AttributeRecord | null> {
    try {
      return await this.attributes.updateAttribute(tx, tenantId, id, patch);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, ATTRIBUTE_NAME_INDEX))
        throw new UniqueViolation('name');
      throw error;
    }
  }

  listOptions(
    tx: Transaction,
    tenantId: string,
    attributeIds: string[],
    includeRetired: boolean,
  ): Promise<OptionRecord[]> {
    return this.attributes.listOptions(tx, tenantId, attributeIds, includeRetired);
  }

  findOptions(tx: Transaction, tenantId: string, ids: string[]): Promise<OptionRecord[]> {
    return this.attributes.findOptions(tx, tenantId, ids);
  }

  findOptionByValue(
    tx: Transaction,
    tenantId: string,
    attributeId: string,
    value: string,
  ): Promise<OptionRecord | null> {
    return this.attributes.findOptionByValue(tx, tenantId, attributeId, value);
  }

  nextOptionPosition(tx: Transaction, tenantId: string, attributeId: string): Promise<number> {
    return this.attributes.nextOptionPosition(tx, tenantId, attributeId);
  }

  async insertOption(
    tx: Transaction,
    values: {
      tenantId: string;
      attributeId: string;
      value: string;
      swatchColor?: string | null;
      sortOrder: number;
    },
  ): Promise<OptionRecord> {
    try {
      return await this.attributes.insertOption(tx, values);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, OPTION_VALUE_INDEX))
        throw new UniqueViolation('value');
      throw error;
    }
  }

  async updateOption(
    tx: Transaction,
    tenantId: string,
    attributeId: string,
    id: string,
    patch: OptionPatch,
  ): Promise<OptionRecord | null> {
    try {
      return await this.attributes.updateOption(tx, tenantId, attributeId, id, patch);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, OPTION_VALUE_INDEX))
        throw new UniqueViolation('value');
      throw error;
    }
  }

  listCategorySuggestions(
    tx: Transaction,
    tenantId: string,
    categoryIds: string[],
  ): Promise<{ categoryId: string; attributeId: string }[]> {
    return this.attributes.listCategorySuggestions(tx, tenantId, categoryIds);
  }

  replaceCategorySuggestions(
    tx: Transaction,
    tenantId: string,
    categoryId: string,
    attributeIds: string[],
  ): Promise<void> {
    return this.attributes.replaceCategorySuggestions(tx, tenantId, categoryId, attributeIds);
  }
}

@Injectable()
export class DrizzleCategoryStore implements CategoryStore {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(CategoryRepository) private readonly categories: CategoryRepository,
  ) {}

  listCategories(tx: Transaction, tenantId: string): Promise<CategoryRecord[]> {
    return this.categories.listCategories(tx, tenantId);
  }

  findCategories(tx: Transaction, tenantId: string, ids: string[]): Promise<CategoryRecord[]> {
    return this.categories.findCategories(tx, tenantId, ids);
  }

  slugsLike(tx: Transaction, tenantId: string, base: string): Promise<string[]> {
    return this.categories.slugsLike(tx, tenantId, base);
  }

  async insertCategory(
    tx: Transaction,
    values: Pick<
      CategoryRecord,
      'parentId' | 'name' | 'slug' | 'depth' | 'sortOrder' | 'visible' | 'behavesLike'
    > & {
      tenantId: string;
    },
  ): Promise<CategoryRecord> {
    try {
      return await this.categories.insertCategory(tx, values);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, CATEGORY_SLUG_KEY))
        throw new UniqueViolation('slug');
      throw error;
    }
  }

  updateCategory(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: Partial<
      Pick<CategoryRecord, 'name' | 'parentId' | 'depth' | 'sortOrder' | 'visible' | 'behavesLike'>
    >,
  ): Promise<CategoryRecord | null> {
    return this.categories.updateCategory(tx, tenantId, id, patch);
  }

  lineage(tx: Transaction, tenantId: string, id: string): Promise<CategoryRecord[]> {
    return this.categories.lineage(tx, tenantId, id);
  }

  subtree(tx: Transaction, tenantId: string, id: string): Promise<{ id: string; level: number }[]> {
    return this.categories.subtree(tx, tenantId, id);
  }

  setSubtreeDepths(
    tx: Transaction,
    tenantId: string,
    subtree: { id: string; level: number }[],
    rootDepth: number,
  ): Promise<void> {
    return this.categories.setSubtreeDepths(tx, tenantId, subtree, rootDepth);
  }

  countChildren(tx: Transaction, tenantId: string, id: string): Promise<number> {
    return this.categories.countChildren(tx, tenantId, id);
  }

  countLiveProducts(tx: Transaction, tenantId: string, id: string): Promise<number> {
    return this.categories.countLiveProducts(tx, tenantId, id);
  }

  countLiveProductsByCategory(tx: Transaction, tenantId: string): Promise<Map<string, number>> {
    return this.categories.countLiveProductsByCategory(tx, tenantId);
  }

  unfileProducts(tx: Transaction, tenantId: string, id: string): Promise<string[]> {
    return this.categories.unfileProducts(tx, tenantId, id);
  }

  deleteCategory(tx: Transaction, tenantId: string, id: string): Promise<void> {
    return this.categories.deleteCategory(tx, tenantId, id);
  }
}

@Injectable()
export class DrizzleProductStore implements ProductStore {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ProductRepository) private readonly products: ProductRepository,
    @Inject(VariantRepository) private readonly variants: VariantRepository,
  ) {}

  lockCatalogue(tx: Transaction, tenantId: string): Promise<void> {
    return this.products.lockCatalogue(tx, tenantId);
  }

  listDeliveryZoneIds(tx: Transaction, tenantId: string, productId: string): Promise<string[]> {
    return this.products.listDeliveryZoneIds(tx, tenantId, productId);
  }

  async replaceDeliveryZones(
    tx: Transaction,
    tenantId: string,
    productId: string,
    zoneIds: string[],
  ): Promise<void> {
    try {
      await this.products.replaceDeliveryZones(tx, tenantId, productId, zoneIds);
    } catch (error) {
      if (this.transactions.isForeignKeyViolation(error, PRODUCT_ZONE_KEY)) {
        throw new MissingReference('zone');
      }
      throw error;
    }
  }

  bumpVersion(tx: Transaction, tenantId: string): Promise<number> {
    return this.products.bumpVersion(tx, tenantId);
  }

  countLiveProducts(tx: Transaction, tenantId: string): Promise<number> {
    return this.products.countLiveProducts(tx, tenantId);
  }

  slugsLike(tx: Transaction, tenantId: string, base: string): Promise<string[]> {
    return this.products.slugsLike(tx, tenantId, base);
  }

  slugHolder(
    tx: Transaction,
    tenantId: string,
    slug: string,
  ): Promise<{ productId: string; current: boolean } | null> {
    return this.products.slugHolder(tx, tenantId, slug);
  }

  async insertProduct(
    tx: Transaction,
    values: ProductChange &
      Pick<ProductRecord, 'name' | 'slug' | 'basePrice'> & { tenantId: string },
  ): Promise<ProductRecord> {
    try {
      return await this.products.insertProduct(tx, values);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, PRODUCT_SLUG_KEY))
        throw new UniqueViolation('slug');
      throw error;
    }
  }

  findProduct(
    tx: Transaction,
    tenantId: string,
    id: string,
    includeArchived: boolean,
  ): Promise<ProductRecord | null> {
    return this.products.findProduct(tx, tenantId, id, includeArchived);
  }

  async updateProduct(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: ProductChange & { slug?: string },
  ): Promise<ProductRecord | null> {
    try {
      return await this.products.updateProduct(tx, tenantId, id, patch);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, PRODUCT_SLUG_KEY))
        throw new UniqueViolation('slug');
      if (this.transactions.isCheckViolation(error, WHOLE_UNITS_CHECK))
        throw new StockRefused('whole_units');
      if (this.transactions.isCheckViolation(error, SHARED_SWITCH_CHECK))
        throw new StockRefused('not_empty');
      throw error;
    }
  }

  deleteProduct(tx: Transaction, tenantId: string, id: string): Promise<void> {
    return this.products.deleteProduct(tx, tenantId, id);
  }

  listProducts(
    tx: Transaction,
    tenantId: string,
    filter: { search?: string; categoryId?: string; offset: number; limit: number },
  ): Promise<{ rows: { product: ProductRecord; variantCount: number }[]; total: number }> {
    return this.products.listProducts(tx, tenantId, filter);
  }

  listCategoryLinks(
    tx: Transaction,
    tenantId: string,
    productIds: string[],
  ): Promise<{ productId: string; categoryId: string }[]> {
    return this.products.listCategoryLinks(tx, tenantId, productIds);
  }

  replaceCategoryLinks(
    tx: Transaction,
    tenantId: string,
    productId: string,
    categoryIds: string[],
  ): Promise<void> {
    return this.products.replaceCategoryLinks(tx, tenantId, productId, categoryIds);
  }

  listProductAttributes(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<ProductAttributeRecord[]> {
    return this.products.listProductAttributes(tx, tenantId, productId);
  }

  listAttributeValues(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<ProductAttributeValueRecord[]> {
    return this.products.listAttributeValues(tx, tenantId, productId);
  }

  insertProductAttributes(tx: Transaction, rows: ProductAttributeRecord[]): Promise<void> {
    return this.products.insertProductAttributes(tx, rows);
  }

  setAttributeOrder(
    tx: Transaction,
    tenantId: string,
    productId: string,
    attributeId: string,
    sortOrder: number,
  ): Promise<void> {
    return this.products.setAttributeOrder(tx, tenantId, productId, attributeId, sortOrder);
  }

  deleteProductAttributes(
    tx: Transaction,
    tenantId: string,
    productId: string,
    attributeIds: string[],
  ): Promise<void> {
    return this.products.deleteProductAttributes(tx, tenantId, productId, attributeIds);
  }

  insertAttributeValues(
    tx: Transaction,
    rows: Omit<ProductAttributeValueRecord, 'id'>[],
  ): Promise<void> {
    return this.products.insertAttributeValues(tx, rows);
  }

  async insertRedirect(
    tx: Transaction,
    tenantId: string,
    oldSlug: string,
    productId: string,
  ): Promise<void> {
    try {
      await this.products.insertRedirect(tx, tenantId, oldSlug, productId);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, REDIRECT_KEY))
        throw new UniqueViolation('slug');
      throw error;
    }
  }

  deleteRedirect(tx: Transaction, tenantId: string, oldSlug: string): Promise<void> {
    return this.products.deleteRedirect(tx, tenantId, oldSlug);
  }

  listRedirects(tx: Transaction, tenantId: string, productId: string): Promise<string[]> {
    return this.products.listRedirects(tx, tenantId, productId);
  }

  refreshPriceRange(tx: Transaction, tenantId: string, productId: string): Promise<void> {
    return this.products.refreshPriceRange(tx, tenantId, productId);
  }

  listVariants(
    tx: Transaction,
    tenantId: string,
    productId: string,
    includeRetired: boolean,
  ): Promise<VariantRecord[]> {
    return this.variants.listVariants(tx, tenantId, productId, includeRetired);
  }

  listVariantValues(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<VariantValueRecord[]> {
    return this.variants.listVariantValues(tx, tenantId, variantIds);
  }

  async insertVariant(
    tx: Transaction,
    values: VariantChange & {
      tenantId: string;
      productId: string;
      combinationKey: string;
      isStockHolder?: boolean;
    },
  ): Promise<VariantRecord> {
    try {
      return await this.variants.insertVariant(tx, values);
    } catch (error) {
      this.rethrowVariantConflict(error);
    }
  }

  async updateVariant(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: VariantChange,
  ): Promise<VariantRecord | null> {
    try {
      return await this.variants.updateVariant(tx, tenantId, id, patch);
    } catch (error) {
      this.rethrowVariantConflict(error);
    }
  }

  retireVariants(tx: Transaction, tenantId: string, ids: string[]): Promise<void> {
    return this.variants.retireVariants(tx, tenantId, ids);
  }

  findStockHolder(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<VariantRecord | null> {
    return this.variants.findStockHolder(tx, tenantId, productId);
  }

  clearPackAmounts(tx: Transaction, tenantId: string, productId: string): Promise<void> {
    return this.variants.clearPackAmounts(tx, tenantId, productId);
  }

  insertVariantValues(tx: Transaction, rows: VariantValueRecord[]): Promise<void> {
    return this.variants.insertVariantValues(tx, rows);
  }

  private rethrowVariantConflict(error: unknown): never {
    if (this.transactions.isUniqueViolation(error, VARIANT_SKU_INDEX))
      throw new UniqueViolation('sku');
    if (this.transactions.isUniqueViolation(error, VARIANT_COMBINATION_KEY)) {
      throw new UniqueViolation('combination');
    }
    if (this.transactions.isCheckViolation(error, WHOLE_UNITS_CHECK)) {
      throw new StockRefused('whole_units');
    }
    throw error;
  }
}

@Injectable()
export class DrizzlePresetStore implements PresetStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(PresetRepository) private readonly presets: PresetRepository,
  ) {}

  listPresets(): Promise<PresetRecord[]> {
    return this.presets.listPresets(this.database.handle.db);
  }

  findPreset(key: string): Promise<PresetRecord | null> {
    return this.presets.findPreset(this.database.handle.db, key);
  }

  updatePreset(key: string, patch: PresetPatch): Promise<PresetRecord | null> {
    return this.presets.updatePreset(this.database.handle.db, key, patch);
  }
}

@Injectable()
export class DrizzleCatalogueDataStore implements CatalogueDataStore {
  constructor(
    @Inject(CatalogueDataRepository) private readonly catalogue: CatalogueDataRepository,
    @Inject(ShopSettingsRepository) private readonly settings: ShopSettingsRepository,
  ) {}

  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.catalogue.deleteAllForTenant(tx, tenantId);
    await this.settings.deleteForTenant(tx, tenantId);
  }
}

@Injectable()
export class DrizzleShopPolicyStore implements ShopPolicyStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ShopSettingsRepository) private readonly settings: ShopSettingsRepository,
  ) {}

  get(tenantId: string): Promise<ShopPaymentPolicy | null> {
    return this.transactions.run(this.database.handle.db, (tx) => this.find(tx, tenantId));
  }

  async find(tx: Transaction, tenantId: string): Promise<ShopPaymentPolicy | null> {
    const row = await this.settings.get(tx, tenantId);
    return row
      ? {
          defaultPaymentPolicy: row.defaultPaymentPolicy,
          defaultAdvanceAmount: row.defaultAdvanceAmount,
        }
      : null;
  }

  set(tenantId: string, policy: ShopPaymentPolicy): Promise<void> {
    return this.transactions.run(this.database.handle.db, (tx) =>
      this.settings.setPaymentPolicy(tx, tenantId, policy),
    );
  }
}

@Injectable()
export class DrizzleSizeChartStore implements SizeChartStore {
  constructor(@Inject(SizeChartRepository) private readonly charts: SizeChartRepository) {}

  findChart(
    tx: Transaction,
    tenantId: string,
    owner: SizeChartOwner,
  ): Promise<SizeChartRecord | null> {
    return this.charts.findChart(tx, tenantId, owner);
  }

  listCategoryCharts(tx: Transaction, tenantId: string): Promise<SizeChartRecord[]> {
    return this.charts.listCategoryCharts(tx, tenantId);
  }

  putChart(
    tx: Transaction,
    tenantId: string,
    owner: SizeChartOwner,
    rows: string[][],
  ): Promise<SizeChartRecord> {
    return this.charts.putChart(tx, tenantId, owner, rows);
  }

  deleteChart(tx: Transaction, tenantId: string, owner: SizeChartOwner): Promise<boolean> {
    return this.charts.deleteChart(tx, tenantId, owner);
  }
}

@Injectable()
export class DrizzleOptionSetStore implements OptionSetStore {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(OptionSetRepository) private readonly sets: OptionSetRepository,
  ) {}

  listOptionSets(tx: Transaction, tenantId: string): Promise<OptionSetRecord[]> {
    return this.sets.listOptionSets(tx, tenantId);
  }

  async insertOptionSet(
    tx: Transaction,
    values: { tenantId: string; name: string; options: string[] },
  ): Promise<OptionSetRecord> {
    try {
      return await this.sets.insertOptionSet(tx, values);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, OPTION_SET_NAME_INDEX))
        throw new UniqueViolation('name');
      throw error;
    }
  }

  deleteOptionSet(tx: Transaction, tenantId: string, id: string): Promise<boolean> {
    return this.sets.deleteOptionSet(tx, tenantId, id);
  }
}

@Injectable()
export class DrizzlePlatformLibraryStore implements PlatformLibraryStore {
  constructor(
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PlatformLibraryRepository) private readonly library: PlatformLibraryRepository,
  ) {}

  /** Runs a write, turning a taken name or value into UniqueViolation. */
  private async guarded<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (
        this.transactions.isUniqueViolation(error, PLATFORM_ATTRIBUTE_NAME_INDEX) ||
        this.transactions.isUniqueViolation(error, PLATFORM_OPTION_SET_NAME_INDEX)
      ) {
        throw new UniqueViolation('name');
      }
      if (this.transactions.isUniqueViolation(error, PLATFORM_OPTION_VALUE_INDEX))
        throw new UniqueViolation('value');
      throw error;
    }
  }

  listAttributes(tx: Transaction): Promise<AttributeRecord[]> {
    return this.library.listAttributes(tx);
  }

  findAttribute(tx: Transaction, id: string): Promise<AttributeRecord | null> {
    return this.library.findAttribute(tx, id);
  }

  findAttributeByName(tx: Transaction, name: string): Promise<AttributeRecord | null> {
    return this.library.findAttributeByName(tx, name);
  }

  insertAttribute(
    tx: Transaction,
    values: Pick<AttributeRecord, 'name' | 'dataType' | 'unitKind'>,
  ): Promise<AttributeRecord> {
    return this.guarded(() => this.library.insertAttribute(tx, values));
  }

  updateAttribute(
    tx: Transaction,
    id: string,
    patch: { name?: string; retiredAt?: Date | null },
  ): Promise<AttributeRecord | null> {
    return this.guarded(() => this.library.updateAttribute(tx, id, patch));
  }

  listOptions(tx: Transaction, attributeIds: string[]): Promise<OptionRecord[]> {
    return this.library.listOptions(tx, attributeIds);
  }

  findOption(tx: Transaction, attributeId: string, id: string): Promise<OptionRecord | null> {
    return this.library.findOption(tx, attributeId, id);
  }

  findOptionByValue(
    tx: Transaction,
    attributeId: string,
    value: string,
  ): Promise<OptionRecord | null> {
    return this.library.findOptionByValue(tx, attributeId, value);
  }

  nextOptionPosition(tx: Transaction, attributeId: string): Promise<number> {
    return this.library.nextOptionPosition(tx, attributeId);
  }

  insertOption(
    tx: Transaction,
    values: { attributeId: string; value: string; swatchColor: string | null; sortOrder: number },
  ): Promise<OptionRecord> {
    return this.guarded(() => this.library.insertOption(tx, values));
  }

  updateOption(
    tx: Transaction,
    attributeId: string,
    id: string,
    patch: OptionPatch,
  ): Promise<OptionRecord | null> {
    return this.guarded(() => this.library.updateOption(tx, attributeId, id, patch));
  }

  listOptionSets(tx: Transaction): Promise<OptionSetRecord[]> {
    return this.library.listOptionSets(tx);
  }

  nextOptionSetPosition(tx: Transaction): Promise<number> {
    return this.library.nextOptionSetPosition(tx);
  }

  insertOptionSet(
    tx: Transaction,
    values: { name: string; presetKey: string | null; options: string[]; sortOrder: number },
  ): Promise<OptionSetRecord> {
    return this.guarded(() => this.library.insertOptionSet(tx, values));
  }

  updateOptionSet(
    tx: Transaction,
    id: string,
    patch: PlatformOptionSetPatch,
  ): Promise<OptionSetRecord | null> {
    return this.guarded(() => this.library.updateOptionSet(tx, id, patch));
  }

  deleteOptionSet(tx: Transaction, id: string): Promise<OptionSetRecord | null> {
    return this.library.deleteOptionSet(tx, id);
  }
}
