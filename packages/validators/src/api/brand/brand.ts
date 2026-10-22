import { z } from 'zod';
import { BRAND_FONTS } from '../../common/brand';
import { HEX_COLOR_PATTERN } from '../../common/limits';
import { BrandCorners, BrandFont, BrandSpacing } from '../../db/enums';
import { FieldProblemCode } from '../../validation/field-problem';
import { catalogueIdSchema } from '../catalogue/catalogue-common';

const colorField = z
  .string()
  .trim()
  .regex(HEX_COLOR_PATTERN)
  .transform((color) => color.toLowerCase());

// PUT brand (BRN-02, BRN-03, BRN-07): the shop's own identity, saved whole -- its three colours, its heading and body
// fonts from the curated pairs, its corners and spacing, and the logo for dark backgrounds and the square icon, each a
// ready image of its own or null. The logo on light is the shop's own logo (TEN-16). `useBrand` switches it on or off
// in the same step (the editor's Apply); left out, the switch stays as it is.
export const saveBrandSchema = z
  .object({
    mainColor: colorField,
    accentColor: colorField,
    backgroundColor: colorField,
    headingFont: z.nativeEnum(BrandFont),
    bodyFont: z.nativeEnum(BrandFont),
    corners: z.nativeEnum(BrandCorners),
    spacing: z.nativeEnum(BrandSpacing),
    darkLogoId: catalogueIdSchema.nullable(),
    iconId: catalogueIdSchema.nullable(),
    useBrand: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (BRAND_FONTS[value.bodyFont].headingsOnly) {
      ctx.addIssue({
        code: 'custom',
        path: ['bodyFont'],
        message: 'This typeface is for headings only.',
        params: { problem: FieldProblemCode.NotAllowed },
      });
    }
  });
export type SaveBrandInput = z.infer<typeof saveBrandSchema>;

// PUT brand/switch (BRN-02, BRN-05): "Use my brand", on or off, keeping the saved identity either way.
export const brandSwitchSchema = z.object({
  useBrand: z.boolean(),
});
export type BrandSwitchInput = z.infer<typeof brandSwitchSchema>;
