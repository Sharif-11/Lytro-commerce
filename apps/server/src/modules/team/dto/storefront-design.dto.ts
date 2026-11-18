import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  StockState,
  StorefrontCardMode,
  StorefrontThemeKey,
  saveStorefrontDesignSchema,
  storefrontCardOrderSchema,
  storefrontDesignCardsSchema,
  storefrontDesignSchema,
} from '@lytronix/validators';
import { imageViewSchema } from '../../../common/dto/media-views.dto';
import { storefrontTargetSchema } from '../../../common/dto/storefront.dto';

// DTO classes built from the shared schemas, so the request/response shape is written once (ENGINEERING §4).
export class SaveStorefrontDesignDto extends createZodDto(saveStorefrontDesignSchema) {}

// SB-12, SB-16: the editor's read -- the design it edits (the draft, else the live one, else the starting one), where it
// stands, its photos, what it points at and the sections naming something gone or hidden.
export const storefrontEditorSchema = z.object({
  design: storefrontDesignSchema,
  // SB-12: what shoppers see now, so Publish can say what changes.
  live: storefrontDesignSchema,
  startingTheme: z.enum(StorefrontThemeKey),
  hasDraft: z.boolean(),
  isPublished: z.boolean(),
  canGoBack: z.boolean(),
  draftSavedAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  images: z.record(z.string(), imageViewSchema),
  categories: z.array(storefrontTargetSchema.extend({ shown: z.boolean() })),
  products: z.array(storefrontTargetSchema.extend({ shown: z.boolean() })),
  broken: z.array(z.string()),
});
export class StorefrontEditorDto extends createZodDto(storefrontEditorSchema) {}

// SB-12: a short-lived link to the draft.
export const storefrontPreviewLinkSchema = z.object({ token: z.string(), expiresAt: z.string() });
export class StorefrontPreviewLinkDto extends createZodDto(storefrontPreviewLinkSchema) {}

// DC-6: one card of the shop as the Product order screen shows it.
const storefrontCardSchema = z.object({
  productId: z.string(),
  designId: z.string().nullable(),
  name: z.string(),
  designName: z.string().nullable(),
  designNumber: z.number().nullable(),
  price: z.string().nullable(),
  stockState: z.enum(StockState),
  active: z.boolean(),
  image: imageViewSchema.nullable(),
  placed: z.boolean(),
  shown: z.boolean(),
  mode: z.enum(StorefrontCardMode).nullable(),
});

// GET storefront/design/cards (DC-2, DC-6): the switch, and every card in its default lists' order.
const storefrontCardsSchema = z.object({
  designCards: z.boolean(),
  cards: z.array(storefrontCardSchema),
});
export class StorefrontCardsDto extends createZodDto(storefrontCardsSchema) {}

export class StorefrontCardOrderDto extends createZodDto(storefrontCardOrderSchema) {}

export class StorefrontDesignCardsDto extends createZodDto(storefrontDesignCardsSchema) {}
