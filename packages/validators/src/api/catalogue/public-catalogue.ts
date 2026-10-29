import { z } from 'zod';
import {
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_SLUG_MAX_LENGTH,
  PUBLIC_PAGE_SIZE,
  PUBLIC_PAGE_SIZE_MAX,
} from '../../common/limits';
import { queryFlag } from './catalogue-common';

/**
 * PRD-09: how the public product list is ordered. Featured is the shop's own order, newest first within it; price
 * sorts by the lowest price a product sells at; relevance, the default with a search, puts the best matches first.
 */
export enum PublicProductSort {
  Featured = 'featured',
  Newest = 'newest',
  PriceLow = 'price_low',
  PriceHigh = 'price_high',
  Relevance = 'relevance',
}

// GET /v1/catalogue/products (PRD-09, CCH-11, CCH-12): a category (its subcategories included), a search, an order, only
// what is in stock (Slice 12b) and a page. `v` is the catalogue version the caller last read (CCH-04): it gives each version its own address in the
// shopper's browser and changes nothing else. Any other parameter is ignored, so it neither changes the answer nor
// splits the cache (CCH-03).
export const publicProductListSchema = z.object({
  category: z.string().trim().min(1).max(PRODUCT_SLUG_MAX_LENGTH).optional(),
  search: z.string().trim().min(1).max(PRODUCT_NAME_MAX_LENGTH).optional(),
  sort: z.nativeEnum(PublicProductSort).optional(),
  inStock: queryFlag,
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(PUBLIC_PAGE_SIZE_MAX).default(PUBLIC_PAGE_SIZE),
  v: z.string().max(64).optional(),
});
export type PublicProductListQuery = z.infer<typeof publicProductListSchema>;

// GET /v1/catalogue/products/:slug and GET /v1/catalogue/categories (CCH-04): only the version, as above.
export const publicCatalogueVersionedSchema = z.object({
  v: z.string().max(64).optional(),
});
export type PublicCatalogueVersionedQuery = z.infer<typeof publicCatalogueVersionedSchema>;
