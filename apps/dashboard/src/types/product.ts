import type { StockState } from '@lytronix/validators';
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

/** ATR-11: a variant-defining attribute with the options its live variants use. */
export interface VariantAttribute {
  attributeId: string;
  name: string;
  options: { id: string; value: string }[];
}

/** One variant, by the options that name it. */
export interface ProductVariant {
  id: string;
  optionIds: string[];
  active: boolean;
  stockState: StockState;
}

/**
 * Mirrors `ProductDetail` in apps/server/src/modules/catalogue/types/catalogue.ts, the fields the editor reads in Slice
 * 11.7a (TENANT-DASHBOARD-DESIGN §7.4).
 */
export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  /** LND-04: earlier slugs that still lead here. */
  oldSlugs: string[];
  description: string | null;
  basePrice: string;
  active: boolean;
  archived: boolean;
  categoryIds: string[];
  primaryCategoryId: string | null;
  minPrice: string | null;
  maxPrice: string | null;
  stockState: StockState;
  variantAttributes: VariantAttribute[];
  variants: ProductVariant[];
  images: ProductImage[];
  video: ProductVideo | null;
  createdAt: string;
  updatedAt: string;
}
