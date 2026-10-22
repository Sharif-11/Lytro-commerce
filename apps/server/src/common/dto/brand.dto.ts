import { z } from 'zod';
import { BrandCorners, BrandFont, BrandSpacing } from '@lytronix/validators';
import { imageViewSchema } from './media-views.dto';

// BRN-02: a curated typeface pair, named as Google Fonts names its two families.
export const brandFontPairSchema = z.object({
  id: z.nativeEnum(BrandFont),
  bangla: z.string(),
  latin: z.string(),
  headingsOnly: z.boolean(),
});

// BRN-07: the identity every surface applies, as design tokens -- the three colours with the text derived for each
// (BRN-03), the fonts, corners and spacing, and the two images; null where the shop shows Lytro's default. `version`
// moves whenever anything here does, so a page cached under it stays valid until the shop's identity changes.
export const liveBrandSchema = z.object({
  version: z.string(),
  colors: z.object({
    main: z.string(),
    accent: z.string(),
    background: z.string(),
    onMain: z.string(),
    onAccent: z.string(),
    text: z.string(),
    mainText: z.string(),
  }),
  fonts: z.object({ heading: brandFontPairSchema, body: brandFontPairSchema }),
  corners: z.nativeEnum(BrandCorners),
  spacing: z.nativeEnum(BrandSpacing),
  darkLogo: imageViewSchema.nullable(),
  icon: imageViewSchema.nullable(),
});
