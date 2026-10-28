import type {
  AttributeDataType,
  PaymentPolicy,
  ProductFormField,
  SerialFormat,
  StockTracking,
  StockUnit,
  UnitKind,
} from '@lytronix/validators';
import type { OptionSwatch } from './product';

/** ATL-01: the platform's library, curated by the operator, or the shop's own. */
export type CatalogueScope = 'platform' | 'shop';

/** Mirrors `optionViewSchema` in apps/server/src/modules/team/dto/catalogue-response.dto.ts (ATR-18). */
export interface AttributeOption extends OptionSwatch {
  id: string;
  value: string;
  scope: CatalogueScope;
  retired: boolean;
}

/** Mirrors `attributeViewSchema` (ATL-01): one attribute of the library or the shop's, with its options. */
export interface Attribute {
  id: string;
  name: string;
  dataType: AttributeDataType;
  /** UOM-02: what a number with a unit measures; null for every other type. */
  unitKind: UnitKind | null;
  scope: CatalogueScope;
  retired: boolean;
  options: AttributeOption[];
}

/** Mirrors `optionSetViewSchema` (ATR-16): values inserted in one tap. */
export interface OptionSet {
  id: string;
  name: string;
  options: string[];
  scope: CatalogueScope;
  presetKey: string | null;
}

/** Mirrors `productDefaultsSchema` (PST-02, PST-05, PST-06): what a new product starts with, filed where it is. */
export interface ProductDefaults {
  businessType: string | null;
  presetKey: string | null;
  fromCategoryId: string | null;
  stockUnit: StockUnit;
  stockTracking: StockTracking;
  batchTracked: boolean;
  serialTracked: boolean;
  serialFormat: SerialFormat;
  lowStockThreshold: string;
  suggestedAttributeIds: string[];
  suggestedCategories: string[];
  upFrontFields: ProductFormField[];
  /** PRD-08: the shop's default, which a product with no policy of its own follows. */
  shopPaymentPolicy: { defaultPaymentPolicy: PaymentPolicy; defaultAdvanceAmount: string | null };
}

/** Mirrors the variant rows of `GET /products/:id/stock` (INV-01, INV-24), the figures the variant table shows. */
export interface VariantStock {
  variantId: string;
  optionIds: string[];
  retired: boolean;
  /** Null for a variant drawing on a shared stock, which holds none of its own. */
  onHand: string | null;
  /** Held for orders not shipped yet ("Waiting to ship"); null like onHand. */
  reserved: string | null;
  available: string;
  /** INV-14: on a serial-numbered product, how many units held have no serial yet; null otherwise. */
  missingSerials: number | null;
  /** INV-10, D3-9: present only for someone who may manage stock; null is unknown. */
  avgCost?: string | null;
}

/** INV-24: the stock a product's variants share, in its unit, held by a variant of its own. */
export interface SharedStock {
  variantId: string;
  onHand: string;
  reserved: string;
  available: string;
  avgCost?: string | null;
}

/** GET /products/:id/stock, as far as the editor and its Stock card read it (INV-01, Slice 11.7c). */
export interface ProductStock {
  productId: string;
  stockUnit: StockUnit;
  /** INV-24: the stock the variants share; null when each holds its own. */
  shared: SharedStock | null;
  variants: VariantStock[];
}
