import { z } from 'zod';
import {
  OFFER_ITEMS_MAX,
  OFFER_NAME_MAX_LENGTH,
  OFFER_PERCENT_MAX,
  OFFER_PERCENT_MIN,
  OFFER_SLUG_MAX_LENGTH,
  OFFER_TAKA_MAX,
  PRODUCT_NAME_MAX_LENGTH,
} from '../../common/limits';
import { catalogueIdSchema } from './catalogue-common';

/**
 * OFFERS-PLAN OF-14 (the owner, 2026-11-19): an offer is made ready without changing a price (`waiting`, "Not
 * started"), runs (its prices in the shop), then ends (the prices put back). An ended offer stays listed.
 */
export enum OfferState {
  Waiting = 'waiting',
  Running = 'running',
  Ended = 'ended',
}

/** OF-2: how much off -- a percent of each size's price today, or the same taka off each. */
export enum OfferCutKind {
  Percent = 'percent',
  Taka = 'taka',
}

/** OF-2, OF-18: a percent from 1 to 90, or whole taka from 1. */
export const offerCutSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal(OfferCutKind.Percent),
      amount: z.int().min(OFFER_PERCENT_MIN).max(OFFER_PERCENT_MAX),
    })
    .strict(),
  z
    .object({ kind: z.literal(OfferCutKind.Taka), amount: z.int().min(1).max(OFFER_TAKA_MAX) })
    .strict(),
]);
export type OfferCut = z.infer<typeof offerCutSchema>;

/** OF-9: what is picked -- a product whole (`designId` null), or one of its designs. */
export const offerItemSchema = z
  .object({ productId: catalogueIdSchema, designId: catalogueIdSchema.nullable() })
  .strict();
export type OfferItem = z.infer<typeof offerItemSchema>;

/** The picked products and designs: each once, and a product either whole or by its designs, never both. */
const offerItemsSchema = z
  .array(offerItemSchema)
  .min(1)
  .max(OFFER_ITEMS_MAX)
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    const whole = new Set<string>();
    const parts = new Set<string>();
    items.forEach((item, at) => {
      const key = `${item.productId}:${item.designId ?? ''}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: [at],
          message: 'A product or design is picked twice.',
        });
      }
      seen.add(key);
      (item.designId === null ? whole : parts).add(item.productId);
    });
    for (const productId of whole) {
      if (parts.has(productId)) {
        ctx.addIssue({
          code: 'custom',
          path: [],
          message: 'A product is picked whole and by its designs at once.',
        });
        return;
      }
    }
  });

const offerNameSchema = z.string().trim().min(1).max(OFFER_NAME_MAX_LENGTH);

// POST offers (OF-1, OF-14): a new offer, started at once or kept for later.
export const createOfferSchema = z
  .object({
    name: offerNameSchema,
    cut: offerCutSchema,
    items: offerItemsSchema,
    start: z.boolean(),
  })
  .strict();
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

// PATCH offers/:id (OF-15): its name, its cut or its products -- live at once while it runs.
export const updateOfferSchema = z
  .object({
    name: offerNameSchema.optional(),
    cut: offerCutSchema.optional(),
    items: offerItemsSchema.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, { message: 'Nothing to change.' });
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;

// POST offers/preview (OF-2): each product's prices before and in the offer, before anything is saved. `offerId` is the
// offer being changed, so its own products are not counted as in another offer.
export const offerPreviewSchema = z
  .object({ cut: offerCutSchema, items: offerItemsSchema, offerId: catalogueIdSchema.optional() })
  .strict();
export type OfferPreviewInput = z.infer<typeof offerPreviewSchema>;

// GET offers/pickable (OF-25): the picker's products -- a search, a category, a page.
export const OFFER_PICKABLE_PAGE_SIZE = 50;
export const offerPickableQuerySchema = z.object({
  search: z.string().trim().min(1).max(PRODUCT_NAME_MAX_LENGTH).optional(),
  categoryId: catalogueIdSchema.optional(),
  offerId: catalogueIdSchema.optional(),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
export type OfferPickableQuery = z.infer<typeof offerPickableQuerySchema>;

// GET /v1/offers/:slug (OF-8, OF-12): a running or ended offer by its link name.
export const publicOfferParamsSchema = z.object({
  slug: z.string().trim().min(1).max(OFFER_SLUG_MAX_LENGTH),
});
