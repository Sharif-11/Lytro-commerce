import { z } from 'zod';
import { StorefrontThemeKey, storefrontDesignSchema } from '@lytronix/validators';
import { imageViewSchema } from './media-views.dto';

// SB-16: a category or product a storefront design points at.
export const storefrontTargetSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});

// SB-14: the design shoppers see, as /v1/shop sends it -- its visible sections, the photos and the categories and
// products it names that shoppers can reach, and whether it is the draft through a preview link.
export const publicStorefrontSchema = z.object({
  theme: z.enum(StorefrontThemeKey),
  palette: z.number(),
  sections: storefrontDesignSchema.shape.sections,
  images: z.record(z.string(), imageViewSchema),
  categories: z.array(storefrontTargetSchema),
  products: z.array(storefrontTargetSchema),
  // OF-8, OF-22: the running offers its rows and buttons name.
  offers: z.array(storefrontTargetSchema),
  preview: z.boolean(),
  // DC-2: each design of a product its own card in the shop's lists.
  designCards: z.boolean(),
});
