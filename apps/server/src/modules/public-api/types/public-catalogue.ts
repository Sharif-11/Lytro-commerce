import type {
  AttributeDataType,
  ItemCondition,
  PaymentPolicy,
  StockState,
  StockUnit,
} from '@lytronix/validators';
import type { ImageView, VideoView } from '../../../common/media-links';

/** CCH-04: what the public catalogue shows now, as one value: the shop's version and the platform library's. */
export interface CatalogueVersionView {
  version: string;
}

/** ATR-18: a value a shopper picks, such as a size or a colour, with its swatch when it has one. */
export interface PublicOptionValue {
  id: string;
  value: string;
  swatchColor: string | null;
  swatchImage: ImageView | null;
}

/** CCH-11: a product as a public list shows it, from its own row and, for the swatches, one read for the whole page. */
export interface PublicProductCard {
  id: string;
  slug: string;
  name: string;
  minPrice: string | null;
  maxPrice: string | null;
  stockState: StockState;
  /** Its first photo. */
  image: ImageView | null;
  /** When it was added (ISO); a storefront marks one added in the last PRODUCT_NEW_DAYS "New" (Slice 12b). */
  createdAt: string;
  /** ATR-18, Slice 12b: its first swatched choice's values on sale, such as its colours; empty for none. */
  swatches: PublicOptionValue[];
}

export interface PublicProductPage {
  products: PublicProductCard[];
  /** Where the next page starts; null on the last page. */
  nextCursor: string | null;
}

/** ATR-04, ATR-18: one choice a shopper makes, such as size, with the values its variants on sale use. */
export interface PublicProductOption {
  attributeId: string;
  name: string;
  dataType: AttributeDataType;
  unitKind: string | null;
  values: PublicOptionValue[];
}

/** ATR-02: a fact about the product, such as its material, written out. */
export interface PublicProductAttribute {
  name: string;
  dataType: AttributeDataType;
  unitKind: string | null;
  values: string[];
  text: string | null;
  number: string | null;
  yes: boolean | null;
}

/**
 * ATR-07, CCH-08: a variant on sale. One that has sold out is still listed, so a picker can show it, and can't be
 * ordered (`available` false).
 */
export interface PublicVariant {
  id: string;
  optionIds: string[];
  price: string;
  stockState: StockState;
  available: boolean;
}

/** PRD-09: a product's public page: never its costs, its exact stock or anything only the shop sees. */
export interface PublicProductDetail {
  id: string;
  /** LND-04: its current link; a request by an old one is answered with this, so the caller can redirect. */
  slug: string;
  name: string;
  description: string | null;
  minPrice: string | null;
  maxPrice: string | null;
  stockState: StockState;
  stockUnit: StockUnit;
  /** FED-02: new, refurbished or used. */
  condition: ItemCondition;
  primaryCategoryId: string | null;
  categoryIds: string[];
  images: ImageView[];
  video: VideoView | null;
  options: PublicProductOption[];
  attributes: PublicProductAttribute[];
  variants: PublicVariant[];
  sizeChart: { rows: string[][] | null; image: ImageView | null } | null;
  /** PRD-08: what an order for it must pay first; the order works it out again at the time (CCH-07). */
  paymentPolicy: PaymentPolicy;
  advanceAmount: string | null;
  /** DLV-07: the zones it may be delivered to (the shop's zone list names them); empty is anywhere. */
  deliveryZoneIds: string[];
  /** CMB-06, CMB-09: a combo's "What's inside" and its saving; null for an ordinary product. */
  combo: PublicCombo | null;
}

/** CMB-06, CMB-09: what a combo holds, and what it saves against its parts bought apart. */
export interface PublicCombo {
  /** "You save ৳X": the parts' prices less the combo's, null unless positive. */
  saving: string | null;
  parts: PublicComboPart[];
}

/**
 * CMB-09: one part -- its quantity in one combo, its product's name and photo, and its variants on sale: one for a
 * fixed part; for a choice, those the shopper picks from, one per unit, each marked whether it can be had now.
 */
export interface PublicComboPart {
  position: number;
  quantity: string;
  productName: string;
  image: ImageView | null;
  choice: boolean;
  variants: { variantId: string; productName: string; label: string; available: boolean }[];
}

/** PRD-03: a visible category, with its visible subcategories in the shop's order. */
export interface PublicCategory {
  id: string;
  slug: string;
  name: string;
  image: ImageView | null;
  /** Slice 12b: its active products, its subcategories' included (hidden ones too), as its list shows them. */
  productCount: number;
  children: PublicCategory[];
}

/** A public catalogue answer with the headers it goes out with (CCH-03). */
export interface CatalogueAnswer<T> {
  data: T;
  etag: string;
  cacheControl: string;
}
