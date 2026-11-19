import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  OfferState,
  createOfferSchema,
  offerCutSchema,
  offerPickableQuerySchema,
  offerPreviewSchema,
  updateOfferSchema,
} from '@lytronix/validators';
import { imageViewSchema } from './catalogue-response.dto';

// OFFERS-PLAN: DTO classes built from the shared schemas, so each request shape is written once.
export class CreateOfferDto extends createZodDto(createOfferSchema) {}
export class UpdateOfferDto extends createZodDto(updateOfferSchema) {}
export class OfferPreviewDto extends createZodDto(offerPreviewSchema) {}
export class OfferPickableQueryDto extends createZodDto(offerPickableQuerySchema) {}

const priceSpanSchema = z.object({ low: z.string(), high: z.string() });
const holderSchema = z.object({ offerId: z.string(), name: z.string() });

const offerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  state: z.enum(OfferState),
  cut: offerCutSchema,
  products: z.number(),
  designs: z.number(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  createdAt: z.string(),
});

const offerItemViewSchema = z.object({
  productId: z.string(),
  designId: z.string().nullable(),
  name: z.string(),
  designName: z.string().nullable(),
  designNumber: z.number().nullable(),
  designCount: z.number(),
  image: imageViewSchema.nullable(),
  active: z.boolean(),
  stockState: z.string(),
  price: priceSpanSchema.nullable(),
  was: priceSpanSchema.nullable(),
  offer: priceSpanSchema.nullable(),
  belowOne: z.boolean(),
  heldBy: holderSchema.nullable(),
});

export class OffersViewDto extends createZodDto(
  z.object({ offers: z.array(offerSummarySchema) }),
) {}

export class OfferViewDto extends createZodDto(
  offerSummarySchema.extend({ items: z.array(offerItemViewSchema) }),
) {}

export class OfferPreviewViewDto extends createZodDto(
  z.object({ items: z.array(offerItemViewSchema) }),
) {}

export class OfferPickableViewDto extends createZodDto(
  z.object({
    products: z.array(
      z.object({
        productId: z.string(),
        name: z.string(),
        image: imageViewSchema.nullable(),
        price: priceSpanSchema.nullable(),
        regularPrice: z.string().nullable(),
        active: z.boolean(),
        stockState: z.string(),
        isCombo: z.boolean(),
        heldBy: holderSchema.nullable(),
        designs: z.array(
          z.object({
            designId: z.string(),
            name: z.string(),
            number: z.number(),
            image: imageViewSchema.nullable(),
            price: z.string().nullable(),
            heldBy: holderSchema.nullable(),
          }),
        ),
      }),
    ),
    more: z.boolean(),
  }),
) {}
