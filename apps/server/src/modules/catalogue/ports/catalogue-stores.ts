import type {
  PlatformOptionSetPatch,
  PresetPatch,
  SizeChartOwner,
  Transaction,
} from '@lytronix/db';
import type {
  AttributeRecord,
  CategoryRecord,
  OptionRecord,
  OptionSetRecord,
  PresetRecord,
  ShopPaymentPolicy,
  ProductAttributeRecord,
  ProductAttributeValueRecord,
  ProductRecord,
  SizeChartRecord,
  VariantRecord,
  VariantValueRecord,
} from '../types/catalogue';
import type { ResolvedActor } from '../services/catalogue-activity';

/**
 * INV-02, INV-03, INV-19: what the inventory module does inside a product's own transaction, so a product and its
 * stock change together or not at all. Catalogue calls these and never depends on inventory: the caller passes
 * inventory's implementation, the same way the pay-as-you-go fee joins the creation's transaction.
 */
export interface ProductStockHooks {
  /**
   * A new product's stock already on the shelf, per variant (INV-03, reason `initial`), each line in the batch it
   * describes on a batch-tracked product (INV-12).
   */
  recordOpeningStock(
    tx: Transaction,
    tenantId: string,
    productId: string,
    lines: {
      variantId: string;
      quantity: string;
      batch?: { batchCode?: string; expiresOn?: string };
      /** INV-14: the serials of its units, as stored. */
      serials?: string[];
    }[],
    who: ResolvedActor,
  ): Promise<void>;
  /** Before a tracked product becomes made to order: the stock it holds written off to zero, recorded (INV-02). */
  beforeUntracking(
    tx: Transaction,
    tenantId: string,
    productId: string,
    who: ResolvedActor,
  ): Promise<void>;
  /** After its variants, tracking or threshold changed: its public stock state worked out again (CCH-08, INV-19). */
  refreshStockState(tx: Transaction, tenantId: string, productId: string): Promise<void>;
  /** INV-24: whether any variant of the product, its stock holder included, holds or has reserved any stock. */
  holdsStock(tx: Transaction, tenantId: string, productId: string): Promise<boolean>;
  /** INV-14: which of these serials (as stored) a unit the shop holds already has. */
  takenSerials(tx: Transaction, tenantId: string, serials: string[]): Promise<string[]>;
}

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
    values: {
      tenantId: string;
      attributeId: string;
      value: string;
      swatchColor?: string | null;
      sortOrder: number;
    },
  ): Promise<OptionRecord>;
  updateOption(
    tx: Transaction,
    tenantId: string,
    attributeId: string,
    id: string,
    patch: OptionPatch,
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

/** An option change: its value, its swatch (ATR-18), whether it is retired. */
export interface OptionPatch {
  value?: string;
  swatchColor?: string | null;
  retiredAt?: Date | null;
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
      'parentId' | 'name' | 'slug' | 'depth' | 'sortOrder' | 'visible' | 'behavesLike'
    > & {
      tenantId: string;
    },
  ): Promise<CategoryRecord>;
  updateCategory(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: Partial<
      Pick<CategoryRecord, 'name' | 'parentId' | 'depth' | 'sortOrder' | 'visible' | 'behavesLike'>
    >,
  ): Promise<CategoryRecord | null>;
  /** PST-06, PRD-17: the category and the ones above it, nearest first; empty when the shop has no such category. */
  lineage(tx: Transaction, tenantId: string, id: string): Promise<CategoryRecord[]>;
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
    | 'packAmount'
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
  /**
   * A SKU a live variant already has comes back as UniqueViolation('sku'); a fraction of a pack of a whole-unit
   * product as StockRefused('whole_units').
   */
  insertVariant(
    tx: Transaction,
    values: VariantChange & {
      tenantId: string;
      productId: string;
      combinationKey: string;
      isStockHolder?: boolean;
    },
  ): Promise<VariantRecord>;
  updateVariant(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: VariantChange,
  ): Promise<VariantRecord | null>;
  retireVariants(tx: Transaction, tenantId: string, ids: string[]): Promise<void>;
  insertVariantValues(tx: Transaction, rows: VariantValueRecord[]): Promise<void>;
  /** INV-24: the product's stock-holder variant, retired or not; never one of listVariants'. */
  findStockHolder(
    tx: Transaction,
    tenantId: string,
    productId: string,
  ): Promise<VariantRecord | null>;
  /** INV-24: clears every pack amount of a product that stops sharing its stock. */
  clearPackAmounts(tx: Transaction, tenantId: string, productId: string): Promise<void>;
  /** DLV-07: the zones the product may be delivered to. */
  listDeliveryZoneIds(tx: Transaction, tenantId: string, productId: string): Promise<string[]>;
  /** A zone the shop does not have comes back as MissingReference('zone'). */
  replaceDeliveryZones(
    tx: Transaction,
    tenantId: string,
    productId: string,
    zoneIds: string[],
  ): Promise<void>;
}

