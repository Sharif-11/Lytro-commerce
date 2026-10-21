import type {
  SelectAttribute,
  SelectAttributeOption,
  SelectBusinessTypePreset,
  SelectCategory,
  SelectOptionSet,
  SelectProduct,
  SelectProductAttribute,
  SelectProductAttributeValue,
  SelectProductVariant,
  SelectSizeChart,
  SelectVariantAttributeValue,
} from '@lytronix/db';
import type {
  AttributeDataType,
  AttributeRole,
  DeliveryMode,
  PaymentPolicy,
  PlanLimits,
  ProductFormField,
  SerialFormat,
  StockState,
  StockTracking,
  StockUnit,
  TenantState,
} from '@lytronix/validators';
import type { ImageView, VideoView } from '../../../common/media-links';

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
export type SizeChartRecord = SelectSizeChart;
export type OptionSetRecord = SelectOptionSet;

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

/** PST-04, ATL-01: the operator curating the platform's library, and from where (AUD-03). */
export interface OperatorActor {
  operatorId: string;
  ip: string | null;
}

/** 'platform' rows come from the shared library (ATL-01); 'shop' rows are the shop's own. */
export type CatalogueScope = 'platform' | 'shop';

export interface OptionView {
  id: string;
  value: string;
  /** ATR-18: #RRGGBB, or null for an option shown by its name alone. */
  swatchColor: string | null;
  /** ATR-18, MED-03: a shop's own option may show an image instead; null for none. */
  swatchImage: ImageView | null;
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
  /** PST-06: the shop type its products behave like; null follows its parent, then the shop. */
  behavesLike: string | null;
  /** MED-03: its banner, or null. */
  image: ImageView | null;
  /** PRD-17: its own size chart as a table, or null. */
  sizeChart: string[][] | null;
  /** PRD-17, MED-03: its own size chart as an image, or null. */
  sizeChartImage: ImageView | null;
}

/** PST-02, PST-05: what one shop type gives a new product. */
export interface PresetDefaults {
  stockUnit: StockUnit;
  stockTracking: StockTracking;
  batchTracked: boolean;
  serialTracked: boolean;
  /** INV-23: what a new product's serials look like. */
  serialFormat: SerialFormat;
  lowStockThreshold: string;
  suggestedAttributeIds: string[];
  suggestedCategories: string[];
  /** PST-05: the optional fields the product form shows up front; the rest sit under "More settings". */
  upFrontFields: ProductFormField[];
}

/** PST-02, PST-06: what a new product starts with in this shop, filed under this category or none. */
export interface ProductDefaults extends PresetDefaults {
  /** The shop's own type. */
  businessType: string | null;
  /** The type these defaults come from: a category's "behaves like", else the shop's, else "other". */
  presetKey: string | null;
  /** PST-06: the category whose "behaves like" chose the type, or null when the shop's own type applies. */
  fromCategoryId: string | null;
}

export interface PresetView {
  key: string;
  labelBn: string;
  labelEn: string;
  defaults: PresetDefaults;
}

/** ATR-16: a set of values inserted in one tap. */
export interface OptionSetView {
  id: string;
  name: string;
  options: string[];
  scope: CatalogueScope;
  /** A platform set offered first to shops of this type, or null. */
  presetKey: string | null;
}

/** PRD-08: the policy every product with none of its own follows. */
export interface ShopPaymentPolicy {
  defaultPaymentPolicy: PaymentPolicy;
  defaultAdvanceAmount: string | null;
}

/** PRD-17: the chart a product shows, its own or the nearest category's. */
export interface SizeChartView {
  source: 'product' | 'category';
  /** The category it comes from, when it is not the product's own. */
  categoryId: string | null;
  /** A table of short text, or null when the chart is an image (MED-03). */
  rows: string[][] | null;
  image: ImageView | null;
}

export interface VariantAttributeView {
  attributeId: string;
  name: string;
  dataType: AttributeDataType;
  unitKind: string | null;
  /** The options its live variants use, in the attribute's own order, with their swatches (ATR-18). */
  options: {
    id: string;
    value: string;
    swatchColor: string | null;
    swatchImage: ImageView | null;
  }[];
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
  /** INV-24: how much of the product's shared stock one unit of it uses; null unless the product shares its stock. */
  packAmount: string | null;
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
  /** INV-23: what its serials look like. */
  serialFormat: SerialFormat;
  /** INV-24: whether its variants draw on one shared stock. */
  sharedStock: boolean;
  lowStockThreshold: string;
  deliveryCharge: string | null;
  weightKg: string | null;
  deliveryMode: DeliveryMode;
  effectiveDeliveryMode: DeliveryMode;
  /** PRD-08: its own policy, or null to follow the shop's default. */
  paymentPolicy: PaymentPolicy | null;
  advanceAmount: string | null;
  /** PRD-08: the policy that applies: its own, else the shop's default, with that policy's advance. */
  effectivePaymentPolicy: PaymentPolicy;
  effectiveAdvanceAmount: string | null;
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
  /** PRD-17: its own chart, else its primary category's or the nearest one above it; null for none. */
  sizeChart: SizeChartView | null;
  /** PRD-11: its photos, in the order shown (up to 10). */
  images: ImageView[];
  /** PRD-11: its one video, or null. */
  video: VideoView | null;
  /** DLV-07: the zones it may be delivered to; empty means wherever the shop delivers. */
  deliveryZoneIds: string[];
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
  /** PRD-11: its first photo, for the list, or null. */
  image: ImageView | null;
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
