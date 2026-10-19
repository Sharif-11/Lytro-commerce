import type {
  SelectAttribute,
  SelectAttributeOption,
  SelectBusinessTypePreset,
  SelectCategory,
  SelectProduct,
  SelectProductAttribute,
  SelectProductAttributeValue,
  SelectProductVariant,
  SelectVariantAttributeValue,
} from '@lytronix/db';
import type {
  AttributeDataType,
  AttributeRole,
  DeliveryMode,
  PaymentPolicy,
  PlanLimits,
  StockState,
  StockTracking,
  StockUnit,
  TenantState,
} from '@lytronix/validators';

// The stored rows, as aliases of the shared types (ENGINEERING-STANDARDS §4), never copies.
export type CategoryRecord = SelectCategory;
export type AttributeRecord = SelectAttribute;
export type OptionRecord = SelectAttributeOption;
export type ProductRecord = SelectProduct;
export type ProductAttributeRecord = SelectProductAttribute;
export type ProductAttributeValueRecord = SelectProductAttributeValue;
export type VariantRecord = SelectProductVariant;
export type VariantValueRecord = SelectVariantAttributeValue;
export type PresetRecord = SelectBusinessTypePreset;

/** The shop a catalogue call acts for: its plan limits (with overrides merged), its state and its business type. */
export interface CatalogueShop {
  id: string;
  state: TenantState;
  planLimits: PlanLimits | null;
  businessType: string | null;
}

/** Who made a change, for the activity log (AUD-02): the staff member, or null for the owner, and from where. */
export interface CatalogueActor {
  userId: string | null;
  ip: string | null;
}

/** 'platform' rows come from the shared library (ATL-01); 'shop' rows are the shop's own. */
export type CatalogueScope = 'platform' | 'shop';

export interface OptionView {
  id: string;
  value: string;
  scope: CatalogueScope;
  retired: boolean;
}

export interface AttributeView {
  id: string;
  name: string;
  dataType: AttributeDataType;
  unitKind: string | null;
  scope: CatalogueScope;
  retired: boolean;
  options: OptionView[];
}

export interface CategoryView {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  depth: number;
  sortOrder: number;
  visible: boolean;
  /** Products not archived that are filed under it. */
  productCount: number;
  /** ATR-02: attributes suggested for products filed under it, in order. */
  suggestedAttributeIds: string[];
}

/** PST-02: what a new product starts with in this shop. */
export interface ProductDefaults {
  businessType: string | null;
  stockUnit: StockUnit;
  stockTracking: StockTracking;
  batchTracked: boolean;
  serialTracked: boolean;
  lowStockThreshold: string;
  suggestedAttributeIds: string[];
  suggestedCategories: string[];
}

export interface PresetView {
  key: string;
  labelBn: string;
  labelEn: string;
  defaults: Omit<ProductDefaults, 'businessType'>;
}

export interface VariantAttributeView {
  attributeId: string;
  name: string;
  dataType: AttributeDataType;
  unitKind: string | null;
  /** The options its live variants use, in the attribute's own order. */
  options: { id: string; value: string }[];
}

export interface ProductAttributeView {
  attributeId: string;
  name: string;
  dataType: AttributeDataType;
  unitKind: string | null;
  role: Exclude<AttributeRole, 'variant_defining'>;
  optionIds: string[];
  textValue: string | null;
  numberValue: string | null;
  boolValue: boolean | null;
}

export interface VariantView {
  id: string;
  optionIds: string[];
  sku: string | null;
  barcode: string | null;
  price: string | null;
  /** ATR-05: the price it sells at, its own or the product's. */
  effectivePrice: string;
  weightKg: string | null;
  deliveryCharge: string | null;
  deliveryMode: DeliveryMode | null;
  /** PRD-16, ATR-13: Default whenever no weight applies, whatever is stored. */
  effectiveDeliveryMode: DeliveryMode;
  active: boolean;
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  /** LND-04: earlier slugs that still lead here. */
  oldSlugs: string[];
  description: string | null;
  basePrice: string;
  stockUnit: StockUnit;
  stockTracking: StockTracking;
  batchTracked: boolean;
  serialTracked: boolean;
  lowStockThreshold: string;
  deliveryCharge: string | null;
  weightKg: string | null;
  deliveryMode: DeliveryMode;
  effectiveDeliveryMode: DeliveryMode;
  paymentPolicy: PaymentPolicy | null;
  advanceAmount: string | null;
  active: boolean;
  archived: boolean;
  categoryIds: string[];
  primaryCategoryId: string | null;
  minPrice: string | null;
  maxPrice: string | null;
  stockState: StockState;
  variantAttributes: VariantAttributeView[];
  attributes: ProductAttributeView[];
  variants: VariantView[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  basePrice: string;
  minPrice: string | null;
  maxPrice: string | null;
  active: boolean;
  stockState: StockState;
  primaryCategoryId: string | null;
  variantCount: number;
  createdAt: Date;
}

/** API-17: one page of a list, with how many there are in all. */
export interface ProductPage {
  products: ProductListItem[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}