/** LIF-19: every catalogue row of a shop, and its settings row, deleted at day 60. */
export interface CatalogueDataStore {
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}

/** PRD-08: the shop-wide default payment policy, null until the shop sets one. */
export interface ShopPolicyStore {
  get(tenantId: string): Promise<ShopPaymentPolicy | null>;
  /** The same, inside the caller's transaction (a product's detail reads it with the product). */
  find(tx: Transaction, tenantId: string): Promise<ShopPaymentPolicy | null>;
  set(tenantId: string, policy: ShopPaymentPolicy): Promise<void>;
}

/** PST-01, PST-02, PST-04: the platform's shop-type presets. */
export interface PresetStore {
  listPresets(): Promise<PresetRecord[]>;
  findPreset(key: string): Promise<PresetRecord | null>;
  updatePreset(key: string, patch: PresetPatch): Promise<PresetRecord | null>;
}

export type { SizeChartOwner };

/** PRD-17: a shop's size charts, one per product or category. */
export interface SizeChartStore {
  findChart(
    tx: Transaction,
    tenantId: string,
    owner: SizeChartOwner,
  ): Promise<SizeChartRecord | null>;
  /** Every one of the shop's category charts, for the category list. */
  listCategoryCharts(tx: Transaction, tenantId: string): Promise<SizeChartRecord[]>;
  putChart(
    tx: Transaction,
    tenantId: string,
    owner: SizeChartOwner,
    rows: string[][],
  ): Promise<SizeChartRecord>;
  deleteChart(tx: Transaction, tenantId: string, owner: SizeChartOwner): Promise<boolean>;
}

/** ATR-16: the option sets a shop sees, and the ones it saves. */
export interface OptionSetStore {
  listOptionSets(tx: Transaction, tenantId: string): Promise<OptionSetRecord[]>;
  /** A name the shop already used comes back as UniqueViolation('name'). */
  insertOptionSet(
    tx: Transaction,
    values: { tenantId: string; name: string; options: string[] },
  ): Promise<OptionSetRecord>;
  deleteOptionSet(tx: Transaction, tenantId: string, id: string): Promise<boolean>;
}

/**
 * PST-04, ATL-01, ATR-16, ATR-18: the operator's curation of the platform's attributes, their options and the
 * platform's option sets. Names and values already taken come back as UniqueViolation('name') or ('value').
 */
export interface PlatformLibraryStore {
  listAttributes(tx: Transaction): Promise<AttributeRecord[]>;
  findAttribute(tx: Transaction, id: string): Promise<AttributeRecord | null>;
  findAttributeByName(tx: Transaction, name: string): Promise<AttributeRecord | null>;
  insertAttribute(
    tx: Transaction,
    values: Pick<AttributeRecord, 'name' | 'dataType' | 'unitKind'>,
  ): Promise<AttributeRecord>;
  updateAttribute(
    tx: Transaction,
    id: string,
    patch: { name?: string; retiredAt?: Date | null },
  ): Promise<AttributeRecord | null>;
  listOptions(tx: Transaction, attributeIds: string[]): Promise<OptionRecord[]>;
  findOption(tx: Transaction, attributeId: string, id: string): Promise<OptionRecord | null>;
  findOptionByValue(
    tx: Transaction,
    attributeId: string,
    value: string,
  ): Promise<OptionRecord | null>;
  nextOptionPosition(tx: Transaction, attributeId: string): Promise<number>;
  insertOption(
    tx: Transaction,
    values: { attributeId: string; value: string; swatchColor: string | null; sortOrder: number },
  ): Promise<OptionRecord>;
  updateOption(
    tx: Transaction,
    attributeId: string,
    id: string,
    patch: OptionPatch,
  ): Promise<OptionRecord | null>;
  listOptionSets(tx: Transaction): Promise<OptionSetRecord[]>;
  nextOptionSetPosition(tx: Transaction): Promise<number>;
  insertOptionSet(
    tx: Transaction,
    values: { name: string; presetKey: string | null; options: string[]; sortOrder: number },
  ): Promise<OptionSetRecord>;
  updateOptionSet(
    tx: Transaction,
    id: string,
    patch: PlatformOptionSetPatch,
  ): Promise<OptionSetRecord | null>;
  deleteOptionSet(tx: Transaction, id: string): Promise<OptionSetRecord | null>;
}
