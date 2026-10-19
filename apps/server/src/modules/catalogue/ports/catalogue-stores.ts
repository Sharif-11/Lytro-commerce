import type { Transaction } from '@lytronix/db';
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
} from '../types/catalogue';

/** Opens one transaction for a unit of catalogue work; every store method below takes it. */
export interface CatalogueTransactions {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
}

/** ATL-01, ATR-01, ATR-02, ATR-10: the attribute library a shop sees, and its categories' suggestions. */
export interface AttributeStore {
  listAttributes(
    tx: Transaction,
    tenantId: string,
    includeRetired: boolean,
  ): Promise<AttributeRecord[]>;
  findAttributes(tx: Transaction, tenantId: string, ids: string[]): Promise<AttributeRecord[]>;
  findAttributeByName(
    tx: Transaction,
    tenantId: string,
    name: string,
  ): Promise<AttributeRecord | null>;
  insertAttribute(
    tx: Transaction,
    values: Pick<AttributeRecord, 'name' | 'dataType' | 'unitKind'> & { tenantId: string },
  ): Promise<AttributeRecord>;
  updateAttribute(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: { name?: string; retiredAt?: Date | null },
  ): Promise<AttributeRecord | null>;
  listOptions(
    tx: Transaction,
    tenantId: string,
    attributeIds: string[],
    includeRetired: boolean,
  ): Promise<OptionRecord[]>;
  findOptions(tx: Transaction, tenantId: string, ids: string[]): Promise<OptionRecord[]>;
  findOptionByValue(
    tx: Transaction,
    tenantId: string,
    attributeId: string,
    value: string,
  ): Promise<OptionRecord | null>;
  nextOptionPosition(tx: Transaction, tenantId: string, attributeId: string): Promise<number>;
  insertOption(
    tx: Transaction,
    values: { tenantId: string; attributeId: string; value: string; sortOrder: number },
  ): Promise<OptionRecord>;
  updateOption(
    tx: Transaction,
    tenantId: string,
    attributeId: string,
    id: string,
    patch: { value?: string; retiredAt?: Date | null },
  ): Promise<OptionRecord | null>;
  listCategorySuggestions(
    tx: Transaction,
    tenantId: string,
    categoryIds: string[],
  ): Promise<{ categoryId: string; attributeId: string }[]>;
  replaceCategorySuggestions(
    tx: Transaction,
    tenantId: string,
    categoryId: string,
    attributeIds: string[],
  ): Promise<void>;
}

/** PRD-03: a shop's category tree. */
export interface CategoryStore {
  listCategories(tx: Transaction, tenantId: string): Promise<CategoryRecord[]>;
  findCategories(tx: Transaction, tenantId: string, ids: string[]): Promise<CategoryRecord[]>;
  slugsLike(tx: Transaction, tenantId: string, base: string): Promise<string[]>;
  insertCategory(
    tx: Transaction,
    values: Pick<
      CategoryRecord,
      'parentId' | 'name' | 'slug' | 'depth' | 'sortOrder' | 'visible'
    > & {
      tenantId: string;
    },
  ): Promise<CategoryRecord>;
  updateCategory(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: Partial<Pick<CategoryRecord, 'name' | 'parentId' | 'depth' | 'sortOrder' | 'visible'>>,
  ): Promise<CategoryRecord | null>;
  subtree(tx: Transaction, tenantId: string, id: string): Promise<{ id: string; level: number }[]>;
  setSubtreeDepths(
    tx: Transaction,
    tenantId: string,
    subtree: { id: string; level: number }[],
    rootDepth: number,
  ): Promise<void>;
  countChildren(tx: Transaction, tenantId: string, id: string): Promise<number>;
  countLiveProducts(tx: Transaction, tenantId: string, id: string): Promise<number>;
  /** Live products filed under each category, for the category list. */
  countLiveProductsByCategory(tx: Transaction, tenantId: string): Promise<Map<string, number>>;
  unfileProducts(tx: Transaction, tenantId: string, id: string): Promise<string[]>;
  deleteCategory(tx: Transaction, tenantId: string, id: string): Promise<void>;
}

/** A product field change; the slug and the price range are never set this way. */
export type ProductChange = Partial<
  Omit<
    ProductRecord,
    'id' | 'tenantId' | 'slug' | 'createdAt' | 'updatedAt' | 'minPrice' | 'maxPrice'
  >
>;

