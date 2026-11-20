import { z } from 'zod';
import {
  OFFER_SLUG_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_SLUG_MAX_LENGTH,
  PUBLIC_PAGE_SIZE,
  PUBLIC_PAGE_SIZE_MAX,
  STOREFRONT_CATALOGUE_LIST_QUERY_MAX_LENGTH,
  STOREFRONT_CATALOGUE_LISTS_MAX,
} from '../../common/limits';
import { STOREFRONT_PICKED_PRODUCTS_MAX } from '../shops/storefront-design';
import { queryFlag } from './catalogue-common';

// SB-9: one to twelve product IDs, comma-separated (36 characters each, and a comma between two).
const PICKED_IDS_MAX_LENGTH = STOREFRONT_PICKED_PRODUCTS_MAX * 37 - 1;
const PICKED_IDS_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(,[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}){0,11}$/i;

/**
 * PRD-09: how the public product list is ordered. Featured is the shop's own order, newest first within it; price
 * sorts by the lowest price a product sells at; relevance, the default with a search, puts the best matches first.
 * SB-9: discount puts the biggest saving first, and best selling the most units delivered over the last
 * STOREFRONT_BEST_SELLER_DAYS, each newest first among equals.
 */
export enum PublicProductSort {
  Featured = 'featured',
  Newest = 'newest',
  PriceLow = 'price_low',
  PriceHigh = 'price_high',
  Relevance = 'relevance',
  Discount = 'discount',
  BestSelling = 'best_selling',
}

// GET /v1/catalogue/products (PRD-09, CCH-11, CCH-12): a category (its subcategories included), a search, an order, only
// what is in stock (Slice 12b), only what is on sale (SB-9) and a page. `v` is the catalogue version the caller last read (CCH-04): it gives each version its own address in the
// shopper's browser and changes nothing else. Any other parameter is ignored, so it neither changes the answer nor
// splits the cache (CCH-03).
export const publicProductListSchema = z.object({
  category: z.string().trim().min(1).max(PRODUCT_SLUG_MAX_LENGTH).optional(),
  search: z.string().trim().min(1).max(PRODUCT_NAME_MAX_LENGTH).optional(),
  sort: z.enum(PublicProductSort).optional(),
  inStock: queryFlag,
  // SB-9: only products on sale, a regular price above the price (SB-21).
  onSale: queryFlag,
  // SB-9: only these products, a row the seller picked (comma-separated IDs, at most STOREFRONT_PICKED_PRODUCTS_MAX).
  productIds: z
    .string()
    .max(PICKED_IDS_MAX_LENGTH)
    .regex(PICKED_IDS_PATTERN)
    .transform((value) => [...new Set(value.toLowerCase().split(','))])
    .optional(),
  // STOREFRONT-BUILDER-PLAN DC-1: each design of a product with two or more its own card (the storefront asks when the
  // shop has design cards on; without it, one card per product, as before).
  designs: queryFlag,
  // OFFERS-PLAN OF-8: only the cards of one offer (its link name), running or ended.
  offer: z.string().trim().min(1).max(OFFER_SLUG_MAX_LENGTH).optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(PUBLIC_PAGE_SIZE_MAX).default(PUBLIC_PAGE_SIZE),
  v: z.string().max(64).optional(),
});
export type PublicProductListQuery = z.infer<typeof publicProductListSchema>;

// Load fix 3 (the owner, 2026-11-20): every product list a storefront page draws, asked for in one call by the
// storefront's own server, each written as GET /v1/catalogue/products's query string so it is read exactly as there.
export const storefrontCatalogueListsSchema = z.object({
  queries: z
    .array(z.string().max(STOREFRONT_CATALOGUE_LIST_QUERY_MAX_LENGTH))
    .min(1)
    .max(STOREFRONT_CATALOGUE_LISTS_MAX),
});
export type StorefrontCatalogueListsBody = z.infer<typeof storefrontCatalogueListsSchema>;

// GET /v1/catalogue/products/:slug and GET /v1/catalogue/categories (CCH-04): only the version, as above.
export const publicCatalogueVersionedSchema = z.object({
  v: z.string().max(64).optional(),
});
export type PublicCatalogueVersionedQuery = z.infer<typeof publicCatalogueVersionedSchema>;
