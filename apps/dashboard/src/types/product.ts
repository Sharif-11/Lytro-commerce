import type {
  AttributeDataType,
  AttributeRole,
  DeliveryMode,
  StockState,
  StockTracking,
  StockUnit,
  UnitKind,
} from '@lytronix/validators';
import type { ImageView } from './me';

/** PRD-11, STO-01: a product's photo in its editor, with the bytes it stores (every file of it). */
export interface ProductImage extends ImageView {
  bytes: number;
}

/** PRD-11, STO-01, STO-09: its one video, with its bytes and its length. */
export interface ProductVideo {
  id: string;
  urls: { video: string; poster: string };
  bytes: number;
  durationMs: number | null;
}

/** ATR-18: what an option shows beside its name, a colour or a small picture of the shop's; neither for its name alone. */
export interface OptionSwatch {
  swatchColor: string | null;
  swatchImage: ImageView | null;
}

/** An option as a product uses it: its value (a number in its unit kind's base unit for a number, UOM-02). */
export interface UsedOption extends OptionSwatch {
  id: string;
  value: string;
}

/** ATR-11: a variant-defining attribute with the options its live variants use. */
export interface VariantAttribute {
  attributeId: string;
  name: string;
  dataType: AttributeDataType;
  unitKind: UnitKind | null;
  options: UsedOption[];
}

/** ATL-02, ATR-08: an attribute that describes the product, with its value, or is asked when ordering. */
export interface ProductAttribute {
  attributeId: string;
  name: string;
  dataType: AttributeDataType;
  unitKind: UnitKind | null;
  role: AttributeRole.Informational | AttributeRole.CapturedAtOrder;
  optionIds: string[];
  /** The chosen values as written, in the order of `optionIds`. */
  optionValues: string[];
  textValue: string | null;
  numberValue: string | null;
  boolValue: boolean | null;
}

/** One variant, by the options that name it, with what it overrides of the product (ATR-05, ATR-13, INV-24). */
export interface ProductVariant {
  id: string;
  optionIds: string[];
  sku: string | null;
  barcode: string | null;
  /** Its own price, or null to sell at the product's. */
  price: string | null;
  effectivePrice: string;
  weightKg: string | null;
  deliveryCharge: string | null;
  deliveryMode: DeliveryMode | null;
  /** INV-24: how much of the shared stock one of it uses; null unless the product shares its stock. */
  packAmount: string | null;
  active: boolean;
  stockState: StockState;
}

/**
 * Mirrors `ProductDetail` in apps/server/src/modules/catalogue/types/catalogue.ts, the fields the editor reads through
 * Slice 11.7b (TENANT-DASHBOARD-DESIGN §7.4).
 */
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
  /** INV-24: whether its variants draw on one shared stock. */
  sharedStock: boolean;
  active: boolean;
  archived: boolean;
  categoryIds: string[];
  primaryCategoryId: string | null;
  minPrice: string | null;
  maxPrice: string | null;
  stockState: StockState;
  variantAttributes: VariantAttribute[];
  attributes: ProductAttribute[];
  variants: ProductVariant[];
  images: ProductImage[];
  video: ProductVideo | null;
  createdAt: string;
  updatedAt: string;
}
