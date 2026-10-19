import { Inject, Injectable } from '@nestjs/common';
import {
  AttributeRepository,
  CategoryRepository,
  PresetRepository,
  ProductRepository,
  TransactionRunner,
  VariantRepository,
  type Transaction,
} from '@lytronix/db';
import { UniqueViolation } from '../../common/errors/unique-violation';
import type {
  AttributeStore,
  CatalogueTransactions,
  CategoryStore,
  PresetStore,
  ProductChange,
  ProductStore,
  VariantChange,
} from '../../modules/catalogue/ports/catalogue-stores';
import type {
  AttributeRecord,
  CategoryRecord,
  OptionRecord,
  PresetRecord,
  ProductAttributeRecord,
  ProductAttributeValueRecord,
  ProductRecord,
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
    values: { tenantId: string; attributeId: string; value: string; sortOrder: number },
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
    patch: { value?: string; retiredAt?: Date | null },
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
      'parentId' | 'name' | 'slug' | 'depth' | 'sortOrder' | 'visible'
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
    patch: Partial<Pick<CategoryRecord, 'name' | 'parentId' | 'depth' | 'sortOrder' | 'visible'>>,
  ): Promise<CategoryRecord | null> {
    return this.categories.updateCategory(tx, tenantId, id, patch);
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
    values: VariantChange & { tenantId: string; productId: string; combinationKey: string },
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

  insertVariantValues(tx: Transaction, rows: VariantValueRecord[]): Promise<void> {
    return this.variants.insertVariantValues(tx, rows);
  }

  private rethrowVariantConflict(error: unknown): never {
    if (this.transactions.isUniqueViolation(error, VARIANT_SKU_INDEX))
      throw new UniqueViolation('sku');
    if (this.transactions.isUniqueViolation(error, VARIANT_COMBINATION_KEY)) {
      throw new UniqueViolation('combination');
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
}
