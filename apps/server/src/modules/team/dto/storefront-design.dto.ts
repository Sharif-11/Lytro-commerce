import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  StorefrontThemeKey,
  saveStorefrontDesignSchema,
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
