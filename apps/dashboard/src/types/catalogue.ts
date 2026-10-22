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

export interface ProductPage {
  products: ProductSummary[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** Mirrors `categoryViewSchema`: the fields a list needs (ATR-07). */
export interface CategorySummary {
  id: string;
  parentId: string | null;
  name: string;
}
