import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  BrandCorners,
  BrandFont,
  BrandPair,
  BrandSpacing,
  brandSwitchSchema,
  saveBrandSchema,
} from '@lytronix/validators';
import { imageViewSchema } from '../../../common/dto/media-views.dto';

// DTO classes built from the shared schemas, so the request/response shape is written once (ENGINEERING §4).
export class SaveBrandDto extends createZodDto(saveBrandSchema) {}
export class BrandSwitchDto extends createZodDto(brandSwitchSchema) {}

// BRN-03: every colour pair with its ratio, and the nearest passing shade of each colour in a failing one.
const brandContrastSchema = z.object({
  passes: z.boolean(),
  pairs: z.array(
    z.object({
      pair: z.nativeEnum(BrandPair),
      ratio: z.number(),
      needs: z.number(),
      passes: z.boolean(),
    }),
  ),
  suggestions: z.object({
    mainColor: z.string().optional(),
    accentColor: z.string().optional(),
    backgroundColor: z.string().optional(),
  }),
});

// BRN-02, BRN-05, BRN-06: the editor's read -- the saved identity (Lytro's default before the first save) with its
// images, the owner's switch, whether the add-on or plan allows it, whether it shows now, and its contrast check.
export const brandEditorSchema = z.object({
  useBrand: z.boolean(),
  allowed: z.boolean(),
  live: z.boolean(),
  identity: z.object({
    mainColor: z.string(),
    accentColor: z.string(),
    backgroundColor: z.string(),
    headingFont: z.nativeEnum(BrandFont),
    bodyFont: z.nativeEnum(BrandFont),
    corners: z.nativeEnum(BrandCorners),
    spacing: z.nativeEnum(BrandSpacing),
    darkLogo: imageViewSchema.nullable(),
    icon: imageViewSchema.nullable(),
  }),
  contrast: brandContrastSchema,
  savedAt: z.string().nullable(),
});
export class BrandEditorDto extends createZodDto(brandEditorSchema) {}
