import type { OffersRepository } from '@lytronix/db';

/**
 * OFFERS-PLAN: a shop's offers, what each holds, the prices running ones have set, and the sizes and products their
 * screens show -- each inside the caller's transaction.
 */
export type OfferStore = Pick<
  OffersRepository,
  | 'list'
  | 'find'
  | 'lock'
  | 'findBySlug'
  | 'slugsLike'
  | 'insert'
  | 'update'
  | 'delete'
  | 'items'
  | 'replaceItems'
  | 'holders'
  | 'sizes'
  | 'prices'
  | 'pricesOfProducts'
  | 'insertPrices'
  | 'setOfferPrices'
  | 'deletePrices'
  | 'setSizePrices'
  | 'products'
  | 'designs'
  | 'pickable'
  | 'designPrices'
  | 'publicOffer'
  | 'byIds'
>;