/** A variant change: its overrides, whether it sells, and whether it is retired. */
export type VariantChange = Partial<
  Pick<
    VariantRecord,
    | 'sku'
    | 'barcode'
    | 'price'
    | 'weightKg'
    | 'deliveryCharge'
    | 'deliveryMode'
    | 'active'
    | 'deletedAt'
  >
>;

/** PRD-01 to PRD-05, PRD-15, ATR-04 to ATR-14, LND-04, CCH-02: products, their variants and the catalogue version. */
export interface ProductStore {
  lockCatalogue(tx: Transaction, tenantId: string): Promise<void>;
  bumpVersion(tx: Transaction, tenantId: string): Promise<number>;
  countLiveProducts(tx: Transaction, tenantId: string): Promise<number>;
  slugsLike(tx: Transaction, tenantId: string, base: string): Promise<string[]>;
  slugHolder(
    tx: Transaction,
    tenantId: string,
    slug: string,
  ): Promise<{ productId: string; current: boolean } | null>;
  /** A slug another write took first comes back as UniqueViolation('slug'). */
  insertProduct(
    tx: Transaction,
    values: ProductChange &
      Pick<ProductRecord, 'name' | 'slug' | 'basePrice'> & { tenantId: string },
  ): Promise<ProductRecord>;
  findProduct(
    tx: Transaction,
    tenantId: string,
    id: string,
    includeArchived: boolean,
  ): Promise<ProductRecord | null>;
  updateProduct(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: ProductChange & { slug?: string },
  ): Promise<ProductRecord | null>;
  deleteProduct(tx: Transaction, tenantId: string, id: string): Promise<void>;
  listProducts(
    tx: Transaction,
    tenantId: string,
    filter: { search?: string; categoryId?: string; offset: number; limit: number },
  ): Promise<{ rows: { product: ProductRecord; variantCount: number }[]; total: number }>;
  listCategoryLinks(
    tx: Transaction,
    tenantId: string,
    productIds: string[],
  ): Promise<{ productId: string; categoryId: string }[]>;
  replaceCategoryLinks(
    tx: Transaction,
    tenantId: string,
    productId: string,
    categoryIds: string[],
  ): Promise<void>;
  listProductAttributes(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<ProductAttributeRecord[]>;
  listAttributeValues(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<ProductAttributeValueRecord[]>;
  insertProductAttributes(tx: Transaction, rows: ProductAttributeRecord[]): Promise<void>;
  setAttributeOrder(
    tx: Transaction,
    tenantId: string,
    productId: string,
    attributeId: string,
    sortOrder: number,
  ): Promise<void>;
  deleteProductAttributes(
    tx: Transaction,
    tenantId: string,
    productId: string,
    attributeIds: string[],
  ): Promise<void>;
  insertAttributeValues(
    tx: Transaction,
    rows: Omit<ProductAttributeValueRecord, 'id'>[],
  ): Promise<void>;
  insertRedirect(
    tx: Transaction,
    tenantId: string,
    oldSlug: string,
    productId: string,
  ): Promise<void>;
  deleteRedirect(tx: Transaction, tenantId: string, oldSlug: string): Promise<void>;
  listRedirects(tx: Transaction, tenantId: string, productId: string): Promise<string[]>;
  refreshPriceRange(tx: Transaction, tenantId: string, productId: string): Promise<void>;
  listVariants(
    tx: Transaction,
    tenantId: string,
    productId: string,
    includeRetired: boolean,
  ): Promise<VariantRecord[]>;
  listVariantValues(
    tx: Transaction,
    tenantId: string,
    variantIds: string[],
  ): Promise<VariantValueRecord[]>;
  /** A SKU a live variant already has comes back as UniqueViolation('sku'). */
  insertVariant(
    tx: Transaction,
    values: VariantChange & { tenantId: string; productId: string; combinationKey: string },
  ): Promise<VariantRecord>;
  updateVariant(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: VariantChange,
  ): Promise<VariantRecord | null>;
  retireVariants(tx: Transaction, tenantId: string, ids: string[]): Promise<void>;
  insertVariantValues(tx: Transaction, rows: VariantValueRecord[]): Promise<void>;
}

/** PST-01, PST-02: the platform's shop-type presets. */
export interface PresetStore {
  listPresets(): Promise<PresetRecord[]>;
  findPreset(key: string): Promise<PresetRecord | null>;
}
