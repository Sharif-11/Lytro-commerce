import type { StockState } from '@lytronix/validators';
import type { ImageView } from './me';

/** Mirrors `productPageSchema` in apps/server/src/modules/team/dto/catalogue-response.dto.ts (PRD-12). */
export interface ProductSummary {
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
  image: ImageView | null;
  createdAt: string;
}

/**
 * PRD-12, INV-08, PRD-13: the segments' counts over what the search and category pick -- the products not archived,
 * the active ones, the active ones low or out of stock, and the archived ones.
 */
export interface ProductCounts {
  total: number;
  active: number;
  low: number;
  out: number;
  archived: number;
}

export interface ProductPage {
  products: ProductSummary[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  counts: ProductCounts;
  /** PRD-04: the most products the shop may have; null for no limit. */
  productLimit: number | null;
}

/** Mirrors `categoryViewSchema`: the fields a list and the product form need (ATR-07, PRD-17). */
export interface CategorySummary {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  /** PRD-17: its own chart, a table or a picture; null when it has none. */
  sizeChart: string[][] | null;
  sizeChartImage: ImageView | null;
}
