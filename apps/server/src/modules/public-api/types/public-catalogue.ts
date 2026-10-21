import type { AttributeDataType, PaymentPolicy, StockState, StockUnit } from '@lytronix/validators';
import type { ImageView, VideoView } from '../../../common/media-links';

/** CCH-04: what the public catalogue shows now, as one value: the shop's version and the platform library's. */
export interface CatalogueVersionView {
  version: string;
}

/** CCH-11: a product as a public list shows it: no variant is read for it. */
export interface PublicProductCard {
  id: string;
  slug: string;
  name: string;
  minPrice: string | null;
  maxPrice: string | null;
  stockState: StockState;
  /** Its first photo. */
  image: ImageView | null;
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
  values: {
    id: string;
    value: string;
    swatchColor: string | null;
    swatchImage: ImageView | null;
  }[];
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
}

/** PRD-03: a visible category, with its visible subcategories in the shop's order. */
export interface PublicCategory {
  id: string;
  slug: string;
  name: string;
  image: ImageView | null;
  children: PublicCategory[];
}

/** A public catalogue answer with the headers it goes out with (CCH-03). */
export interface CatalogueAnswer<T> {
  data: T;
  etag: string;
  cacheControl: string;
}
